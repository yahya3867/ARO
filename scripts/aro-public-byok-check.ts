import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

/** Isolated visitor-only live check. Never publishes or prints the API key. */
async function main() {
  const base=process.argv[2]??"https://tryaro.app";
  if(!/^https:\/\/tryaro\.app$/.test(base)) throw Error("Use the authorized ARO public domain.");
  const key=process.env.OPENROUTER_API_KEY;if(!key) throw Error("A test visitor key is required.");
  const session=await fetch(base+"/api/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"session"})});
  assert.equal(session.status,200,"Could not create the isolated visitor workspace");
  const cookie=session.headers.getSetCookie().find(c=>c.startsWith("aro_demo="))?.split(";")[0];assert.ok(cookie);
  async function request(path:string,body?:unknown) {
    const r=await fetch(base+path,{method:body?"POST":"GET",headers:{cookie:cookie!,...(body?{"Content-Type":"application/json"}: {})},body:body?JSON.stringify(body):undefined});
    const out=await r.json();assert.equal(r.status,200,typeof out.error==="string"?out.error:"Public request failed");return out;
  }
  let connected=false;
  try {
    const anonymous=await request("/api/operations");assert.equal(anonymous.mode,"Deterministic");assert.equal(anonymous.modelAccess.supported,true);assert.equal(anonymous.modelAccess.connected,false);
    console.log(JSON.stringify({phase:"anonymous",mode:anonymous.mode}));
    await request("/api/model-session",{action:"connect",apiKey:key});connected=true;
    let data=await request("/api/operations");assert.equal(data.mode,"Model-assisted");assert.equal(data.modelAccess.connected,true);
    console.log(JSON.stringify({phase:"connected",mode:data.mode,model:data.modelAccess.model}));
    const scan=await request("/api/operations",{action:"scan",resource:"medicine"});
    async function until(state:string) {
      for(let count=0;count<90;count++) {
        const next=await request("/api/operations?incident="+scan.id);
        if(next.current?.state==="blocked") throw Error("Hosted AI workflow was blocked");
        if(next.current?.state===state) return next;
        await sleep(1500);
      }
      throw Error("Hosted AI workflow timed out waiting for "+state);
    }
    data=await until("review");assert.equal(data.mode,"Model-assisted");assert.ok(!JSON.stringify(data).includes(key),"Credential leaked into snapshot");
    let audit=await request("/api/resource-audit?incident="+scan.id);
    assert.equal(audit.events.filter((e:{action:string})=>e.action==="model.tool.completed").length,7,"Hosted agents did not use the visitor model");
    console.log(JSON.stringify({phase:"approval",modelStages:7,mode:data.mode}));
    await request("/api/discussion",{id:scan.id,question:"Can we send 40 kits to level 8?"});
    data=await request("/api/operations?incident="+scan.id);
    const action=data.chatActions.findLast((a:{status:string})=>a.status==="pending");assert.ok(action);
    assert.ok(action.payload.amounts.some((a:{facility:string;units:number})=>a.facility==="deep"&&a.units===40));
    audit=await request("/api/resource-audit?incident="+scan.id);
    assert.equal(audit.events.find((e:{action:string})=>e.action==="case.discuss")?.details.mode,"llm");
    await request("/api/operations",{action:"confirm_chat",id:scan.id,confirmation:action.id});
    data=await until("completed");audit=await request("/api/resource-audit?incident="+scan.id);
    assert.equal(audit.events.filter((e:{action:string})=>e.action==="model.tool.completed").length,8);
    assert.equal(audit.ledger.reduce((sum:number,l:{units:number})=>sum+l.units,0),50);
    assert.equal(audit.chain.ok,true);assert.ok(!JSON.stringify({data,audit}).includes(key),"Credential leaked into operational records");
    console.log(JSON.stringify({phase:"completed",modelStages:8,units:50,auditValid:true,credentialExposed:false}));
  } finally {
    if(connected) {
      await request("/api/model-session",{action:"remove"});
      const data=await request("/api/operations");assert.equal(data.mode,"Deterministic");assert.equal(data.modelAccess.connected,false);
      console.log(JSON.stringify({phase:"removed",mode:data.mode,connected:false}));
    }
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Public BYOK check failed");process.exitCode=1;});
