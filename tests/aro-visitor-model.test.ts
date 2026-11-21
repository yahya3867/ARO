import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";
import { WorkspaceStore } from "../src/server/aro/cloud-store";
import { openVisitorKey, sealVisitorKey, setVisitorModelEnabled, VISITOR_MODEL } from "../src/server/aro/visitor-model";
import { snapshot } from "../src/server/aro/runtime";
import { configuredModel, verifyVisitorKey } from "../src/server/aro/model";
import { resetResourceEnvironment } from "../src/server/aro/reset";
import { createAppContext } from "../src/server/context";
import { detect } from "../src/server/aro/service";
import { claimNextJob } from "../src/server/workflow/jobs";

const apiKey="sk-or-v1-"+"a".repeat(64);
const clients:ReturnType<typeof createClient>[]=[];
afterEach(()=>{clients.splice(0).forEach(c=>c.close());vi.unstubAllEnvs();vi.unstubAllGlobals();});
function store() {
  vi.stubEnv("ARO_KEY_ENCRYPTION_SECRET",randomBytes(32).toString("base64"));
  const client=createClient({url:"file::memory:"});clients.push(client);return {db:new WorkspaceStore(client),client};
}
it("encrypts keys with authenticated workspace/generation binding and rejects tampering and expiry",()=>{
  store();const c={apiKey,model:VISITOR_MODEL,expiresAt:Date.now()+3600000};
  const sealed=sealVisitorKey(c,"visitor-a","generation-a");
  expect(sealed).not.toContain(apiKey);expect(openVisitorKey(sealed,"visitor-a","generation-a")).toEqual(c);
  expect(openVisitorKey(sealed,"visitor-b","generation-a")).toBeNull();
  expect(openVisitorKey(sealed,"visitor-a","generation-b")).toBeNull();
  expect(openVisitorKey(sealed.slice(0,-8)+"AAAAAAAA","visitor-a","generation-a")).toBeNull();
  expect(openVisitorKey(sealVisitorKey({...c,expiresAt:Date.now()-1},"visitor-a","generation-a"),"visitor-a","generation-a")).toBeNull();
});
it("rehydrates only the connected visitor's key, without placing it in the image, snapshot, events or audit",async()=>{
  const {db,client}=store(),id=await db.create(),other=await db.create();
  await db.change(id,async({ctx})=>{ctx.modelCredential=await db.saveVisitorKey(id,apiKey);setVisitorModelEnabled(ctx,true);});
  await db.read(id,runtime=>{
    expect(runtime.ctx.config.defaultMode).toBe("llm");expect(runtime.ctx.modelCredential?.apiKey).toBe(apiKey);
    expect(JSON.stringify(snapshot(null,runtime,true))).not.toContain(apiKey);
    expect(runtime.ctx.sqlite.serialize().includes(Buffer.from(apiKey))).toBe(false);
  });
  await db.read(other,({ctx})=>{expect(ctx.modelCredential).toBeUndefined();expect(ctx.config.defaultMode).toBe("deterministic");});
  const raw=(await client.execute("SELECT sealed FROM aro_visitor_keys")).rows[0];expect(String(raw.sealed)).not.toContain(apiKey);
  await db.removeVisitorKey(id);
  await db.read(id,({ctx})=>{expect(ctx.modelCredential).toBeUndefined();expect(ctx.config.defaultMode).toBe("deterministic");});
});
it("expiry and demo reset remove the connection and preserve the deterministic demo",async()=>{
  const {db,client}=store(),id=await db.create();
  await db.change(id,async({ctx})=>{ctx.modelCredential=await db.saveVisitorKey(id,apiKey);setVisitorModelEnabled(ctx,true);});
  await client.execute({sql:"UPDATE aro_visitor_keys SET expires=? WHERE workspace=?",args:[Date.now()-1,id]});
  await db.read(id,({ctx})=>expect(ctx.config.defaultMode).toBe("deterministic"));
  expect((await client.execute("SELECT * FROM aro_visitor_keys")).rows).toHaveLength(0);
  await db.change(id,async({ctx})=>{ctx.modelCredential=await db.saveVisitorKey(id,apiKey);setVisitorModelEnabled(ctx,true);});
  await db.change(id,runtime=>resetResourceEnvironment(runtime));
  await db.read(id,({ctx})=>{expect(ctx.modelCredential).toBeUndefined();expect(ctx.config.defaultMode).toBe("deterministic");});
  expect((await client.execute("SELECT * FROM aro_visitor_keys")).rows).toHaveLength(0);
});
it("never uses environment API keys for a public workspace without a visitor credential",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY",apiKey);vi.stubEnv("OPENAI_API_KEY","owner-key");
  const ctx=createAppContext({file:":memory:",config:{publicDemo:true,llmAvailable:true,defaultMode:"llm"}});
  try {await expect(configuredModel(ctx)).rejects.toThrow("Visitor API key required");}
  finally {ctx.sqlite.close();}
});
it("accepts a valid visitor OpenRouter key and rejects invalid or exhausted credentials without echoing them",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({data:{limit_remaining:4,limit:5}})).mockResolvedValueOnce(Response.json({data:{limit_remaining:0}})).mockResolvedValueOnce(new Response("no",{status:401}));
  vi.stubGlobal("fetch",fetch);
  await expect(verifyVisitorKey(apiKey)).resolves.toBeUndefined();
  await expect(verifyVisitorKey(apiKey)).rejects.toThrow("no remaining credit");
  await expect(verifyVisitorKey(apiKey)).rejects.toThrow("rejected");
  await expect(verifyVisitorKey("bad-key")).rejects.toThrow("valid OpenRouter");
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("falls back durably when a visitor's provider becomes unavailable",async()=>{
  const {db}=store(),id=await db.create();
  await db.change(id,async({ctx})=>{ctx.modelCredential=await db.saveVisitorKey(id,apiKey);setVisitorModelEnabled(ctx,true);detect(ctx,"medicine");});
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  await db.change(id,async({ctx,worker})=>{
    const job=claimNextJob(ctx)!;await worker.process(job);
    expect(ctx.config.defaultMode).toBe("deterministic");
  });
  await db.read(id,({ctx})=>expect(ctx.config.defaultMode).toBe("deterministic"));
});
