import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createAppContext } from "../src/server/context";
import { Orchestrator } from "../src/server/orchestrator";
import { initialize } from "../src/server/aro/store";
import { detect, decide, dispatch, runTool, block, executionMode } from "../src/server/aro/service";
import { snapshot } from "../src/server/aro/runtime";
import { workspaceId, receiveQueuedRequest } from "../src/server/aro/continuity";
import { resetResourceEnvironment } from "../src/server/aro/reset";
import { provisionalPlan, emergencyKit, inventoryCsv } from "../src/lib/continuity";
import { modelUnavailable } from "../src/server/aro/model-failure";
import { verifyAuditChain } from "../src/server/audit";
import * as model from "../src/server/aro/model";

const contexts: ReturnType<typeof createAppContext>[] = [];
const folders: string[] = [];
function setup(file = ":memory:", llm = false) {
  const ctx = createAppContext({ file, config: { stepDelayMs: 0, llmAvailable: llm, defaultMode: llm ? "llm" : "deterministic" } });
  contexts.push(ctx); initialize(ctx);
  const worker = new Orchestrator(ctx, 1, llm ? dispatch : async (c, j) => runTool(c, j), block);
  return { ctx, worker };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const ctx of contexts.splice(0)) if (ctx.sqlite.open) ctx.sqlite.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

it("calculates every offline plan from a serialized checkpoint without changing stock or calling a model", async () => {
  const runtime = setup();
  const before = runtime.ctx.sqlite.prepare("SELECT * FROM inventories ORDER BY resource,facility,lot").all();
  const checkpoint = JSON.parse(JSON.stringify({ savedAt: new Date().toISOString(), snapshot: snapshot(null, runtime, true) }));
  const plan = provisionalPlan(checkpoint, "medicine");
  expect(plan.metrics.coverage).toBe(100);
  expect(plan.lines.reduce((sum, line) => sum + line.units, 0)).toBe(50);
  const id = detect(runtime.ctx, "medicine"); await runtime.worker.drain();
  const online = snapshot(id, runtime, true);
  expect(plan).toEqual(online.comparison?.aro);
  expect(runtime.ctx.sqlite.prepare("SELECT * FROM inventories ORDER BY resource,facility,lot").all()).toEqual(before);
  const kit = emergencyKit(checkpoint);
  expect(kit).toContain("Manual continuity procedure");
  expect(kit).toContain("ARO cannot run without electricity");
  expect(kit).toContain("Physically count usable stock");
  expect(kit).not.toMatch(/<script|<link|<img|<iframe/);
  expect(inventoryCsv(checkpoint)).toContain('"reserve"');
  expect(inventoryCsv(checkpoint)).toContain('"power"');
  expect(provisionalPlan(checkpoint, "medicine", Date.parse(checkpoint.savedAt) + 86400001).lines).toHaveLength(0);
  const expired = structuredClone(checkpoint);
  expired.snapshot.continuity.resources.medicine.inventories.forEach((lot: { expires: string }) => { lot.expires = "2087-03-08"; });
  expect(provisionalPlan(expired, "medicine").lines).toHaveLength(0);
});

it("replays intent idempotently after restart, checks workspace scope, and still requires human approval", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "aro-continuity-test-")); folders.push(folder);
  const file = path.join(folder, "operations.db");
  let runtime = setup(file);
  const request = { requestId: randomUUID(), workspaceId: workspaceId(runtime.ctx), resource: "water" as const };
  const id = receiveQueuedRequest(runtime.ctx, request);
  runtime.ctx.sqlite.close();
  runtime = setup(file);
  expect(receiveQueuedRequest(runtime.ctx, request)).toBe(id);
  await runtime.worker.drain();
  expect(snapshot(id, runtime, true).current?.state).toBe("review");
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({ n: 0 });
  expect(() => receiveQueuedRequest(runtime.ctx, { ...request, resource: "food" })).toThrow("identity conflict");
  decide(runtime.ctx, id, "approve"); await runtime.worker.drain();
  expect(receiveQueuedRequest(runtime.ctx, request)).toBe(id);
  expect(runtime.ctx.sqlite.prepare("SELECT SUM(units) units FROM transfers").get()).toEqual({ units: 50 });
  expect(verifyAuditChain(runtime.ctx).ok).toBe(true);
  await resetResourceEnvironment(runtime);
  expect(workspaceId(runtime.ctx)).not.toBe(request.workspaceId);
  expect(() => receiveQueuedRequest(runtime.ctx, request)).toThrow("different or reset workspace");
  expect(snapshot(null, runtime, true).incidents).toHaveLength(0);
});

it.each([new TypeError("fetch failed"), Object.assign(new Error("provider down"), { status: 503 }), Object.assign(new Error("timeout"), { name: "APIConnectionTimeoutError" })])("continues using deterministic tools when a model is unavailable: %s", async failure => {
  vi.spyOn(model, "configuredModel").mockRejectedValue(failure);
  const runtime = setup(":memory:", true);
  const id = detect(runtime.ctx, "medicine");
  await runtime.worker.drain();
  expect(executionMode(runtime.ctx)).toBe("deterministic");
  expect(snapshot(id, runtime, true).current?.state).toBe("review");
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({ n: 0 });
  decide(runtime.ctx, id, "approve"); await runtime.worker.drain();
  expect(snapshot(id, runtime, true).current?.state).toBe("completed");
  expect(model.configuredModel).toHaveBeenCalledTimes(1);
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='model.fallback'").get()).toEqual({ n: 1 });
});

it("does not misclassify programming errors as cloud outages and escapes printable names", () => {
  expect(modelUnavailable(new Error("Invalid delegation"))).toBe(false);
  expect(modelUnavailable(new Error("Tool outside assigned role"))).toBe(false);
  const runtime = setup();
  runtime.ctx.sqlite.prepare("UPDATE facilities SET name=? WHERE id='deep'").run('<script>alert("bad")</script>');
  const kit = emergencyKit({ savedAt: new Date().toISOString(), snapshot: snapshot(null, runtime, true) });
  expect(kit).toContain("&lt;script&gt;"); expect(kit).not.toContain("<script>");
});
