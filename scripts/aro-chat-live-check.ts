import assert from "node:assert/strict";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, runTool, block } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { discussCase } from "../src/server/aro/case-discussion";
import { confirmCaseAction, pendingCaseAction } from "../src/server/aro/case-actions";
import { verifyAuditChain } from "../src/server/audit";

async function main() {
  const ctx=createAppContext({file:":memory:"});initialize(ctx);
  const worker=new Orchestrator(ctx,1,async(c,j)=>runTool(c,j),block,true);
  try {
    const id=detect(ctx,"medicine");await worker.drain();ctx.config.defaultMode="llm";
    for(const question of ["Move 52 kits.","how about 49","37 to level 8, 12 to north commons","make that 38 to the clinic, keep North Commons the same"]) {
      const result=await discussCase(ctx,{id,question});
      const mode=ctx.sqlite.prepare("SELECT mode FROM case_messages ORDER BY id DESC LIMIT 1").get() as {mode:string};
      const action=pendingCaseAction(ctx,id);
      const details=JSON.parse((ctx.sqlite.prepare("SELECT details FROM audit_events WHERE action='case.discuss' ORDER BY id DESC LIMIT 1").get() as {details:string}).details);
      console.log(JSON.stringify({question,answer:result.answer,mode:mode.mode,replyMode:details.replyMode,action:action?{kind:action.kind,payload:action.payload}:null}));
      assert.equal(mode.mode,"llm");
      if(question.startsWith("Move 52")||question==="how about 49") assert.equal(action,undefined);
      else assert.ok(action);
      if(question.startsWith("make that")) assert.deepEqual(action!.payload.amounts.slice().sort((a,b)=>a.facility.localeCompare(b.facility)),[{facility:"deep",units:38},{facility:"upper",units:12}]);
    }
    assert.equal((ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get() as {n:number}).n,0);
    const action=pendingCaseAction(ctx,id)!;confirmCaseAction(ctx,id,action.id);await worker.drain();
    assert.equal((ctx.sqlite.prepare("SELECT SUM(units) n FROM transfers").get() as {n:number}).n,50);
    assert.equal(verifyAuditChain(ctx).ok,true);
    console.log(JSON.stringify({result:"passed",scope:"isolated in-memory case; live OpenRouter interpretation and agent replies; confirmed final split"}));
  } finally {worker.stop();ctx.sqlite.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Live chat check failed");process.exitCode=1;});
