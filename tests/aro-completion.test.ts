import { afterEach, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createAppContext } from "../src/server/context";
import { Orchestrator } from "../src/server/orchestrator";
import { initialize } from "../src/server/aro/store";
import { detect, decide, runTool, block } from "../src/server/aro/service";
import { snapshot } from "../src/server/aro/runtime";
import { resourceCompletion } from "../src/lib/resource-completion";
import { ResourceCompletionScene, ResourceDoneFinale } from "../src/components/aro/resource-done-card";
import { ResourceTaskTimeline } from "../src/components/aro/resource-task-timeline";
import { discussCase } from "../src/server/aro/case-discussion";
import { confirmCaseAction, pendingCaseAction } from "../src/server/aro/case-actions";

const contexts: ReturnType<typeof createAppContext>[] = [];
function setup() {
  const ctx = createAppContext({ file: ":memory:", config: { defaultMode: "deterministic", stepDelayMs: 0 } });
  contexts.push(ctx);
  initialize(ctx);
  const worker = new Orchestrator(ctx, 1, async (c, j) => runTool(c, j), block);
  return { ctx, worker };
}
afterEach(() => contexts.splice(0).forEach(ctx => ctx.sqlite.close()));

it("only shows a finale after authorized execution and report publication", async () => {
  const runtime = setup();
  const id = detect(runtime.ctx, "water");
  await runtime.worker.drain();
  expect(resourceCompletion(snapshot(id, runtime, true))).toBeNull();
  decide(runtime.ctx, id, "approve");
  expect(resourceCompletion(snapshot(id, runtime, true))).toBeNull();
  await runtime.worker.drain();
  const data = snapshot(id, runtime, true);
  const s = resourceCompletion(data)!;
  const posted = runtime.ctx.sqlite.prepare("SELECT SUM(units) units FROM transfers WHERE incident=?").get(id);
  expect(s).toMatchObject({ title: "50 water crates transferred", units: 50, communities: 2, coverage: 100, calls: 1 });
  expect(posted).toMatchObject({ units: s.units });
  expect(s.agents).toHaveLength(6);
  expect(s.steps.map(step => step.actor)).toContain("operator");
  expect(s.steps.at(-1)?.actor).toBe("director");
  expect(s.steps.find(step => step.actor === "operator")?.text).toBe("Approved the transfer.");
  // Changing a proposed-plan projection must never change the posted figures.
  expect(resourceCompletion({ ...data, lines: [] })?.units).toBe(50);
});

it("does not celebrate rejected or incomplete records", async () => {
  const runtime = setup();
  const id = detect(runtime.ctx, "food");
  await runtime.worker.drain();
  decide(runtime.ctx, id, "reject");
  const data = snapshot(id, runtime, true);
  expect(resourceCompletion(data)).toBeNull();
  expect(renderToStaticMarkup(createElement(ResourceDoneFinale, { data, justFinished: false }))).toBe("");
});

it("uses ARO's burst and staggered reveal only for a newly completed result", async () => {
  const runtime = setup();
  const id = detect(runtime.ctx, "medicine");
  await runtime.worker.drain();
  decide(runtime.ctx, id, "approve");
  await runtime.worker.drain();
  const data = snapshot(id, runtime, true);
  const fresh = renderToStaticMarkup(createElement(ResourceDoneFinale, { data, justFinished: true }));
  expect(fresh).toContain("done-pop");
  expect(fresh).toContain("done-ring");
  expect(fresh.match(/done-spark/g)).toHaveLength(12);
  expect(fresh).toContain("animation-delay:300ms");
  expect(fresh).toContain("6 agents and 1 call from you");
  const historic = renderToStaticMarkup(createElement(ResourceDoneFinale, { data, justFinished: false }));
  expect(historic).not.toContain("done-pop");
  expect(historic).not.toContain("done-spark");
  expect(historic).not.toContain("done-rise");
  expect(historic).toContain("50 kits transferred");
  // Later supplier actions do not rewrite how long the completed transfer took.
  const later = { ...data, events: [...data.events, { ...data.events[0], id: data.events[0].id + 100,
    type: "APPROVAL_DECISION", title: "Later supplier action", time: "2090-01-01T00:00:00Z" }] };
  expect(resourceCompletion(later)).toEqual(resourceCompletion(data));
});

it("places exactly one finale after the food workflow, followed by chat like ARO",async()=>{
  const runtime=setup(),id=detect(runtime.ctx,"food");await runtime.worker.drain();
  await discussCase(runtime.ctx,{id,question:"Can you move 45 to level 8 instead?"});
  confirmCaseAction(runtime.ctx,id,pendingCaseAction(runtime.ctx,id)!.id);await runtime.worker.drain();
  const data=snapshot(id,runtime,true);
  const markup=renderToStaticMarkup(createElement(ResourceTaskTimeline,{data,showHistory:true,justFinished:true,paused:false,onEvidence:()=>{},conversation:createElement("div",null,"Operator confirmed the revised split.")}));
  expect(markup.match(/aria-label="Completed resource operation"/g)).toHaveLength(1);
  expect(markup.indexOf("Operator confirmed the revised split.")).toBeGreaterThan(markup.indexOf('aria-label="Completed resource operation"'));
  expect(markup.indexOf("Inventory Auditor")).toBeLessThan(markup.indexOf('aria-label="Completed resource operation"'));
  expect(resourceCompletion(data)?.units).toBe(62);
  expect(runtime.ctx.sqlite.prepare("SELECT SUM(units) units FROM transfers WHERE incident=?").get(id)).toEqual({units:62});
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM artifacts WHERE incident=? AND tool='publish_report'").get(id)).toEqual({n:1});
});

it("keeps the canvas completion scene separate from the permanent summary",()=>{
  const markup=renderToStaticMarkup(createElement(ResourceCompletionScene,{title:"62 food parcels transferred"}));
  expect(markup).toContain('aria-label="Resource operation completed"');
  expect(markup).toContain("width:64px");
  expect(markup.match(/done-spark/g)).toHaveLength(12);
  expect(markup).toContain("62 food parcels transferred");
  expect(markup).not.toContain('aria-label="Completed resource operation"');
});
