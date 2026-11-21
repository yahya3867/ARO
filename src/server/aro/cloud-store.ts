import { createClient, type Client } from "@libsql/client";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { createAppContext } from "../context";
import { Orchestrator } from "../orchestrator";
import { initialize } from "./store";
import { block, dispatch, deterministicSession } from "./service";
import { scenarios } from "./catalog";
import { cloudScope } from "./cloud-scope";
import { openVisitorKey, sealVisitorKey, visitorModelEnabled, VISITOR_MODEL, VISITOR_MODEL_TTL_MS, type VisitorModelCredential } from "./visitor-model";

type State = { id: string; revision: number; generation: string; wake: string | null; run: string | null; image: Buffer; digest: string };
type Runtime = { ctx: ReturnType<typeof createAppContext>; worker: Orchestrator };
const digest = (image: Buffer) => createHash("sha256").update(image).digest("hex");

/** One compressed SQLite database per visitor, committed by atomic revision CAS.
 * /tmp, module caches and a particular Function instance never own durable data.
 * The image retains the original tables, constraints, triggers and audit chain.
 */
export class WorkspaceStore {
  private ready: Promise<unknown> | undefined;
  constructor(private client: Client) {}
  async setup() {
    await (this.ready ??= this.client.batch([`CREATE TABLE IF NOT EXISTS aro_workspaces (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL, generation TEXT NOT NULL,
      wake TEXT, run TEXT, image BLOB NOT NULL, digest TEXT NOT NULL, updated TEXT NOT NULL
    )`, `CREATE TABLE IF NOT EXISTS aro_visitor_keys(workspace TEXT PRIMARY KEY,generation TEXT NOT NULL,sealed TEXT NOT NULL,expires INTEGER NOT NULL)`],"write").catch(error => { this.ready = undefined; throw error; }));
  }
  private async open(state?: State): Promise<Runtime> {
    if (state && digest(state.image) !== state.digest) throw Error("Workspace integrity check failed");
    const ctx = createAppContext({ file: state ? gunzipSync(state.image, { maxOutputLength: 32 * 1024 * 1024 }) : ":memory:",
      config: { stepDelayMs: 0, llmAvailable: false, defaultMode: "deterministic", publicDemo: true } });
    initialize(ctx);
    deterministicSession(ctx);
    if(state) {
      ctx.modelCredential=await this.visitorKey(state)??undefined;
      ctx.config.llmAvailable=Boolean(ctx.modelCredential);
      if(ctx.modelCredential && visitorModelEnabled(ctx)) ctx.config.defaultMode="llm";
    }
    if (!state) for (const resource of Object.keys(scenarios))
      ctx.sqlite.prepare("INSERT OR IGNORE INTO demo_feeds(resource,next_scan) VALUES (?,0)").run(resource);
    return { ctx, worker: new Orchestrator(ctx, 1, dispatch, block, true) };
  }
  async create() {
    await this.setup();
    const id = randomUUID(), generation = randomUUID(), runtime = await this.open();
    try {
      const image = gzipSync(runtime.ctx.sqlite.serialize());
      await this.client.execute({ sql: "INSERT INTO aro_workspaces VALUES (?,0,?,NULL,NULL,?,?,?)",
        args: [id, generation, image, digest(image), new Date().toISOString()] });
      return id;
    } finally { runtime.ctx.sqlite.close(); }
  }
  async load(id: string): Promise<State | null> {
    await this.setup();
    const row = (await this.client.execute({ sql: "SELECT * FROM aro_workspaces WHERE id=?", args: [id] })).rows[0];
    return row ? { id, revision: Number(row.revision), generation: String(row.generation),
      wake: row.wake === null ? null : String(row.wake), run: row.run === null ? null : String(row.run),
      image: Buffer.from(row.image as ArrayBuffer), digest: String(row.digest) } : null;
  }
  async read<T>(id: string, fn: (runtime: Runtime, state: State) => T | Promise<T>) {
    const state = await this.load(id);
    if (!state) throw Error("Demo workspace not found. Reload the canvas to start a new demo.");
    const runtime = await this.open(state);
    try { return await cloudScope.run({ id, runtime }, () => fn(runtime, state)); }
    finally { runtime.ctx.sqlite.close(); }
  }
  async change<T>(id: string, fn: (runtime: Runtime, state: State) => T | Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await this.load(id);
      if (!state) throw Error("Demo workspace not found");
      const runtime = await this.open(state);
      try {
        const result = await cloudScope.run({ id, runtime }, () => fn(runtime, state));
        // Reset invalidates old queued workflow invocations as well as browser checkpoints.
        if (runtime.ctx.epoch) { state.generation = randomUUID(); state.wake = null; state.run = null; }
        const pending = runtime.ctx.sqlite.prepare("SELECT 1 FROM jobs WHERE status IN ('queued','running') LIMIT 1").get();
        if (pending && !state.wake) { state.wake = randomUUID(); state.run = null; }
        const image = gzipSync(runtime.ctx.sqlite.serialize());
        if (image.byteLength > 1024 * 1024) throw Error("This demo workspace is full. Export its records and reset the demo.");
        const saved = await this.client.execute({ sql: `UPDATE aro_workspaces
          SET revision=revision+1,generation=?,wake=?,run=?,image=?,digest=?,updated=? WHERE id=? AND revision=?`,
          args: [state.generation, state.wake, state.run, image, digest(image), new Date().toISOString(), id, state.revision] });
        if (saved.rowsAffected === 1) {
          if(runtime.ctx.epoch) await this.client.execute({sql:"DELETE FROM aro_visitor_keys WHERE workspace=? AND generation<>?",args:[id,state.generation]});
          return result;
        }
        // Discard the entire losing SQLite transaction and re-evaluate current stock/authorization.
      } finally { runtime.ctx.sqlite.close(); }
    }
    throw Error("Workspace is busy. Please retry the operation.");
  }
  async markStarted(id: string, wake: string, runId: string) {
    await this.client.execute({ sql: "UPDATE aro_workspaces SET run=? WHERE id=? AND wake=?", args: [runId, id, wake] });
  }
  private async visitorKey(state:State):Promise<VisitorModelCredential|null> {
    await this.client.execute({sql:"DELETE FROM aro_visitor_keys WHERE expires<=?",args:[Date.now()]});
    const row=(await this.client.execute({sql:"SELECT generation,sealed FROM aro_visitor_keys WHERE workspace=?",args:[state.id]})).rows[0];
    if(!row) return null;
    if(row.generation!==state.generation) return null;
    return openVisitorKey(String(row.sealed),state.id,state.generation);
  }
  async saveVisitorKey(id:string,apiKey:string) {
    const state=await this.load(id);
    if(!state) throw Error("Open your demo workspace first.");
    const credential={apiKey,model:VISITOR_MODEL,expiresAt:Date.now()+VISITOR_MODEL_TTL_MS};
    const sealed=sealVisitorKey(credential,id,state.generation);
    await this.client.execute({sql:"INSERT INTO aro_visitor_keys VALUES (?,?,?,?) ON CONFLICT(workspace) DO UPDATE SET generation=excluded.generation,sealed=excluded.sealed,expires=excluded.expires",args:[id,state.generation,sealed,credential.expiresAt]});
    return credential;
  }
  async removeVisitorKey(id:string) {
    await this.setup();
    await this.client.execute({sql:"DELETE FROM aro_visitor_keys WHERE workspace=?",args:[id]});
  }
}
let store: WorkspaceStore | undefined;
export function cloudStore() {
  return store ??= new WorkspaceStore(createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! }));
}
