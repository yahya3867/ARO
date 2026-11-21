import { setTracingDisabled } from "@openai/agents";
import {
  functionCall,
  assistantMessage,
  modelResponder,
  ScriptedModel,
} from "@openai/agents/testing";
import {
  runModelTask,
  resumeQuotaJobs,
  executionMode,
} from "../src/server/aro/service";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAppContext } from "../src/server/context";
import { Orchestrator } from "../src/server/orchestrator";
import {
  claimNextJob,
  recoverInterruptedJobs,
} from "../src/server/workflow/jobs";
import { verifyAuditChain } from "../src/server/audit";
import { dispatchPlan } from "../src/server/aro/network";
import { ingest, releaseOrder } from "../src/server/aro/intake";
import { initialize } from "../src/server/aro/store";
import {
  runTool,
  block,
  detect,
  decide,
  replan,
} from "../src/server/aro/service";

const opened: ReturnType<typeof createAppContext>[] = [];
function setup(file = ":memory:") {
  const c = createAppContext({ file });
  opened.push(c);
  initialize(c);
  const worker = new Orchestrator(c, 1, async (c, j) => runTool(c, j), block);
  const field = (sql: string, ...args: string[]) =>
    c.sqlite
      .prepare(sql)
      .pluck()
      .get(...args);
  return { c, worker, field };
}
afterEach(() => {
  for (const c of opened.splice(0)) if (c.sqlite.open) c.sqlite.close();
});
describe("resource operations", () => {
  it("resumes a quota-blocked investigation once and stops for human approval", async () => {
    const { c, worker, field } = setup();
    const id = detect(c, "medicine");
    const j = claimNextJob(c)!;
    c.sqlite
      .prepare("UPDATE jobs SET status='failed',error=? WHERE id=?")
      .run("429 You have no credits remaining.", j.id);
    block(c, j, "429 You have no credits remaining.");
    resumeQuotaJobs(c);
    resumeQuotaJobs(c);
    expect(executionMode(c)).toBe("deterministic");
    expect(field("SELECT COUNT(*) FROM jobs WHERE status='queued'")).toBe(1);
    await worker.drain();
    expect(field("SELECT state FROM incidents WHERE id=?", id)).toBe("review");
    expect(field("SELECT COUNT(*) FROM transfers")).toBe(0);
  });
  it("reads the tool result before selecting verified summary facts", async () => {
    setTracingDisabled(true);
    const { c, field } = setup();
    detect(c, "medicine");
    const job = claimNextJob(c)!;
    const model = new ScriptedModel([
      modelResponder(() => [
        functionCall(
          "reconcile_stock",
          {},
          { callId: "audit_receipt" },
        ),
      ]),
      modelResponder(() => [assistantMessage(JSON.stringify({factIds:["receipts"]}))]),
    ]);
    await runModelTask(c, job, model);
    const result = JSON.parse(
      String(field("SELECT data FROM artifacts WHERE tool='reconcile_stock'")),
    );
    expect(result.agentRationale).toBeUndefined();
    expect(field("SELECT summary FROM agent_summaries WHERE tool='reconcile_stock'")).toContain("16 kits short");
    expect(result.counted).toBe(4);
  });
  it("reroutes a flexible donor so a second community can meet its essential need", () => {
    const needs = ["a", "b"].map((facility) => ({
      facility,
      name: facility,
      level: 8,
      population: 20,
      daily: 1,
      minimum: 1,
      target: 1,
      stock: 0,
    }));
    const lanes = [
      ["x", "a", 0],
      ["x", "b", 1],
      ["y", "a", 2],
    ].map(([s, d, p]) => ({
      route: s + "-" + d,
      source: String(s),
      facility: String(d),
      cost: Number(p),
      capacity: 1,
    }));
    const p = dispatchPlan(
      needs,
      {
        suppliers: [
          { source: "x", surplus: 1 },
          { source: "y", surplus: 1 },
        ],
        lanes,
      },
      "aro",
    );
    expect(p.received).toEqual([1, 1]);
    expect(p.cost).toBe(3);
  });
  it("deduplicates field receipts and reconciles an authorized replenishment", async () => {
    const { c, worker, field } = setup();
    const usage = {
      eventId: "usage-1",
      kind: "usage" as const,
      resource: "medicine" as const,
      facility: "deep",
      lot: "local",
      units: 1,
    };
    const id = ingest(c, usage)!;
    expect(ingest(c, usage)).toBe(id);
    expect(() => ingest(c, { ...usage, units: 3 })).toThrow();
    expect(
      field(
        "SELECT quantity FROM inventories WHERE facility='deep' AND resource='medicine' AND lot='local'",
      ),
    ).toBe(3);
    await worker.drain();
    decide(c, id, "approve");
    await worker.drain();
    const units = Number(
      field("SELECT units FROM replenishments WHERE incident=?", id),
    );
    const receipt = {
      eventId: "supplier-1",
      kind: "receipt" as const,
      resource: "medicine" as const,
      facility: "depot",
      lot: "fresh",
      units,
      expected: units,
      expires: "2088-01-01",
      order: id,
    };
    expect(() => ingest(c, receipt)).toThrow("authorized");
    releaseOrder(c, id);
    ingest(c, receipt);
    ingest(c, receipt);
    expect(
      field("SELECT status FROM replenishments WHERE incident=?", id),
    ).toBe("received");
    expect(field("SELECT quantity FROM inventories WHERE lot='fresh'")).toBe(
      units,
    );
  });
  it("compares policies, protects reserves and posts only the authorized request once", async () => {
    const { c, worker, field } = setup();
    const id = detect(c, "medicine");
    expect(detect(c, "medicine")).toBe(id);
    await worker.drain();
    expect(field("SELECT state FROM incidents")).toBe("review");
    expect(field("SELECT COUNT(*) FROM transfers")).toBe(0);
    const plan = JSON.parse(
      String(
        field("SELECT data FROM artifacts WHERE tool='allocate_resources'"),
      ),
    );
    expect(plan.aro.metrics.coverage).toBe(100);
    expect(plan.directorate.metrics.coverage).toBeLessThan(100);
    const balance = () =>
      field("SELECT SUM(quantity) FROM inventories WHERE resource='medicine'");
    const before = balance();
    decide(c, id, "approve");
    decide(c, id, "approve");
    await worker.drain();
    expect(field("SELECT state FROM incidents")).toBe("completed");
    expect(balance()).toBe(before);
    expect(field("SELECT SUM(units) FROM transfers")).toBe(50);
    expect(
      field(
        "SELECT quantity FROM inventories WHERE resource='medicine' AND facility='depot' AND lot='A'",
      ),
    ).toBe(15);
    expect(field("SELECT count(*) FROM transfers WHERE lot IN ('X','Q')")).toBe(
      0,
    );
    expect(
      field("SELECT COUNT(*) FROM artifacts WHERE tool='publish_report'"),
    ).toBe(1);
    expect(verifyAuditChain(c).ok).toBe(true);
  });
  it("rolls back stale plans and requires a new decision after replanning", async () => {
    const { c, worker, field } = setup();
    const id = detect(c, "water");
    await worker.drain();
    decide(c, id, "approve");
    c.sqlite.prepare("UPDATE routes SET open=0 WHERE id='water-deep'").run();
    await worker.drain();
    expect(field("SELECT COUNT(*) FROM transfers")).toBe(0);
    expect(field("SELECT state FROM incidents")).toBe("blocked");
    replan(c, id);
    await worker.drain();
    expect(field("SELECT COUNT(*) FROM incidents WHERE state='review'")).toBe(
      1,
    );
    expect(field("SELECT COUNT(*) FROM transfer_approvals")).toBe(1);
  });
  it("resumes a committed step after restart without duplicating the handoff", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "aro-test-"));
    const file = path.join(dir, "case.db");
    try {
      const first = setup(file);
      detect(first.c, "food");
      const j = claimNextJob(first.c)!;
      runTool(first.c, j);
      first.c.sqlite.close();
      const second = setup(file);
      expect(recoverInterruptedJobs(second.c)).toBe(1);
      await second.worker.drain();
      expect(
        second.field(
          "SELECT COUNT(*) FROM artifacts WHERE tool='reconcile_stock'",
        ),
      ).toBe(1);
      expect(second.field("SELECT state FROM incidents")).toBe("review");
      second.c.sqlite.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejects role mismatches and finalizes a rejection without posting", async () => {
    const { c, worker, field } = setup();
    const id = detect(c, "power");
    const j = claimNextJob(c)!;
    expect(() => runTool(c, { ...j, agentId: "operator" })).toThrow("role");
    recoverInterruptedJobs(c);
    await worker.drain();
    decide(c, id, "reject");
    expect(() => decide(c, id, "approve")).toThrow();
    await worker.drain();
    expect(field("SELECT COUNT(*) FROM transfers")).toBe(0);
  });
});
