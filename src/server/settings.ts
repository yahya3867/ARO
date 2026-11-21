import { eq } from "drizzle-orm";

import { type AppContext } from "./context";

import { settings } from "./db/schema";

export interface AgentSettings {
  /** Paused employees keep their queued work; nothing new starts until they are resumed. */
  paused: boolean;
  /** Standing guidance appended to the employee's instructions in LLM mode. */
  guidance: string;
}

const agentKey = (agentId: string) => "agent:" + agentId;

export function getAgentSettings(ctx: AppContext, agentId: string): AgentSettings {
  const row = ctx.db.select().from(settings).where(eq(settings.key, agentKey(agentId))).get();
  const v = (row?.value ?? {}) as Partial<AgentSettings>;
  return { paused: Boolean(v.paused), guidance: typeof v.guidance === "string" ? v.guidance : "" };
}

export function pausedAgents(ctx: AppContext): string[] {
  const rows = ctx.sqlite.prepare("SELECT key, value FROM settings WHERE key LIKE 'agent:%'").all() as { key: string; value: string }[];
  return rows.filter((r) => (JSON.parse(r.value) as Partial<AgentSettings>).paused).map((r) => r.key.slice("agent:".length));
}
