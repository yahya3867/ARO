import { afterEach, describe, expect, it } from "vitest";
import { ScriptedModel, modelResponder, modelError, assistantMessage, functionCall } from "@openai/agents/testing";
import { setTracingDisabled } from "@openai/agents";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, decide, runTool, runModelTask, block } from "../src/server/aro/service";
import { claimNextJob } from "../src/server/workflow/jobs";
import { Orchestrator } from "../src/server/orchestrator";
import { discussCase } from "../src/server/aro/case-discussion";
import { verifyAuditChain } from "../src/server/audit";
import { resetResourceEnvironment } from "../src/server/aro/reset";
import { snapshot } from "../src/server/aro/runtime";
import { factSummary, resourceFacts } from "../src/lib/resource-explanations";
import { pendingCaseAction } from "../src/server/aro/case-actions";

setTracingDisabled(true);
const contexts:ReturnType<typeof createAppContext>[]=[];
async function ready() {
  const ctx=createAppContext({file:":memory:"}); contexts.push(ctx); initialize(ctx);
  const worker=new Orchestrator(ctx,1,async(c,j)=>runTool(c,j),block,true);
  const id=detect(ctx,"medicine"); await worker.drain();
  return {ctx,worker,id};
}
const intentModel=(topic:string,facilityId:string|null=null)=>new ScriptedModel([modelResponder(()=>[assistantMessage(JSON.stringify({topic,facilityId,amounts:[],choice:null}))])]);
afterEach(()=>contexts.splice(0).forEach(c=>c.sqlite.close()));

