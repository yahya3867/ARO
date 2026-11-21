import { afterEach, expect, it, vi } from "vitest";
import { createAppContext } from "../src/server/context";
import { Orchestrator } from "../src/server/orchestrator";
import { initialize } from "../src/server/aro/store";
import { snapshot } from "../src/server/aro/runtime";
import { detect, decide, runTool, block } from "../src/server/aro/service";

const runtimes: { ctx: ReturnType<typeof createAppContext>; worker: Orchestrator }[] = [];
function setup() {
  const ctx = createAppContext({ file: ":memory:", config: { stepDelayMs: 0, defaultMode: "deterministic" } });
  initialize(ctx);
  // Existing visitors can still have old, overdue recurring-feed schedules.
  for (const resource of ["medicine", "food", "water", "power"])
    ctx.sqlite.prepare("INSERT INTO demo_feeds(resource,next_scan) VALUES (?,0)").run(resource);
  const worker = new Orchestrator(ctx, 1, async (c, j) => runTool(c, j), block);
  const runtime = { ctx, worker };
  runtimes.push(runtime);
  return runtime;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const { ctx, worker } of runtimes.splice(0)) {
    worker.stop();
    ctx.sqlite.close();
  }
});

function pollLater(runtime: ReturnType<typeof setup>, selected?: string) {
  const now = Date.now();
  return [0, 60000, 300000, 3600000].map(offset => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + offset);
    try { return snapshot(selected, runtime, true); }
    finally { clock.mockRestore(); }
  });
}

it("does not create incidents or jobs when an idle demo is polled, even with legacy overdue feeds", () => {
  const runtime = setup();
  for (const result of pollLater(runtime)) {
    expect(result.incidents).toHaveLength(0);
    expect(result.activity).toHaveLength(0);
    expect(result.feeds.every(feed => feed.nextScan === null && feed.runs === 0)).toBe(true);
  }
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM jobs").get()).toMatchObject({ n: 0 });
});

it("runs the chosen event once, waits for approval, completes, and stays finished through later polling", async () => {
  const runtime = setup();
  const { ctx, worker } = runtime;
  const id = detect(ctx, "medicine");
  await worker.drain();
  for (const result of pollLater(runtime, id)) {
    expect(result.incidents).toHaveLength(1);
    expect(result.current?.state).toBe("review");
  }
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toMatchObject({ n: 0 });
  decide(ctx, id, "approve");
  await worker.drain();
  const before = ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events").get();
  for (const result of pollLater(runtime, id)) {
    expect(result.incidents).toHaveLength(1);
    expect(result.current?.state).toBe("completed");
    expect(result.feeds.find(feed => feed.resource === "medicine")?.runs).toBe(1);
    expect(result.feeds.filter(feed => feed.resource !== "medicine").every(feed => feed.runs === 0)).toBe(true);
  }
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toMatchObject({ n: 2 });
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('queued','running')").get()).toMatchObject({ n: 0 });
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events").get()).toEqual(before);
});
