import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { activityEvents } from "../src/server/db/schema";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, decide, runTool, block } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { resourceLifeEvents } from "../src/lib/resource-life";
import { PixelAgent, type SpriteMood } from "../src/components/pixel-agent";
import { employeeStatus } from "../src/server/aro/employees";
import { claimNextJob, finishJob } from "../src/server/workflow/jobs";

const contexts: ReturnType<typeof createAppContext>[] = [];
function setup() {
  const c = createAppContext({file:":memory:"});
  contexts.push(c);
  initialize(c);
  const worker = new Orchestrator(c,1,async(c,j)=>runTool(c,j),block);
  return {c,worker,events:()=>resourceLifeEvents(c.db.select().from(activityEvents).all())};
}
afterEach(()=>contexts.splice(0).forEach(c=>c.sqlite.close()));

it("drives ARO's approval, finding and celebration semantics from a real resource workflow",async()=>{
  const {c,worker,events}=setup();
  const id=detect(c,"medicine");
  await worker.drain();
  expect(events().find(e=>e.toolName==="reconcile_stock")).toMatchObject({actorId:"aro.compute",type:"FINDING",args:{reaction:"alert"}});
  expect(events().find(e=>e.toolName==="review_equity")).toMatchObject({actorId:"aro.policy",type:"FINDING",args:{reaction:"ok"}});
  decide(c,id,"approve");
  await worker.drain();
  expect(events().find(e=>e.type==="APPROVAL_DECISION")?.changes).toEqual(["Approval "+id+": APPROVED"]);
  expect(events().find(e=>e.toolName==="publish_report")?.type).toBe("COMPLETED");
  expect(new Set(events().filter(e=>e.actorId.startsWith("aro.")).map(e=>e.actorId)).size).toBe(6);
});

it("preserves rejection cues and reports the actual running tool",async()=>{
  const {c,worker,events}=setup();
  const id=detect(c,"water");
  const job=claimNextJob(c)!;
  expect(employeeStatus(c,"compute").runTools).toEqual(["reconcile_stock"]);
  runTool(c,job);
  finishJob(c,job.id,"done");
  await worker.drain();
  decide(c,id,"reject");
  expect(events().find(e=>e.type==="APPROVAL_DECISION")?.changes).toEqual(["Approval "+id+": REJECTED"]);
  expect(events().some(e=>e.type==="COMPLETED")).toBe(false);
});

it("forwards every ARO reaction to ARO sprites and honors still rendering",()=>{
  for(const mood of ["hop","party","nod","shake","tilt","slump"] as SpriteMood[]) {
    const html=renderToStaticMarkup(createElement(PixelAgent,{actorId:"aro.finance",mood}));
    expect(html).toContain("px-mood-"+mood);
  }
  const still=renderToStaticMarkup(createElement(PixelAgent,{actorId:"aro.finance",still:true}));
  expect(still).not.toContain("px-bob");
  const asleep=renderToStaticMarkup(createElement(PixelAgent,{actorId:"aro.finance",mood:"sleep"}));
  expect(asleep).not.toContain("px-bob");
});
