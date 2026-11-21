import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { WorkspaceStore } from "../src/server/aro/cloud-store";
import { detect, decide } from "../src/server/aro/service";
import { claimNextJob } from "../src/server/workflow/jobs";
import { snapshot } from "../src/server/aro/runtime";
import { verifyAuditChain } from "../src/server/audit";
import { resetResourceEnvironment } from "../src/server/aro/reset";

const clients: ReturnType<typeof createClient>[] = [];
function store() {
  const client = createClient({ url: "file::memory:" });
  clients.push(client);
  return new WorkspaceStore(client);
}
afterEach(() => { clients.splice(0).forEach(client => client.close()); });

async function drain(db: WorkspaceStore, id: string) {
  // Rehydrate from durable storage on every stage, like independent Function invocations.
  for (let stage = 0; stage < 12; stage++) {
    const work = await db.change(id, async ({ ctx, worker }) => {
      const job = claimNextJob(ctx);
      if (!job) return false;
      await worker.process(job);
      return true;
    });
    if (!work) return;
  }
  throw Error("Unbounded resource workflow");
}
describe("hosted workspace persistence", () => {
  it("rehydrates a complete approval workflow, isolates visitors and keeps ledger/audit valid", async () => {
    const db = store(), id = await db.create(), other = await db.create();
    const incident = await db.change(id, ({ ctx }) => detect(ctx, "medicine"));
    await drain(db, id);
    await db.read(id, runtime => {
      const data = snapshot(incident, runtime, true);
      expect(data.current?.state).toBe("review");
      expect(data.lines.reduce((sum, line) => sum + line.units, 0)).toBe(50);
      expect(runtime.ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get()).toEqual({ n: 0 });
    });
    await db.change(id, ({ ctx }) => decide(ctx, incident, "approve"));
    await drain(db, id);
    await db.change(id, ({ ctx }) => decide(ctx, incident, "approve"));
    await db.read(id, runtime => {
      expect(snapshot(incident, runtime, true).current?.state).toBe("completed");
      expect(runtime.ctx.sqlite.prepare("SELECT SUM(units) n FROM transfers").get()).toEqual({ n: 50 });
      expect(runtime.ctx.sqlite.prepare("SELECT MIN(quantity-reserve) n FROM inventories WHERE lot='A'").get()).toEqual({ n: 0 });
      expect(verifyAuditChain(runtime.ctx).ok).toBe(true);
    });
    await db.read(other, runtime => expect(snapshot(null, runtime, true).incidents).toHaveLength(0));
  });
  it("rejects stale concurrent writes and retries against the committed inventory", async () => {
    const db = store(), id = await db.create();
    let releases = 0;
    let unlock!: () => void;
    const gate = new Promise<void>(resolve => { unlock = resolve; });
    await Promise.all([1, 2].map(() => db.change(id, async ({ ctx }) => {
      const quantity = (ctx.sqlite.prepare("SELECT quantity FROM inventories WHERE facility='depot' AND resource='medicine' AND lot='A'").get() as {quantity:number}).quantity;
      if (++releases === 2) unlock();
      await gate;
      ctx.sqlite.prepare("UPDATE inventories SET quantity=? WHERE facility='depot' AND resource='medicine' AND lot='A'").run(quantity - 10);
    })));
    await db.read(id, ({ ctx }) => expect(ctx.sqlite.prepare("SELECT quantity FROM inventories WHERE facility='depot' AND resource='medicine' AND lot='A'").get()).toEqual({ quantity: 45 }));
    expect(releases).toBe(3);
  });
  it("resets only the current visitor and invalidates previously scheduled work", async () => {
    const db = store(), id = await db.create();
    await db.change(id, ({ ctx }) => detect(ctx, "water"));
    const before = await db.load(id);
    await db.change(id, runtime => resetResourceEnvironment(runtime));
    const after = await db.load(id);
    expect(after?.generation).not.toBe(before?.generation);
    expect(after?.wake).toBeNull();
    await db.read(id, runtime => expect(snapshot(null, runtime, true).incidents).toHaveLength(0));
  });
});
