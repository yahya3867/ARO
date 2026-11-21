import { crew, scenarios, type Seat, type Resource } from "./catalog";
import { getAgentSettings } from "../settings";
import type { AppContext } from "../context";
import type { AgentStatus } from "../queries";

const definitions = {
  reconcile_stock: [
    "Compare expected and received shipments with counted stock at the reporting facility.",
    "Shipment receipts",
    "Facility inventory",
  ],
  forecast_demand: [
    "Calculate seven-day weighted consumption, essential floors and projected stockout time.",
    "Consumption history",
    "Facility inventory",
    "Community register",
  ],
  locate_surplus: [
    "Find available unexpired lots above local demand and reserves on feasible lanes.",
    "Facility inventory",
    "Transport routes",
  ],
  allocate_resources: [
    "Compare Directorate and needs-based allocations using the forecaster’s demand and the coordinator’s supply network.",
    "Demand forecast",
    "Supply network",
  ],
  verify_routes: [
    "Recheck proposed quantities against current lanes, eligible stock and destination needs.",
    "Allocation plan",
    "Transport routes",
    "Facility inventory",
  ],
  review_equity: [
    "Compare essential coverage and unmet demand under both policies before the director requests approval.",
    "Allocation plan",
  ],
  execute_transfer: [
    "Revalidate an authorized request, post inventory movements and consume route capacity atomically.",
    "Transfer approvals",
    "Facility inventory",
    "Transport routes",
    "Transfer ledger",
  ],
} as const;
export function employeeStatus(
  c: AppContext,
  id: Seat,
): Omit<AgentStatus, "agentId"> & { agentId: string } {
  const rows = c.sqlite
    .prepare(
      "SELECT status,work_item_id incident,payload FROM jobs WHERE agent_id=? ORDER BY id DESC",
    )
    .all(id) as { status: string; incident: string; payload: string }[];
  const running = rows.find((j) => j.status === "running"),
    queued = rows.filter((j) => j.status === "queued");
  const latest = c.sqlite
    .prepare(
      "SELECT title,created_at at,work_item_id workItemId FROM activity_events WHERE actor_id=? ORDER BY id DESC LIMIT 1",
    )
    .get(id) as AgentStatus["latestAction"] | undefined;
  return {
    agentId: "aro." + id,
    status: running ? "working" : queued.length ? "queued" : "idle",
    ...getAgentSettings(c, id),
    currentTask: running?.incident ?? null,
    currentWorkItemId: running?.incident ?? queued[0]?.incident ?? null,
    currentMode: null,
    runId: null,
    runTools: running ? [Number(JSON.parse(running.payload).step) === 7 ? "execute_transfer" : crew.find(a => a.id === id)!.tool] : [],
    queued: queued.length,
    completedRuns: rows.filter((j) => j.status === "done").length,
    latestAction: latest ?? null,
    latestFinding: null,
  };
}
export function employeeView(c: AppContext, id: Seat, mode: string) {
  const member = crew.find((a) => a.id === id)!;
  const toolNames: (keyof typeof definitions)[] = [member.tool];
  if (id === "capacity") toolNames.push("execute_transfer");
  const outputs = c.sqlite
    .prepare(
      "SELECT id,title,work_item_id workItemId,tool_name tool,created_at at FROM activity_events WHERE actor_id=? AND type='TOOL_CALL' ORDER BY id DESC",
    )
    .all(id) as {
    id: number;
    title: string;
    workItemId: string;
    tool: string;
    at: string;
  }[];
  const tasks = c.sqlite
    .prepare(
      "SELECT i.id,i.resource,i.state,count(*) runs FROM jobs j JOIN incidents i ON i.id=j.work_item_id WHERE j.agent_id=? GROUP BY i.id ORDER BY max(j.id) DESC",
    )
    .all(id) as {
    id: string;
    resource: Resource;
    state: string;
    runs: number;
  }[];
  const sources = [
    ...new Set(toolNames.flatMap((t) => definitions[t].slice(1))),
  ];
  return {
    id: "aro." + id,
    name: member.name,
    description: member.remit,
    status: employeeStatus(c, id),
    execution: { mode },
    settings: getAgentSettings(c, id),
    tasks: tasks.map((t) => ({ ...t, title: scenarios[t.resource] })),
    outputs: outputs.slice(0, 8),
    tools: toolNames.map((name) => ({
      name,
      description: definitions[name][0],
    })),
    connections: sources.map((name) => {
      const tools = toolNames.filter((t) =>
        definitions[t].slice(1).some((source) => source === name),
      );
      const calls = outputs.filter((o) => tools.some((t) => t === o.tool));
      return {
        id: name,
        name,
        kind: "Operational records",
        tools,
        read: true,
        write:
          tools.includes("execute_transfer") &&
          [
            "Facility inventory",
            "Transport routes",
            "Transfer ledger",
          ].includes(name),
        logo: null,
        uses: calls.length,
        lastAt: calls[0]?.at ?? null,
      };
    }),
  };
}
