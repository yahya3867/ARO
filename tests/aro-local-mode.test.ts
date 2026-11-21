import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startDemo, requestRuntime } from "../src/server/aro/runtime";

const opened: ReturnType<typeof requestRuntime>[] = [];
afterEach(() => {
  for (const runtime of opened.splice(0)) { runtime.worker.stop(); runtime.ctx.sqlite.close(); }
  vi.unstubAllEnvs();
});
function browserDemo(hosted: boolean, optIn: boolean) {
  vi.stubEnv("ARO_DATABASE_PATH", path.join(mkdtempSync(path.join(tmpdir(), "aro-mode-")), "operations.db"));
  vi.stubEnv("VERCEL", hosted ? "1" : "");
  vi.stubEnv("ARO_LOCAL_AI", optIn ? "1" : "");
  vi.stubEnv("AGENT_MODE", "llm");
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-no-provider-calls");
  const id = startDemo();
  const runtime = requestRuntime(new Request("http://localhost/api/operations", { headers: { cookie: "aro_demo=" + id } }));
  opened.push(runtime);
  return runtime.ctx.config;
}
it("enables model calls in an explicitly opted-in local browser demo", () => {
  expect(browserDemo(false, true)).toMatchObject({ defaultMode: "llm", llmAvailable: true });
});
it("keeps a normal local browser demo deterministic", () => {
  expect(browserDemo(false, false)).toMatchObject({ defaultMode: "deterministic", llmAvailable: false });
});
it("cannot enable hosted browser model calls using the local-only switch", () => {
  expect(browserDemo(true, true)).toMatchObject({ defaultMode: "deterministic", llmAvailable: false });
});
