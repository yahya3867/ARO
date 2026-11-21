import { desc } from "drizzle-orm";
import { transferRequest } from "./transfer-request";
import type { CaseAction } from "./case-actions";
import { activityEvents } from "../db/schema";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { needs } from "./service";
import { crew, scenarios } from "./catalog";
import { employeeStatus } from "./employees";
import {
  resumeQuotaJobs,
  executionMode,
  deterministicSession,
} from "./service";
import { createAppContext } from "../context";
import { Orchestrator } from "../orchestrator";
import { eligible } from "./store";
import { initialize } from "./store";
import { dispatch, block } from "./service";
import type { Resource, Plan } from "./catalog";
import { continuityData } from "./continuity";
import { cloudScope } from "./cloud-scope";
import { visitorModelConfigured, VISITOR_MODEL } from "./visitor-model";

const mainFile = () => process.env.ARO_DATABASE_PATH || "data/aro.db";
function start(file = mainFile(), demo = false) {
  const hasModel = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  // Explicit opt-in for local model testing. Hosted browser demos stay deterministic.
  const localModelDemo = demo && !process.env.VERCEL && process.env.ARO_LOCAL_AI === "1" && process.env.AGENT_MODE === "llm";
  const allowModel = !demo || localModelDemo;
  const ctx = createAppContext({
    file,
    config: {
      stepDelayMs: Number(process.env.ARO_STEP_MS ?? 1200),
      llmAvailable: allowModel && hasModel,
      defaultMode: allowModel && hasModel && process.env.AGENT_MODE !== "deterministic" ? "llm" : "deterministic",
    },
  });
  initialize(ctx);
  const worker = new Orchestrator(ctx, 3, dispatch, block);
  if (demo) {
    if (!localModelDemo) deterministicSession(ctx);
    for (const resource of Object.keys(scenarios))
      ctx.sqlite.prepare("INSERT OR IGNORE INTO demo_feeds(resource,next_scan) VALUES (?,?)")
        .run(resource, 0);
  }
  resumeQuotaJobs(ctx);
  worker.start();
  return { ctx, worker };
}
const shared = globalThis as typeof globalThis & {
  aroRuntime?: ReturnType<typeof start>;
};
export const resourceRuntime = () => cloudScope.getStore()?.runtime ?? (shared.aroRuntime ??= start());
const demoRoot = () => path.join(path.dirname(mainFile()), "aro-demos");
const demoState = globalThis as typeof globalThis & {
  aroDemos?: Map<string, { runtime: ReturnType<typeof start>; seen: number }>;
};
const demos = (demoState.aroDemos ??= new Map<
  string,
  { runtime: ReturnType<typeof start>; seen: number }
>());
export function demoId(req: Request) {
  if (cloudScope.getStore()) return cloudScope.getStore()!.id;
  const id = req.headers
    .get("cookie")
    ?.match(/(?:^|; )aro_demo=([a-f0-9-]{36})(?:;|$)/)?.[1];
  return id && fs.existsSync(path.join(demoRoot(), id + ".db")) ? id : null;
}
function openDemo(id: string) {
  let entry = demos.get(id);
  if (!entry) {
    for (const [key, d] of demos)
      if (
        Date.now() - d.seen > 600000 &&
        !d.runtime.worker.activeCount &&
        d.runtime.ctx.bus.listenerCount("change") <= 1 &&
        !d.runtime.ctx.sqlite
          .prepare("SELECT 1 FROM jobs WHERE status IN ('queued','running')")
          .get()
      ) {
        d.runtime.worker.stop();
        d.runtime.ctx.sqlite.close();
        demos.delete(key);
      }
    entry = {
      runtime: start(path.join(demoRoot(), id + ".db"), true),
      seen: Date.now(),
    };
    demos.set(id, entry);
  }
  entry.seen = Date.now();
  return entry.runtime;
}
export function startDemo() {
  const id = randomUUID();
  openDemo(id);
  return id;
}
export function requestRuntime(req: Request) {
  if (cloudScope.getStore()) return cloudScope.getStore()!.runtime;
  const id = demoId(req);
  return id ? openDemo(id) : resourceRuntime();
}
export function snapshot(
  selected?: string | null,
  runtime = resourceRuntime(),
  demo = false,
) {
  const { ctx } = runtime,
    db = ctx.sqlite;
  // A snapshot is read-only. Demo incidents begin in the event picker, never
  // as a side effect of polling, revisiting a tab, or elapsed wall-clock time.
  const overview = (Object.keys(scenarios) as Resource[]).map(resource => {
    const facilities = needs(ctx, resource);
    const minimum = facilities.reduce((sum, f) => sum + f.minimum, 0);
    const covered = facilities.reduce((sum, f) => sum + Math.min(f.stock, f.minimum), 0);
    const unit = (db.prepare("SELECT unit FROM resources WHERE id=?").get(resource) as {unit:string}).unit;
    return { resource, unit, minimum, covered,
      coverage: minimum ? Math.round(covered / minimum * 100) : 100,
      below: facilities.filter(f => f.stock < f.minimum).length,
      available: (db.prepare("SELECT COALESCE(SUM(MAX(0,quantity-reserve)),0) total FROM inventories WHERE resource=? AND " + eligible).get(resource) as {total:number}).total,
    };
  });
  const feeds = db.prepare("SELECT f.resource,NULL nextScan,f.last_scan lastScan,(SELECT COUNT(*) FROM incidents i WHERE i.resource=f.resource) runs FROM demo_feeds f").all() as {
    resource:Resource; nextScan:null; lastScan:number|null; runs:number;
  }[];
  const incidents = db
    .prepare(
      "SELECT i.*,r.unit,(SELECT status FROM replenishments WHERE incident=i.id) orderState FROM incidents i JOIN resources r ON r.id=i.resource ORDER BY i.rowid DESC",
    )
    .all() as {
    id: string;
    resource: Resource;
    state: string;
    step: number;
    orderState: string | null;
    unit: string;
  }[];
  const current = incidents.find((i) => i.id === selected) ?? incidents[0];
  const id = current?.id ?? "";
  const summaries = new Map((db.prepare("SELECT tool,summary FROM agent_summaries WHERE incident=?").all(id) as {tool:string;summary:string}[]).map(s=>[s.tool,s.summary]));
  const events = (
    db
      .prepare(
        "SELECT id,actor_id actor,type,title,result,created_at time FROM activity_events WHERE work_item_id=? ORDER BY id DESC",
      )
      .all(id) as {
      id: number;
      actor: string;
      type: string;
      title: string;
      result: string;
      time: string;
    }[]
  ).map((e) => ({
    ...e,
    result: { ...JSON.parse(e.result || "{}"), ...(summaries.has(e.title.replaceAll(" ", "_")) ? {agentSummary:summaries.get(e.title.replaceAll(" ", "_"))} : {}) } as Record<string, unknown>,
  }));
  const activeRequest=transferRequest(ctx,id);
  const comparison = activeRequest.comparison ?? events.find((e) => e.title === "allocate resources")
    ?.result as { aro: Plan; directorate: Plan } | undefined;
  const jobs = db
    .prepare(
      "SELECT agent_id actor,status,attempts,error FROM jobs WHERE work_item_id=? ORDER BY id",
    )
    .all(id) as {
    actor: string;
    status: string;
    attempts: number;
    error: string | null;
  }[];
  const order = db
    .prepare("SELECT units,status FROM replenishments WHERE incident=?")
    .get(id) as { units: number; status: string } | undefined;
  const facilities = Object.fromEntries(
    (
      db.prepare("SELECT id,name FROM facilities").all() as {
        id: string;
        name: string;
      }[]
    ).map((f) => [f.id, f.name]),
  );
  const origin = events.find((e) => e.title === "locate surplus")?.result
    .source;
  return {
    modelAccess:{supported:Boolean(cloudScope.getStore()) && visitorModelConfigured(),connected:Boolean(ctx.modelCredential && ctx.modelCredential.expiresAt>Date.now()),expiresAt:ctx.modelCredential?.expiresAt??null,model:VISITOR_MODEL},
    demo,
    continuity: continuityData(ctx),
    epoch: ctx.epoch,
    activity: ctx.db.select().from(activityEvents).orderBy(desc(activityEvents.id)).limit(250).all(),
    overview,
    feeds,
    agents: crew.map((a) => employeeStatus(ctx, a.id)),
    messages: db
      .prepare(
        "SELECT id,question,answer,evidence,mode FROM case_messages WHERE incident=? ORDER BY id",
      )
      .all(id) as {
      id: number;
      question: string;
      answer: string;
      evidence: number;
      mode: string;
    }[],
    chatActions: (db.prepare("SELECT id,message,kind,status,payload FROM case_actions WHERE incident=? ORDER BY rowid").all(id) as (Omit<CaseAction,"payload"> & {message:number;payload:string})[]).map(a=>({...a,payload:JSON.parse(a.payload) as CaseAction["payload"]})),
    incidents,
    current,
    events,
    jobs,
    comparison,
    order,
    facilities,
    origin: typeof origin === "string" ? facilities[origin] : "Supply facility",
    lines: activeRequest.lines,
    mode: executionMode(ctx) === "llm" ? "Model-assisted" : "Deterministic",
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
