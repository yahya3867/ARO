import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAppContext } from "../src/server/context";
import { initialize } from "../src/server/aro/store";
import { detect, decide, dispatch, block, executionMode } from "../src/server/aro/service";
import { Orchestrator } from "../src/server/orchestrator";
import { routerModel } from "../src/server/aro/model";

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw Error("OpenRouter key is not configured");
async function credits() {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error("OpenRouter key check HTTP " + response.status);
  const { data } = await response.json();
  return { limit: data.limit, remaining: data.limit_remaining, usage: data.usage, reset: data.limit_reset };
}
async function main() {
const before = await credits();
console.log(JSON.stringify({ model: routerModel(), budget: before }));
if (process.argv.includes("--inspect")) process.exit(0);
if (!(typeof before.limit === "number" && before.limit <= 5 && before.reset == null && before.remaining > 0))
  throw Error("A non-renewing key limit of $5 or less is required before this live test");
const folder = mkdtempSync(path.join(tmpdir(), "aro-live-"));
const ctx = createAppContext({ file: path.join(folder, "operations.db"), config: { llmAvailable: true, defaultMode: "llm", stepDelayMs: 0 } });
initialize(ctx);
const worker = new Orchestrator(ctx, 1, dispatch, block);
const started = Date.now();
try {
  const id = detect(ctx, "medicine");
  await worker.drain(12);
  let state = (ctx.sqlite.prepare("SELECT state FROM incidents WHERE id=?").get(id) as { state: string }).state;
  const beforeApproval = (ctx.sqlite.prepare("SELECT COUNT(*) n FROM transfers").get() as { n: number }).n;
  if (state === "review") { decide(ctx, id, "approve"); await worker.drain(4); }
  state = (ctx.sqlite.prepare("SELECT state FROM incidents WHERE id=?").get(id) as { state: string }).state;
  const artifacts = (ctx.sqlite.prepare("SELECT a.tool,s.summary FROM artifacts a LEFT JOIN agent_summaries s ON a.incident=s.incident AND a.tool=s.tool WHERE a.incident=? ORDER BY a.rowid").all(id) as { tool: string; summary: string|null }[])
    .map(row => ({ tool: row.tool, usedModel: row.summary!==null, summary: row.summary }));
  const result = { model: routerModel(), state, mode: executionMode(ctx), beforeApproval, artifacts,
    transfers: ctx.sqlite.prepare("SELECT route,units FROM transfers WHERE incident=?").all(id),
    seconds: Math.round((Date.now() - started) / 1000), before, after: await credits(),
    billingNote: "Provider key usage can settle later; use check:aro:credits again for the reported account total.",
    modelToolCalls: ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='model.tool.completed'").get(),
    database: path.join(folder, "operations.db") };
  writeFileSync(path.join(folder, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (state !== "completed" || !artifacts.some(a => a.usedModel)) process.exitCode = 1;
} finally { worker.stop(); ctx.sqlite.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Live check failed"); process.exitCode = 1; });
