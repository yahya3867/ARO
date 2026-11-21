import { RunAbortedError } from "../workflow/errors";
import { configuredModel, resourceRunner } from "./model";
import { modelUnavailable } from "./model-failure";
import { getAgentSettings } from "../settings";
import { z } from "zod";
import {
  nowIso,
  nextId,
  txImmediate,
  sleep,
  type AppContext,
} from "../context";
import { enqueueJob, type JobRow } from "../workflow/jobs";
import { recordActivity } from "../activity";
import { appendAudit } from "../audit";
import {
  crew,
  scenarios,
  type Resource,
  type Need,
  type Plan,
  type Line,
} from "./catalog";
import { eligible, planningDay } from "./store";
import type { Lane, Network } from "./network";
import { allocate } from "./allocation";
import { resourceFacts, factSummary } from "@/lib/resource-explanations";
import { transferRequest } from "./transfer-request";
import { setVisitorModelEnabled } from "./visitor-model";
import { dispatchPlan } from "./network";

type Incident = {
  id: string;
  resource: Resource;
  facility: string;
  state: string;
  step: number;
};
type Lot = { lot: string; quantity: number; reserve: number; expires: string };
const stages = [
  ...crew.map((a) => ({ actor: a.id, tool: a.tool })),
  { actor: "director", tool: "prepare_request" },
  { actor: "capacity", tool: "execute_transfer" },
  { actor: "director", tool: "publish_report" },
];
const lineSchema = z.array(
  z
    .object({
      source: z.string().optional(),
      route: z.string(),
      facility: z.string(),
      units: z.number().int().positive(),
    })
    .strict(),
);
function incident(c: AppContext, id: string) {
  const row = c.sqlite.prepare("SELECT * FROM incidents WHERE id=?").get(id) as
    Incident | undefined;
  if (!row) throw Error("Incident not found");
  return row;
}
function artifact<T>(c: AppContext, id: string, tool: string): T {
  const row = c.sqlite
    .prepare("SELECT data FROM artifacts WHERE incident=? AND tool=?")
    .get(id, tool) as { data: string } | undefined;
  if (!row) throw Error("Missing required evidence: " + tool);
  return JSON.parse(row.data);
}
function event(
  c: AppContext,
  id: string,
  actor: string,
  title: string,
  result: Record<string, unknown>,
  type: "TOOL_CALL" | "HANDOFF" | "APPROVAL_DECISION" | "ERROR" | "INGESTION" | "COMPLETED",
  tool?: string,
) {
  recordActivity(c, {
    workItemId: id,
    actorId: actor,
    title,
    type,
    result,
    toolName: tool,
    status: type === "ERROR" ? "error" : "ok",
  });
  appendAudit(c, {
    actorId: actor,
    workItemId: id,
    action: tool ?? title,
    category:
      type === "APPROVAL_DECISION"
        ? "decision"
        : tool === "execute_transfer"
          ? "posting"
          : "write",
    outcome: type === "ERROR" ? "FAILED" : "ALLOWED",
    details: result,
  });
}
function schedule(c: AppContext, i: Incident, step: number, from: string) {
  const next = stages[step];
  enqueueJob(c, {
    workItemId: i.id,
    kind: "AGENT_RUN",
    agentId: next.actor,
    payload: { step },
  });
  event(
    c,
    i.id,
    from,
    "Assigned " + next.tool.replaceAll("_", " "),
    { from, to: next.actor, step },
    "HANDOFF",
  );
}
export function needs(c: AppContext, r: Resource): Need[] {
  const rows = c.sqlite
    .prepare(
      `SELECT f.id facility,f.name,c.level,c.population,r.essential_per_person rate,r.priority,d.minimum_units floor,d.horizon_days horizon,
    COALESCE((SELECT SUM(quantity) FROM inventories WHERE facility=f.id AND resource=r.id AND ${eligible}),0) stock
    FROM facility_demand d JOIN facilities f ON f.id=d.facility JOIN communities c ON c.id=f.community JOIN resources r ON r.id=d.resource WHERE r.id=? ORDER BY c.level,f.id`,
    )
    .all(r) as (Need & {
    rate: number;
    floor: number;
    horizon: number;
    priority: number;
  })[];
  return rows.map((n) => {
    const samples = c.sqlite
      .prepare(
        "SELECT units FROM consumption WHERE facility=? AND resource=? AND day BETWEEN date(?,'-7 days') AND date(?,'-1 day') ORDER BY day",
      )
      .all(n.facility, r, planningDay, planningDay) as { units: number }[];
    if (!samples.length)
      throw Error("Consumption history missing for " + n.name);
    const weight = (samples.length * (samples.length + 1)) / 2;
    const daily =
      Math.round(
        (100 * samples.reduce((s, x, i) => s + (i + 1) * x.units, 0)) / weight,
      ) / 100;
    const minimum = Math.max(
      n.floor,
      Math.ceil(n.population * n.rate),
      Math.ceil((daily * n.priority) / 4),
    );
    return {
      ...n,
      daily,
      minimum,
      target: Math.max(minimum, Math.ceil(daily * n.horizon)),
    };
  });
}
function lots(c: AppContext, r: Resource, source?: string) {
  return c.sqlite
    .prepare(
      "SELECT * FROM inventories WHERE resource=? AND facility IN (SELECT source FROM routes WHERE resource=?) AND " +
        eligible +
        " AND (? IS NULL OR facility=?) ORDER BY expires,lot",
    )
    .all(r, r, source ?? null, source ?? null) as (Lot & {
    facility: string;
  })[];
}
export function network(c: AppContext, r: Resource): Network {
  const lanes = c.sqlite
    .prepare(
      "SELECT id route,source,destination facility,cost,CASE WHEN open THEN capacity ELSE 0 END capacity FROM routes WHERE resource=? ORDER BY id",
    )
    .all(r) as Lane[];
  const ns = needs(c, r);
  const suppliers = [...new Set(lanes.map((l) => l.source))].map((source) => {
    const inventory = lots(c, r, source),
      own = ns.find((n) => n.facility === source);
    const free = inventory.reduce(
      (sum, l) => sum + Math.max(0, l.quantity - l.reserve),
      0,
    );
    return {
      source,
      surplus: own ? Math.min(free, Math.max(0, own.stock - own.target)) : free,
    };
  });
  return { lanes, suppliers };
}
export class NoShortage extends Error {}
export function detect(c: AppContext, r: Resource) {
  return txImmediate(c, () => {
    const active = c.sqlite
      .prepare(
        "SELECT id FROM incidents WHERE resource=? AND state IN ('working','approved','review','blocked')",
      )
      .get(r) as { id: string } | undefined;
    if (active) return active.id;
    const shortage = needs(c, r)
      .filter((n) => n.stock < n.target && n.daily > 0)
      .sort((a, b) => a.stock / a.daily - b.stock / b.daily)[0];
    if (!shortage) throw new NoShortage("All facilities meet forecast demand");
    const id = nextId(c, "INC");
    c.sqlite
      .prepare("INSERT INTO incidents VALUES (?,?,?,'working',0,?)")
      .run(id, r, shortage.facility, nowIso());
    event(
      c,
      id,
      "director",
      scenarios[r],
      {
        facility: shortage.name,
        onHand: shortage.stock,
        target: shortage.target,
      },
      "INGESTION",
    );
    schedule(c, incident(c, id), 0, "director");
    return id;
  });
}
function validate(c: AppContext, i: Incident, raw: unknown) {
  const lines = lineSchema.parse(raw);
  const ns = needs(c, i.resource);
  if (new Set(lines.map((l) => l.route)).size !== lines.length)
    throw Error("Duplicate dispatch lane");
  const net = network(c, i.resource);
  const remaining = new Map(net.suppliers.map((s) => [s.source, s.surplus]));
  const needed = new Map(ns.map((n) => [n.facility, n.target - n.stock]));
  for (const l of lines) {
    const lane = net.lanes.find(
      (rt) => rt.route === l.route && rt.facility === l.facility,
    );
    if (
      !lane ||
      (l.source && l.source !== lane.source) ||
      lane.capacity < l.units ||
      (needed.get(l.facility) ?? 0) < l.units
    )
      throw Error("Route or demand changed. A new plan is required.");
    l.source = lane.source;
    const free = remaining.get(lane.source) ?? 0;
    if (free < l.units) throw Error("Insufficient eligible surplus");
    remaining.set(lane.source, free - l.units);
    needed.set(l.facility, needed.get(l.facility)! - l.units);
  }
  return lines;
}

