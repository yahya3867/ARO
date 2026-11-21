import { afterEach, expect, it } from "vitest";
import { ScriptedModel, modelResponder, assistantMessage } from "@openai/agents/testing";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, runTool, block, needs } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { discussCase } from "../src/server/aro/case-discussion";
import { confirmCaseAction, pendingCaseAction } from "../src/server/aro/case-actions";
import { transferRequest } from "../src/server/aro/transfer-request";
import { verifyAuditChain } from "../src/server/audit";
import { resetResourceEnvironment } from "../src/server/aro/reset";
import type { Resource } from "../src/server/aro/catalog";

const contexts:ReturnType<typeof createAppContext>[]=[];
afterEach(()=>contexts.splice(0).forEach(c=>c.sqlite.close()));
async function ready(resource:Resource="medicine") {
  const ctx=createAppContext({file:":memory:"});contexts.push(ctx);initialize(ctx);
  const worker=new Orchestrator(ctx,1,async(c,j)=>runTool(c,j),block,true);
  const id=detect(ctx,resource);await worker.drain();return {ctx,worker,id};
}
it.each(["medicine","food","water","power"] as Resource[])("confirms a revised %s request through the existing execution workflow",async resource=>{
  const {ctx,id,worker}=await ready(resource);await discussCase(ctx,{id,question:"Send 40 units to level 8"});
  const action=pendingCaseAction(ctx,id)!;expect(action).toBeDefined();
  confirmCaseAction(ctx,id,action.id);await worker.drain();
  expect(ctx.sqlite.prepare("SELECT state FROM incidents WHERE id=?").get(id)).toEqual({state:"completed"});
  expect(transferRequest(ctx,id).lines.filter(l=>l.facility==="deep").reduce((s,l)=>s+l.units,0)).toBe(40);
  expect(verifyAuditChain(ctx).ok).toBe(true);
});
it("confirms exactly the revised split once and preserves the original request",async()=>{
  const {ctx,id,worker}=await ready();
  const original=ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get();
  await discussCase(ctx,{id,question:"37 to level 8, 12 to north commons"});
  const action=pendingCaseAction(ctx,id)!;
  expect(action.kind).toBe("revise");expect(action.payload.warnings[0]).toContain("41 kits");
  expect(transferRequest(ctx,id).lines.reduce((s,l)=>s+l.units,0)).toBe(50);
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({n:0});
  confirmCaseAction(ctx,id,action.id);confirmCaseAction(ctx,id,action.id);await worker.drain();
  expect(ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get()).toEqual(original);
  expect(needs(ctx,"medicine").find(n=>n.facility==="deep")!.stock).toBe(41);
  expect(ctx.sqlite.prepare("SELECT SUM(units) n FROM transfers").get()).toEqual({n:49});
  const report=JSON.parse((ctx.sqlite.prepare("SELECT data FROM artifacts WHERE tool='publish_report'").get() as {data:string}).data);
  expect(report.fairness.aro.coverage).toBe(98.4);
  expect(verifyAuditChain(ctx).ok).toBe(true);
});
it("cancels a plan without changing inventory or authorizing it",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Send 40 kits to level 8"});
  const action=pendingCaseAction(ctx,id)!;
  confirmCaseAction(ctx,id,action.id,true);confirmCaseAction(ctx,id,action.id,true);
  expect(()=>confirmCaseAction(ctx,id,action.id)).toThrow("no longer current");
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
  expect(transferRequest(ctx,id).lines.find(l=>l.facility==="deep")?.units).toBe(38);
});
it("supersedes old cards on a new question and rejects changed stock and cross-incident confirmations",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Send 40 kits to level 8"});
  const old=pendingCaseAction(ctx,id)!;
  await discussCase(ctx,{id,question:"how about 39"});
  expect(()=>confirmCaseAction(ctx,id,old.id)).toThrow("no longer current");
  const current=pendingCaseAction(ctx,id)!;
  expect(()=>confirmCaseAction(ctx,"INC-9999",current.id)).toThrow("not found");
  ctx.sqlite.prepare("UPDATE routes SET capacity=0 WHERE id='medicine-deep'").run();
  expect(()=>confirmCaseAction(ctx,id,current.id)).toThrow("changed");
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_revisions").get()).toEqual({n:0});
});
it("keeps approval and decline pending until the separate confirmation",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Approve the transfer"});
  expect(pendingCaseAction(ctx,id)?.kind).toBe("approve");
  await discussCase(ctx,{id,question:"Decline the transfer"});
  const action=pendingCaseAction(ctx,id)!;expect(action.kind).toBe("reject");
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
  confirmCaseAction(ctx,id,action.id);
  expect(ctx.sqlite.prepare("SELECT state FROM incidents WHERE id=?").get(id)).toEqual({state:"rejected"});
});
it("keeps a yes-but quantity correction instead of confirming the earlier split",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Send 39 kits to level 8"});ctx.config.defaultMode="llm";
  const model=new ScriptedModel([modelResponder(()=>[assistantMessage(JSON.stringify({topic:"decision",facilityId:"deep",amounts:[{facility:"deep",units:40}],choice:"approve"}))])]);
  await discussCase(ctx,{id,question:"Yes, but send 40 kits to the clinic"},model);
  expect(pendingCaseAction(ctx,id)?.payload.amounts).toEqual([{facility:"upper",units:10},{facility:"deep",units:40}]);
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
});
it("uses model-resolved conversation context and a natural agent reply without giving it write authority",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Send 40 kits to level 8"});ctx.config.defaultMode="llm";
  const model=new ScriptedModel([
    modelResponder(()=>[assistantMessage(JSON.stringify({topic:"quantity",facilityId:"deep",amounts:[{facility:"deep",units:39}],choice:null}))]),
    modelResponder(()=>[assistantMessage(JSON.stringify({reply:"I can send 39 kits to the clinic and 11 to North Commons. Confirm and I’ll use that split."}))]),
  ]);
  const out=await discussCase(ctx,{id,question:"one fewer there",},model);
  expect(out.answer).toContain("I can send 39 kits");
  expect(pendingCaseAction(ctx,id)?.payload.amounts).toEqual([{facility:"upper",units:11},{facility:"deep",units:39}]);
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({n:0});
});
it("does not offer infeasible quantities, below-baseline plans or confirmation from evidence chat",async()=>{
  const {ctx,id}=await ready();await discussCase(ctx,{id,question:"Send 52 kits"});expect(pendingCaseAction(ctx,id)).toBeUndefined();
  await discussCase(ctx,{id,question:"1 to level 8, 1 to North Commons"});expect(pendingCaseAction(ctx,id)).toBeUndefined();
  const evidence=(ctx.sqlite.prepare("SELECT id FROM activity_events WHERE title='forecast demand'").get() as {id:number}).id;
  await discussCase(ctx,{id,question:"Send 40 kits to level 8",event:evidence});expect(pendingCaseAction(ctx,id)).toBeUndefined();
});
it("removes chat confirmations and revisions on demo reset",async()=>{
  const {ctx,id,worker}=await ready();await discussCase(ctx,{id,question:"Send 40 kits to level 8"});
  confirmCaseAction(ctx,id,pendingCaseAction(ctx,id)!.id);await worker.drain();
  await resetResourceEnvironment({ctx,worker});
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM case_actions").get()).toEqual({n:0});
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_revisions").get()).toEqual({n:0});
});
