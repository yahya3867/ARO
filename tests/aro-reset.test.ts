import { afterEach, expect, it } from "vitest";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, decide, dispatch, runTool, block } from "../src/server/aro/service";
import { resetResourceEnvironment } from "../src/server/aro/reset";
import { Orchestrator } from "../src/server/orchestrator";
import { verifyAuditChain } from "../src/server/audit";

const runtimes: {ctx: ReturnType<typeof createAppContext>;worker:Orchestrator}[] = [];
function setup(delay = 0) {
  const ctx = createAppContext({file:":memory:",config:{stepDelayMs:delay,defaultMode:"deterministic"}});
  initialize(ctx);
  const worker = new Orchestrator(ctx, 1, delay ? dispatch : async(c,j)=>runTool(c,j), block);
  const runtime = {ctx,worker};
  runtimes.push(runtime);
  return runtime;
}
afterEach(() => {
  for (const {ctx,worker} of runtimes.splice(0)) {
    worker.stop();
    ctx.sqlite.close();
  }
});

it("resets the same sandbox, removes past history, restores seed and guards, and isolates other visitors", async () => {
  const runtime = setup(), other = setup();
  const {ctx,worker} = runtime;
  const id = detect(ctx,"medicine");
  await worker.drain();
  decide(ctx,id,"approve");
  await worker.drain();
  ctx.sqlite.prepare("INSERT INTO settings(key,value) VALUES ('agent:compute','custom guidance')").run();
  detect(other.ctx,"food");
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toMatchObject({n:2});
  await resetResourceEnvironment(runtime);
  for (const table of ["incidents","transfers","transfer_approvals","artifacts","case_messages","activity_events","jobs","continuity_requests"])
    expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM "+table).get()).toMatchObject({n:0});
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM settings WHERE key!='aro:workspace-id'").get()).toMatchObject({n:0});
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events").get()).toMatchObject({n:1});
  expect(ctx.sqlite.prepare("SELECT COUNT(*) n FROM demo_feeds").get()).toMatchObject({n:4});
  expect(other.ctx.sqlite.prepare("SELECT COUNT(*) n FROM incidents").get()).toMatchObject({n:1});
  expect(verifyAuditChain(ctx).ok).toBe(true);
  expect(() => ctx.sqlite.prepare("DELETE FROM audit_events").run()).toThrow();
  detect(ctx,"medicine");
  await worker.drain();
  expect(() => ctx.sqlite.prepare("DELETE FROM artifacts").run()).toThrow();
});

it("invalidates an in-flight resource job before reseeding", async () => {
  const runtime = setup(100);
  detect(runtime.ctx,"water");
  runtime.worker.start();
  expect(runtime.worker.activeCount).toBe(1);
  await resetResourceEnvironment(runtime);
  expect(runtime.ctx.epoch).toBe(1);
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM artifacts").get()).toMatchObject({n:0});
  expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM jobs").get()).toMatchObject({n:0});
});