export function reviewTransfer(c: AppContext, id: string, amounts: {facility:string;units:number}[], fillRemaining=false) {
  const i=incident(c,id), ns=needs(c,i.resource), net=network(c,i.resource);
  if(i.state!=="review") throw Error("This transfer is no longer awaiting approval.");
  if(!amounts.length || new Set(amounts.map(a=>a.facility)).size!==amounts.length) throw Error("Specify each destination once.");
  for(const a of amounts) if(!Number.isSafeInteger(a.units)||a.units<=0||!ns.some(n=>n.facility===a.facility)) throw Error("Use positive whole quantities and a known destination.");
  const fixed=dispatchPlan(amounts.map(a=>({...ns.find(n=>n.facility===a.facility)!,stock:0,minimum:a.units,target:a.units})),net,"aro");
  if(amounts.some((a,k)=>fixed.received[k]!==a.units)) throw Error("Those quantities exceed available supply or shared route capacity.");
  let lines=fixed.lines;
  if(fillRemaining) {
    const remaining={suppliers:net.suppliers.map(s=>({...s,surplus:s.surplus-lines.filter(l=>l.source===s.source).reduce((sum,l)=>sum+l.units,0)})),lanes:net.lanes.map(l=>({...l,capacity:l.capacity-lines.filter(f=>f.route===l.route).reduce((sum,f)=>sum+f.units,0)}))};
    lines=[...lines,...allocate(ns.map(n=>{const a=amounts.find(a=>a.facility===n.facility);return a?{...n,stock:n.stock+a.units,target:n.stock+a.units}:n;}),remaining,"aro").lines];
  }
  const merged=[...new Set(lines.map(l=>l.route))].map(route=>({...lines.find(l=>l.route===route)!,units:lines.filter(l=>l.route===route).reduce((sum,l)=>sum+l.units,0)}));
  validate(c,i,merged);
  const received=ns.map(n=>merged.filter(l=>l.facility===n.facility).reduce((sum,l)=>sum+l.units,0));
  const after=ns.map((n,k)=>({...n,stock:n.stock+received[k]}));
  const metrics=allocate(after,{suppliers:[],lanes:[]},"aro").metrics;
  metrics.cost=merged.reduce((sum,l)=>sum+l.units*net.lanes.find(r=>r.route===l.route)!.cost,0);
  const directorate=allocate(ns,net,"directorate");
  if(metrics.coverage<directorate.metrics.coverage) throw Error("That plan falls below the Directorate baseline for essential coverage.");
  return {lines:merged,comparison:{aro:{lines:merged,metrics},directorate}};
}
type Comparison = { aro: Plan; directorate: Plan };
function calculate(
  c: AppContext,
  i: Incident,
  tool: string,
): Record<string, unknown> {
  const db = c.sqlite,
    r = i.resource;
  switch (tool) {
    case "reconcile_stock": {
      const receipts = db
        .prepare(
          "SELECT id,expected,received, expected-received AS missing FROM deliveries WHERE resource=? AND facility=?",
        )
        .all(r, i.facility);
      return {
        facility: i.facility,
        receipts,
        counted: needs(c, r).find((n) => n.facility === i.facility)!.stock,
      };
    }
    case "forecast_demand":
      return {
        method: "7-day linearly weighted mean",
        horizonDays: 2,
        facilities: needs(c, r).map((n) => ({
          ...n,
          stockoutHours: n.daily
            ? Math.round((n.stock / n.daily) * 240) / 10
            : null,
        })),
      };
    case "locate_surplus": {
      return { ...network(c, r), lots: lots(c, r) };
    }
    case "allocate_resources": {
      const ns = artifact<{ facilities: Need[] }>(
        c,
        i.id,
        "forecast_demand",
      ).facilities;
      const net = artifact<Network>(c, i.id, "locate_surplus");
      return {
        aro: allocate(ns, net, "aro"),
        directorate: allocate(ns, net, "directorate"),
      };
    }
    case "verify_routes": {
      const plan = artifact<Comparison>(c, i.id, "allocate_resources").aro;
      return {
        lines: validate(c, i, plan.lines),
        transportCost: plan.metrics.cost,
      };
    }
    case "review_equity": {
      const { aro, directorate } = artifact<Comparison>(
        c,
        i.id,
        "allocate_resources",
      );
      if (aro.metrics.coverage < directorate.metrics.coverage)
        throw Error("Essential coverage below baseline");
      return {
        aro: aro.metrics,
        directorate: directorate.metrics,
        gainPoints:
          Math.round(
            (aro.metrics.coverage - directorate.metrics.coverage) * 10,
          ) / 10,
      };
    }
    case "prepare_request": {
      const lines = validate(
        c,
        i,
        artifact<{ lines: Line[] }>(c, i.id, "verify_routes").lines,
      );
      const { unmet } = artifact<Comparison>(c, i.id, "allocate_resources").aro
        .metrics;
      if (unmet)
        db.prepare("INSERT INTO replenishments VALUES (?,?,?,'draft')").run(
          i.id,
          r,
          unmet,
        );
      if (lines.length)
        db.prepare("INSERT INTO transfer_requests VALUES (?,?,?)").run(
          i.id,
          JSON.stringify(lines),
          nowIso(),
        );
      return { lines, replenishmentDraft: unmet };
    }
    case "execute_transfer": {
      const req = db
        .prepare(
          "SELECT lines FROM transfer_requests JOIN transfer_approvals USING(incident) WHERE incident=? AND decision='approve'",
        )
        .get(i.id) as { lines: string } | undefined;
      if (!req || i.state !== "approved")
        throw Error("Human authorization required");
      const lines = validate(c, i, transferRequest(c,i.id).lines);
      for (const line of lines) {
        const source = line.source!;
        let remaining = line.units;
        for (const lot of lots(c, r, source)) {
          const n = Math.min(
            remaining,
            Math.max(0, lot.quantity - lot.reserve),
          );
          if (!n) continue;
          db.prepare(
            "UPDATE inventories SET quantity=quantity-? WHERE facility=? AND resource=? AND lot=?",
          ).run(n, source, r, lot.lot);
          db.prepare(
            "INSERT INTO inventories VALUES (?,?,?,?,0,1,?) ON CONFLICT(facility,resource,lot) DO UPDATE SET quantity=quantity+excluded.quantity",
          ).run(line.facility, r, source + "/" + lot.lot, n, lot.expires);
          db.prepare("INSERT INTO transfers VALUES (?,?,?,?)").run(
            i.id,
            line.route,
            lot.lot,
            n,
          );
          remaining -= n;
        }
        if (remaining) throw Error("Incomplete dispatch");
        db.prepare("UPDATE routes SET capacity=capacity-? WHERE id=?").run(
          line.units,
          line.route,
        );
      }
      return { lines, postedAt: nowIso() };
    }
    case "publish_report":
      return {
        incident: i.id,
        resource: r,
        dispatch: artifact(c, i.id, "execute_transfer"),
        postTransfer: needs(c, r),
        protectedLots: lots(c, r),
        fairness: transferRequest(c,i.id).comparison ? {
          aro:transferRequest(c,i.id).comparison!.aro.metrics,
          directorate:transferRequest(c,i.id).comparison!.directorate.metrics,
          gainPoints:Math.round((transferRequest(c,i.id).comparison!.aro.metrics.coverage-transferRequest(c,i.id).comparison!.directorate.metrics.coverage)*10)/10,
        } : artifact(c, i.id, "review_equity"),
      };
    default:
      throw Error("Unknown resource tool");
  }
}
export function decide(
  c: AppContext,
  id: string,
  decision: "approve" | "reject",
) {
  return txImmediate(c, () => {
    const i = incident(c, id);
    const old = c.sqlite
      .prepare("SELECT decision FROM transfer_approvals WHERE incident=?")
      .get(id) as { decision: string } | undefined;
    if (old?.decision === decision) return;
    if (old || i.state !== "review")
      throw Error("Request is no longer awaiting approval");
    c.sqlite
      .prepare("INSERT INTO transfer_approvals VALUES (?,'operator',?,?)")
      .run(id, decision, nowIso());
    c.sqlite
      .prepare("UPDATE incidents SET state=? WHERE id=?")
      .run(decision === "approve" ? "approved" : "rejected", id);
    event(
      c,
      id,
      "operator",
      decision === "approve" ? "Transfer authorized" : "Transfer declined",
      { decision },
      "APPROVAL_DECISION",
    );
    if (decision === "approve") schedule(c, i, 7, "operator");
  });
}
export function runTool(c: AppContext, j: JobRow) {
  return txImmediate(c, () => {
    const i = incident(c, j.workItemId);
    const { step } = z
      .object({
        step: z
          .number()
          .int()
          .min(0)
          .max(stages.length - 1),
      })
      .strict()
      .parse(j.payload);
    const s = stages[step];
    if (j.agentId !== s.actor) throw Error("Tool outside assigned role");
    if (i.step > step) return; // already committed before a worker restart
    if (i.step !== step || !["working", "approved"].includes(i.state))
      throw Error("Unexpected workflow state");
    const output = calculate(c, i, s.tool);
    c.sqlite
      .prepare("INSERT INTO artifacts VALUES (?,?,?)")
      .run(i.id, s.tool, JSON.stringify(output));
    event(
      c,
      i.id,
      s.actor,
      s.tool.replaceAll("_", " "),
      output,
      s.tool === "publish_report" ? "COMPLETED" : "TOOL_CALL",
      s.tool,
    );
    const state =
      step === 6
        ? (output.lines as Line[]).length
          ? "review"
          : "replenishment"
        : step === 8
          ? "completed"
          : step === 7
            ? "approved"
            : "working";
    c.sqlite
      .prepare("UPDATE incidents SET state=?,step=step+1 WHERE id=?")
      .run(state, i.id);
    if (step < 6 || step === 7) schedule(c, i, step + 1, s.actor);
    if (state === "review")
      event(
        c,
        i.id,
        "director",
        "Transfer ready for operator review",
        { to: "operator" },
        "HANDOFF",
      );
  });
}
const quotaPattern =
  /insufficient_quota|no credits remaining|exceeded your current quota/i;
