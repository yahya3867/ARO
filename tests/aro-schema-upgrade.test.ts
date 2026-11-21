import { afterEach, expect, it } from "vitest";
import { createAppContext, type AppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, runTool, block } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { verifyAuditChain } from "../src/server/audit";

const contexts: AppContext[] = [];
function open(file: string | Buffer = ":memory:") {
  const ctx = createAppContext({ file });
  contexts.push(ctx);
  return ctx;
}
afterEach(() => contexts.splice(0).forEach(ctx => ctx.sqlite.close()));

it("upgrades an existing resource workspace without changing evidence, stock or pending work", async () => {
  const ctx = open();
  initialize(ctx);
  const id = detect(ctx, "medicine");
  const before = ctx.sqlite.prepare("SELECT * FROM inventories ORDER BY facility,resource,lot").all();
  const audit = ctx.sqlite.prepare("SELECT * FROM audit_events ORDER BY id").all();
  ctx.sqlite.exec("CREATE TABLE retired_empty_module(id TEXT PRIMARY KEY); CREATE TABLE __drizzle_migrations(id INTEGER); INSERT INTO __drizzle_migrations VALUES(1)");
  const restored = open(ctx.sqlite.serialize());
  initialize(restored);
  expect(restored.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('retired_empty_module','__drizzle_migrations')").all()).toEqual([]);
  expect(restored.sqlite.prepare("SELECT * FROM inventories ORDER BY facility,resource,lot").all()).toEqual(before);
  expect(restored.sqlite.prepare("SELECT * FROM audit_events ORDER BY id").all()).toEqual(audit);
  expect(verifyAuditChain(restored).ok).toBe(true);
  const worker = new Orchestrator(restored, 1, async (c, j) => runTool(c, j), block);
  await worker.drain();
  expect(restored.sqlite.prepare("SELECT state FROM incidents WHERE id=?").get(id)).toEqual({ state: "review" });
  expect(restored.sqlite.prepare("SELECT count(*) n FROM transfers").get()).toEqual({ n: 0 });
  expect(() => restored.sqlite.prepare("DELETE FROM audit_events").run()).toThrow("append-only");
});

it("refuses to silently discard unexpected populated tables", () => {
  const ctx = open();
  initialize(ctx);
  ctx.sqlite.exec("CREATE TABLE retired_module(id TEXT); INSERT INTO retired_module VALUES ('preserve-me')");
  expect(() => open(ctx.sqlite.serialize())).toThrow("Export and reconcile before upgrading");
  expect(ctx.sqlite.prepare("SELECT * FROM retired_module").all()).toEqual([{ id: "preserve-me" }]);
});