describe("grounded AI discussion",()=>{
  it("understands the reported follow-up sequence and validates both destinations without changing the saved request",async()=>{
    const {ctx,id}=await ready();ctx.config.defaultMode="llm";
    const before=ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get();
    expect((await discussCase(ctx,{id,question:"Move 52 kits."},intentModel("quantity"))).answer).toContain("only 50");
    const follow=await discussCase(ctx,{id,question:"how about 49"},intentModel("quantity"));
    expect(follow.answer).toContain("49 kits are within");
    const split=await discussCase(ctx,{id,question:"37 to level 8, 12 to north commons"},intentModel("quantity","deep"));
    expect(split.answer).toContain("37 kits to Level 8");
    expect(split.answer).toContain("41 kits, below its essential minimum of 42");
    expect(split.answer).toContain("12 kits to North Commons");
    expect(split.answer).toContain("Confirm below");
    expect(ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get()).toEqual(before);
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({n:0});
  });
  it("resolves a follow-up destination from history without a model and validates combined constraints",async()=>{
    const {ctx,id}=await ready();
    await discussCase(ctx,{id,question:"Send 40 kits to level 8"});
    expect((await discussCase(ctx,{id,question:"how about 39"})).answer).toContain("39 kits to Level 8");
    expect((await discussCase(ctx,{id,question:"37 to level 8 and 14 to North Commons"})).answer).toContain("only 50");
    expect((await discussCase(ctx,{id,question:"43 to level 8 and 6 to North Commons"})).answer).toContain("cannot all travel");
    expect((await discussCase(ctx,{id,question:"37 to level 8, 12 to east depot"})).answer).toContain("Which facility");
    expect((await discussCase(ctx,{id,question:"37 to level 8, -2 to North Commons"})).answer).toContain("positive whole");
  });
  it("correctly checks 40 delivered + 4 on hand, rebalances the remaining supply and never edits the proposal",async()=>{
    const {ctx,id}=await ready();ctx.config.defaultMode="llm";
    const before=ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get();
    const out=await discussCase(ctx,{id,question:"Can we send 40 kits to level 8?"},intentModel("quantity","deep"));
    expect(out.answer).toContain("40 kits to Level 8");
    expect(out.answer).toContain("10 kits to North Commons");
    expect(pendingCaseAction(ctx,id)?.payload.amounts).toEqual([{facility:"upper",units:10},{facility:"deep",units:40}]);
    expect(ctx.sqlite.prepare("SELECT lines FROM transfer_requests").get()).toEqual(before);
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({n:0});
  });
  it("refuses 52 against 50 available without unnecessary human-validation claims",async()=>{
    const {ctx,id}=await ready();ctx.config.defaultMode="llm";
    const out=await discussCase(ctx,{id,question:"Transfer 52 kits"},intentModel("decision"));
    expect(out.answer).toContain("only 50"); expect(out.answer).toContain("unchanged");
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
  });
  it("checks route capacity, minimums, positive whole units and current rather than stale stock",async()=>{
    const {ctx,id,worker}=await ready();
    expect((await discussCase(ctx,{id,question:"Send 43 kits to level 8"})).answer).toContain("only 42");
    expect((await discussCase(ctx,{id,question:"Send 20 kits to level 8"})).answer).toContain("below the Directorate baseline");
    expect((await discussCase(ctx,{id,question:"Send -2 kits"})).answer).toContain("positive whole");
    expect((await discussCase(ctx,{id,question:"Send 2.5 kits"})).answer).toContain("positive whole");
    decide(ctx,id,"approve");await worker.drain();
    expect((await discussCase(ctx,{id,question:"Send 40 kits to level 8"})).answer).toContain("only 0");
    const current=await discussCase(ctx,{id,question:"What is the stock now?"});
    expect(current.answer).toContain("42 kits");expect(current.answer).toContain("post-transfer");
    expect(verifyAuditChain(ctx).ok).toBe(true);
  });
  it("keeps ARO and Directorate coverage distinct and explains outstanding target demand",async()=>{
    const {ctx,id}=await ready();ctx.config.defaultMode="llm";
    const out=await discussCase(ctx,{id,question:"Why is the ARO allocation fairer?"},intentModel("allocation"));
    expect(out.answer).toContain("ARO covers 100%");expect(out.answer).toContain("82.3% under the Directorate");
    expect(out.answer).toContain("23 kits");expect(out.answer).toContain("different measures");
    expect(out.answer).toContain("awaiting your approval");expect(out.answer).not.toContain("Logistics will check");
    const guarded=await discussCase(ctx,{id,question:"Explain resource allocation"},intentModel("evidence"));
    expect(guarded.answer).toContain("ARO covers 100%");
  });
  it("does not confuse a receipt question containing numbers with a transfer request",async()=>{
    const {ctx,id}=await ready();
    const out=await discussCase(ctx,{id,question:"Why are 16 kits missing?"});
    expect(out.answer).toContain("Shipment receipts are 16 kits short");
  });
  it("requires explicit approval controls and honestly describes unsupported policy changes",async()=>{
    const {ctx,id}=await ready();
    expect((await discussCase(ctx,{id,question:"Approve the transfer"})).answer).toContain("Confirm below");
    expect((await discussCase(ctx,{id,question:"Always give level 8 everything from now on"})).answer).toContain("haven’t changed a policy");
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfer_approvals").get()).toEqual({n:0});
  });
  it("falls back during provider failure and rejects evidence from a different incident",async()=>{
    const {ctx,id}=await ready();ctx.config.defaultMode="llm";
    const out=await discussCase(ctx,{id,question:"Can we send 40 kits to level 8?"},new ScriptedModel([modelError(Error("provider offline"))]));
    expect(out.answer).toContain("40 kits to Level 8");
    await expect(discussCase(ctx,{id,question:"explain",event:999999})).rejects.toThrow("does not belong");
  });
  it("does not write an answer into a reset workspace after an asynchronous model response",async()=>{
    const {ctx,id,worker}=await ready();ctx.config.defaultMode="llm";
    const model=new ScriptedModel([modelResponder(async()=>{
      await resetResourceEnvironment({ctx,worker});
      return [assistantMessage(JSON.stringify({topic:"allocation",facilityId:null,amounts:[],choice:null}))];
    })]);
    await expect(discussCase(ctx,{id,question:"why",event:undefined},model)).rejects.toThrow();
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM case_messages").get()).toEqual({n:0});
  });
});
describe("post-tool AI summaries",()=>{
  it("retains the committed result if the model fails after executing its tool",async()=>{
    const ctx=createAppContext({file:":memory:"});contexts.push(ctx);initialize(ctx);
    const id=detect(ctx,"medicine"),job=claimNextJob(ctx)!;
    await runModelTask(ctx,job,new ScriptedModel([
      modelResponder(()=>[functionCall("reconcile_stock",{},{callId:"receipt"})]),modelError(Error("provider timeout"))
    ]));
    expect(ctx.sqlite.prepare("SELECT step FROM incidents WHERE id=?").get(id)).toEqual({step:1});
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM artifacts").get()).toEqual({n:1});
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({n:0});
  });
  it("cannot invent tool completion by returning a summary without calling the tool",async()=>{
    const ctx=createAppContext({file:":memory:"});contexts.push(ctx);initialize(ctx);detect(ctx,"medicine");
    await expect(runModelTask(ctx,claimNextJob(ctx)!,intentModel("overview"))).rejects.toThrow();
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM artifacts").get()).toEqual({n:0});
  });
  it("groups multiple routes to one destination and does not call equal coverage an improvement",()=>{
    const facts=resourceFacts("prepare_request",{lines:[{facility:"deep",units:31},{facility:"deep",units:12},{facility:"upper",units:19}],replenishmentDraft:11},"food parcels",{deep:"Level 8",upper:"North Commons"});
    expect(facts.summary).toBe("I propose 43 food parcels to Level 8 and 19 food parcels to North Commons.");
    expect(resourceFacts("review_equity",{aro:{coverage:100,below:0,unmet:11},directorate:{coverage:100},gainPoints:0},"food parcels",{}).summary).toContain("does not improve");
  });
  it("discards fabricated fact references without undoing a committed tool or producing a duplicate event",async()=>{
    const ctx=createAppContext({file:":memory:"});contexts.push(ctx);initialize(ctx);
    const id=detect(ctx,"medicine"), job=claimNextJob(ctx)!;
    await runModelTask(ctx,job,new ScriptedModel([
      modelResponder(()=>[functionCall("reconcile_stock",{},{callId:"receipt"})]),
      modelResponder(()=>[assistantMessage(JSON.stringify({factIds:["North Commons is below minimum after allocation"]}))])
    ]));
    expect(ctx.sqlite.prepare("SELECT step FROM incidents WHERE id=?").get(id)).toEqual({step:1});
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM agent_summaries").get()).toEqual({n:0});
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM artifacts").get()).toEqual({n:1});
    expect(ctx.sqlite.prepare("SELECT action FROM audit_events ORDER BY id DESC LIMIT 1").get()).toEqual({action:"model.summary.fallback"});
    const data=snapshot(id,{ctx,worker:new Orchestrator(ctx,1,async(c,j)=>runTool(c,j),block,true)},true);
    expect(data.events.find(e=>e.title==="reconcile stock")?.result.counted).toBe(4);
  });
  it("rejects unknown summary IDs and never renders model-authored arithmetic",()=>{
    const facts=resourceFacts("review_equity",{aro:{coverage:100,below:0,unmet:23},directorate:{coverage:82.3},gainPoints:17.7},"kits",{});
    expect(factSummary(facts,["thresholds"])).toContain("100% against");
    expect(()=>factSummary(facts,["82.3% ARO"])).toThrow("unknown operational fact");
  });
});
