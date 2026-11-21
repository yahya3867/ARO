import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});

export const actors = sqliteTable("actors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // agent | human | system
  role: text("role").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
});

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workItemId: text("work_item_id"),
    runId: text("run_id"),
    actorId: text("actor_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").notNull(), // ok | error | denied | info | pending
    toolName: text("tool_name"),
    args: text("args", { mode: "json" }).$type<unknown>(),
    result: text("result", { mode: "json" }).$type<unknown>(),
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>().notNull(),
    changes: text("changes", { mode: "json" }).$type<string[]>().notNull(),
    mode: text("mode"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("activity_work_item_idx").on(t.workItemId)],
);

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workItemId: text("work_item_id").notNull(),
  kind: text("kind").notNull(), // AGENT_RUN | EXECUTE_DECISION
  agentId: text("agent_id"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull(), // queued | running | done | failed | cancelled
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: text("ts").notNull(),
    actorId: text("actor_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(), // ALLOWED | DENIED | FAILED
    category: text("category").notNull(), // read | write | decision | posting | security | system
    targetType: text("target_type"),
    targetId: text("target_id"),
    workItemId: text("work_item_id"),
    policyId: text("policy_id"),
    approvalId: text("approval_id"),
    rule: text("rule"),
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>().notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [index("audit_work_item_idx").on(t.workItemId)],
);
