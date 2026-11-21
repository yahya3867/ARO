import { afterEach, expect, it, vi } from "vitest";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, runTool, block } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { discussCase } from "../src/server/aro/case-discussion";
import { pendingCaseAction } from "../src/server/aro/case-actions";

const state=vi.hoisted(()=>({ctx:null as import("../src/server/context").AppContext|null}));
vi.mock("../src/server/aro/runtime",()=>({requestRuntime:()=>({ctx:state.ctx}),demoId:()=>null,snapshot:()=>({}),startDemo:()=>"unused"}));
vi.mock("../src/server/aro/cloud-http",()=>({resourceHttp:(req:Request,handler:(req:Request)=>Response)=>handler(req)}));
import { POST as chat } from "../src/app/api/discussion/route";
import { POST as operations } from "../src/app/api/operations/route";

afterEach(()=>{state.ctx?.sqlite.close();state.ctx=null;vi.unstubAllEnvs();});
async function ready() {
  const ctx=createAppContext({file:":memory:"});state.ctx=ctx;initialize(ctx);
  const worker=new Orchestrator(ctx,1,async(c,j)=>runTool(c,j),block,true);
  const id=detect(ctx,"medicine");await worker.drain();return {ctx,id};
}
it("accepts the browser host when Next uses localhost internally and rejects other origins",async()=>{
  const {id}=await ready();
  const request=(origin:string)=>new Request("http://localhost:3003/api/discussion",{method:"POST",headers:{host:"127.0.0.1:3003",origin,"Content-Type":"application/json"},body:JSON.stringify({id,question:"What is the stock now?"})});
  expect((await chat(request("http://127.0.0.1:3003"))).status).toBe(200);
  expect((await chat(request("https://other.example"))).status).toBe(403);
});
it("requires the configured operator credential to confirm a chat action outside a demo",async()=>{
  const {ctx,id}=await ready();vi.stubEnv("ARO_OPERATOR_KEY","test-operator");
  await discussCase(ctx,{id,question:"Send 40 kits to level 8"});
  const confirmation=pendingCaseAction(ctx,id)!.id;
  const request=(authorization?:string)=>new Request("http://localhost/api/operations",{method:"POST",headers:{"Content-Type":"application/json",...(authorization?{authorization}:{})},body:JSON.stringify({action:"confirm_chat",id,confirmation})});
  expect((await operations(request())).status).toBe(403);
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
  expect((await operations(request("Bearer test-operator"))).status).toBe(200);
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:1});
});
