import { ALL_TABLES, dropGuards, installGuards } from "../db/client";
import type { AppContext } from "../context";
import type { Orchestrator } from "../orchestrator";
import { initialize } from "./store";
import { scenarios } from "./catalog";

type Runtime = { ctx: AppContext; worker: Orchestrator };
const activeResets = new WeakMap<AppContext, Promise<void>>();
const RESOURCE_TABLES = [
  "communities", "facilities", "resources", "inventories", "consumption",
  "facility_demand", "observations", "deliveries", "routes", "allocation_policies",
  "incidents", "demo_feeds", "case_messages", "artifacts", "agent_summaries", "transfer_requests", "continuity_requests",
  "transfer_approvals", "transfers", "replenishments", "case_actions", "transfer_revisions",
] as const;

/** Reset only this visitor's sandbox in place, following ARO's worker/epoch protocol. */
export function resetResourceEnvironment(runtime: Runtime) {
  const pending = activeResets.get(runtime.ctx);
  if (pending) return pending;
  const reset = performReset(runtime).finally(() => activeResets.delete(runtime.ctx));
  activeResets.set(runtime.ctx, reset);
  return reset;
}

async function performReset({ ctx, worker }: Runtime) {
  worker.pause();
  ctx.epoch += 1;
  try {
    await worker.waitForIdle(10000);
    if (worker.activeCount) throw Error("Agents are still stopping. Try resetting again shortly.");
    const db = ctx.sqlite;
    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        dropGuards(db);
        for (const table of ["transfer_requests", "transfer_revisions", "transfer_approvals", "transfers", "artifacts"])
          for (const operation of ["UPDATE", "DELETE"])
            db.exec("DROP TRIGGER IF EXISTS protect_" + table + "_" + operation);
        for (const table of [...RESOURCE_TABLES, ...ALL_TABLES])
          db.prepare("DELETE FROM " + table).run();
        db.prepare("DELETE FROM sqlite_sequence").run();
        initialize(ctx);
        installGuards(db);
        for (const resource of Object.keys(scenarios))
          db.prepare("INSERT INTO demo_feeds(resource,next_scan) VALUES (?,?)")
            .run(resource, 0);
      }).immediate();
    } finally {
      db.pragma("foreign_keys = " + (foreignKeys ? "ON" : "OFF"));
    }
    ctx.bus.emit("change", "reset");
  } finally {
    worker.resume();
  }
}
