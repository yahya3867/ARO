import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";

const state=vi.hoisted(()=>({store:null as import("../src/server/aro/cloud-store").WorkspaceStore|null}));
vi.mock("../src/server/aro/cloud-store",async importOriginal=>({...await importOriginal<typeof import("../src/server/aro/cloud-store")>(),cloudStore:()=>state.store!}));
import { WorkspaceStore } from "../src/server/aro/cloud-store";
import { POST } from "../src/app/api/model-session/route";
import { GET } from "../src/app/api/operations/route";

const clients:ReturnType<typeof createClient>[]=[];
const apiKey="sk-or-v1-"+"b".repeat(64);
afterEach(()=>{clients.splice(0).forEach(c=>c.close());state.store=null;vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function ready() {
  vi.stubEnv("TURSO_DATABASE_URL","file::memory:");vi.stubEnv("TURSO_AUTH_TOKEN","test");
  vi.stubEnv("ARO_KEY_ENCRYPTION_SECRET",randomBytes(32).toString("base64"));
  const client=createClient({url:"file::memory:"});clients.push(client);
  const db=new WorkspaceStore(client);state.store=db;
  const id=await db.create();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({data:{limit_remaining:5}})));
  return {db,id,client};
}
function request(id:string|undefined,body:unknown,origin="https://tryaro.app") {
  return new Request("https://tryaro.app/api/model-session",{method:"POST",headers:{origin,"Content-Type":"application/json",...(id?{cookie:"aro_demo="+id}:{})},body:JSON.stringify(body)});
}
it("requires an existing visitor workspace and same-origin requests before accepting a key",async()=>{
  const {id,client}=await ready();
  expect((await POST(request(undefined,{action:"connect",apiKey}))).status).toBe(401);
  expect((await POST(request(id,{action:"connect",apiKey},"https://elsewhere.example"))).status).toBe(403);
  expect((await client.execute("SELECT * FROM aro_visitor_keys")).rows).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});
it("connects, pauses, reenables and removes a visitor key without ever echoing it",async()=>{
  const {id,db}=await ready();
  const connected=await POST(request(id,{action:"connect",apiKey}));expect(connected.status).toBe(200);expect(await connected.text()).not.toContain(apiKey);
  const get=()=>GET(new Request("https://tryaro.app/api/operations",{headers:{cookie:"aro_demo="+id}}));
  let data=await (await get()).json();expect(data.mode).toBe("Model-assisted");expect(data.modelAccess.connected).toBe(true);expect(JSON.stringify(data)).not.toContain(apiKey);
  expect((await POST(request(id,{action:"disable"}))).status).toBe(200);
  data=await(await get()).json();expect(data.mode).toBe("Deterministic");expect(data.modelAccess.connected).toBe(true);
  expect((await POST(request(id,{action:"enable"}))).status).toBe(200);
  expect((await POST(request(id,{action:"remove"}))).status).toBe(200);
  data=await(await get()).json();expect(data.mode).toBe("Deterministic");expect(data.modelAccess.connected).toBe(false);
  await db.read(id,({ctx})=>expect(ctx.sqlite.serialize().includes(Buffer.from(apiKey))).toBe(false));
});
it("does not persist invalid keys or their raw request bodies",async()=>{
  const {id,client,db}=await ready();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("unauthorized",{status:401})));
  const response=await POST(request(id,{action:"connect",apiKey}));expect(response.status).toBe(409);expect(await response.text()).not.toContain(apiKey);
  expect((await client.execute("SELECT * FROM aro_visitor_keys")).rows).toHaveLength(0);
  await db.read(id,({ctx})=>expect(ctx.sqlite.serialize().includes(Buffer.from(apiKey))).toBe(false));
});