export function deterministicSession(c: AppContext) {
  c.config.defaultMode = "deterministic";
}
export function executionMode(c: AppContext) {
  return c.config.defaultMode;
}
export function resumeQuotaJobs(c: AppContext) {
  txImmediate(c, () => {
    const rows = c.sqlite
      .prepare(
        "SELECT i.*,j.error FROM incidents i JOIN jobs j ON j.id=(SELECT max(id) FROM jobs WHERE work_item_id=i.id) WHERE i.state='blocked' AND j.status='failed'",
      )
      .all() as (Incident & { error: string })[];
    for (const i of rows)
      if ((i.step < 7 || i.step === 8) && quotaPattern.test(i.error)) {
        deterministicSession(c);
        c.sqlite
          .prepare("UPDATE incidents SET state=? WHERE id=?")
          .run(i.step === 8 ? "approved" : "working", i.id);
        schedule(c, i, i.step, "director");
        recordActivity(c, {
          workItemId: i.id,
          actorId: "director",
          type: "SYSTEM",
          title: "Resumed investigation in deterministic mode",
        });
        appendAudit(c, {
          actorId: "director",
          workItemId: i.id,
          category: "system",
          action: "quota.recovery",
        });
      }
  });
}
export async function dispatch(c: AppContext, j: JobRow) {
  const epoch = c.epoch;
  await sleep(c.config.stepDelayMs);
  if (c.epoch !== epoch) throw new RunAbortedError();
  if (executionMode(c) === "deterministic" || j.payload.step === 7)
    return runTool(c, j);
  try {
    const model = await configuredModel(c);
    if (c.epoch !== epoch) throw new RunAbortedError();
    await runModelTask(c, j, model);
  } catch (e) {
    if (c.epoch !== epoch) throw new RunAbortedError();
    if (!modelUnavailable(e)) {
      if(c.modelCredential) throw Error("The visitor AI could not complete its assigned task. Review the recorded evidence or retry in deterministic mode.");
      throw e;
    }
    deterministicSession(c);
    if(c.modelCredential) setVisitorModelEnabled(c,false);
    appendAudit(c, { actorId: "director", category: "system", action: "model.fallback", workItemId: j.workItemId,
      details: { mode: "deterministic", reason: "Model provider unavailable, unauthorized or over budget. Controlled tools retained." } });
    recordActivity(c, {
      workItemId: j.workItemId,
      actorId: "director",
      type: "SYSTEM",
      title: "Model service unavailable. Continuing with deterministic tools.",
    });
    return runTool(c, j);
  }
}
export async function runModelTask(
  c: AppContext,
  j: JobRow,
  model?: import("@openai/agents").Model | string,
) {
  const epoch = c.epoch;
  const s = stages[Number(j.payload.step)];
  if (!s || j.agentId !== s.actor) throw Error("Invalid delegation");
  const item = incident(c, j.workItemId);
  const unit = (c.sqlite.prepare("SELECT unit FROM resources WHERE id=?").get(item.resource) as {unit:string}).unit;
  const facilities = Object.fromEntries((c.sqlite.prepare("SELECT id,name FROM facilities").all() as {id:string;name:string}[]).map(f=>[f.id,f.name]));
  const detailIds: Record<string,string[]> = {
    reconcile_stock:["receipts"], forecast_demand:["method",...needs(c,item.resource).map(f=>f.facility)],
    locate_surplus:network(c,item.resource).suppliers.map(s=>s.source), allocate_resources:["thresholds","demand"],
    verify_routes:["deliveries","cost"], review_equity:["thresholds","demand"], prepare_request:["replenishment"], publish_report:["stock"],
  };
  const allowedIds = detailIds[s.tool] ?? [];
  let completedTool = false;
  const { Agent, tool } = await import("@openai/agents");
  const agent = new Agent({
    name: s.actor,
    instructions:
      "Run your assigned operational tool first. Read the returned facts.details dictionary. Choose zero to two KEYS from facts.details for a short colleague-style update. Allowed keys: " + JSON.stringify(allowedIds) + ". Return only the structured factIds output. The summary and next handoff are always included automatically; do not select summary, next, or whole sentences. Do not invent facts, numbers, safety concerns or authorization. The application renders measured findings from the tool." +
      "\nOperator guidance: " +
      getAgentSettings(c, s.actor).guidance,
    model,
    tools: [
      tool({
        name: s.tool,
        description: "Execute the assigned controlled operation and return its actual measurements and verified supporting facts.",
        parameters: z.object({}).strict(),
        execute: async () => {
          if (c.epoch !== epoch) throw new RunAbortedError();
          runTool(c, j);
          const output = artifact<Record<string,unknown>>(c, j.workItemId, s.tool);
          completedTool = true;
          return { result: output, facts: resourceFacts(s.tool, output, unit, facilities) };
        },
      }),
    ],
    outputType: z.object({ factIds: z.array(z.enum(allowedIds as [string,...string[]])).max(2) }).strict(),
    modelSettings: { maxTokens: 400, toolChoice: "required", parallelToolCalls: false },
    resetToolChoice: true,
    toolUseBehavior: "run_llm_again",
  });
  try {
  const response = await resourceRunner.run(
    agent,
    JSON.stringify({
      incident: j.workItemId,
      task: s.tool,
      context: { facility: facilities[item.facility], state: item.state, instruction: "Read current measurements by calling your tool. Prior narrative is not evidence." },
    }),
    { maxTurns: 3 },
  );
  if (c.epoch !== epoch) throw new RunAbortedError();
  if (incident(c, j.workItemId).step <= Number(j.payload.step))
    throw Error("Agent did not complete the assigned tool");
  if (!completedTool) throw Error("Agent did not call its assigned tool");
  const facts = resourceFacts(s.tool, artifact(c, j.workItemId, s.tool), unit, facilities);
  const selected = response.finalOutput?.factIds ?? [];
  const summary = factSummary(facts, selected);
  c.sqlite.prepare("INSERT OR IGNORE INTO agent_summaries VALUES (?,?,?,?)").run(j.workItemId, s.tool, summary, JSON.stringify(selected));
  const usage = response.runContext.usage;
  appendAudit(c, { actorId: s.actor, category: "system", action: "model.tool.completed", workItemId: j.workItemId,
    details: { tool: s.tool, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } });
  } catch (error) {
    if (c.epoch !== epoch) throw new RunAbortedError();
    if (!completedTool) throw error;
    // A summary failure cannot undo a committed tool, repeat a transfer, or
    // block its next handoff. The feed retains the deterministic measured summary.
    appendAudit(c, { actorId:s.actor, category:"system", action:"model.summary.fallback", workItemId:j.workItemId,
      details:{tool:s.tool, reason:"Model summary could not be validated; recorded tool findings retained.", error:c.modelCredential?"Visitor model summary unavailable":error instanceof Error ? error.message.slice(0,240) : "Unknown summary error"} });
  }
}
export function block(c: AppContext, j: JobRow, reason: string) {
  txImmediate(c, () => {
    c.sqlite
      .prepare("UPDATE incidents SET state='blocked' WHERE id=? AND step=?")
      .run(j.workItemId, j.payload.step);
    event(
      c,
      j.workItemId,
      j.agentId ?? "director",
      "Task needs operator attention",
      { reason },
      "ERROR",
    );
  });
}
export function replan(c: AppContext, id: string) {
  return txImmediate(c, () => {
    if (incident(c, id).state !== "blocked")
      throw Error("Only blocked incidents can be superseded");
    c.sqlite
      .prepare("UPDATE incidents SET state='superseded' WHERE id=?")
      .run(id);
    c.sqlite
      .prepare(
        "UPDATE replenishments SET status='superseded' WHERE incident=? AND status='draft'",
      )
      .run(id);
    let replacement: string | null = null;
    try {
      replacement = detect(c, incident(c, id).resource);
    } catch (e) {
      if (!(e instanceof NoShortage)) throw e;
    }

    event(
      c,
      id,
      "operator",
      replacement
        ? "Reopened investigation with current evidence"
        : "Closed incident after demand was satisfied",
      { replacement },
      "HANDOFF",
    );
    return replacement ?? id;
  });
}
