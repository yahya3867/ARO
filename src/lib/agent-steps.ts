import { crew } from "@/server/aro/catalog";
/** Short, fixed steps for each agent, derived from the tools a run has called. */

export type StepState = "done" | "active" | "todo";

interface StepDef {
  label: string;
  verb: string;
  tools: string[];
}

export const AGENT_STEPS: Record<string, StepDef[]> = Object.fromEntries(crew.map(a=>["aro."+a.id,[{label:a.name,verb:a.remit,tools:[a.tool,...(a.id==="capacity"?["execute_transfer"]:[])]}]]));

export function agentSteps(agentId: string, tools: string[], runStatus: "running" | "completed" | "failed" | "none") {
  const defs = AGENT_STEPS[agentId] ?? [];
  let reached = -1;
  tools.forEach((tool) => {
    const i = defs.findIndex((d) => d.tools.includes(tool));
    if (i > reached) reached = i;
  });
  const steps = defs.map((d, i) => {
    let state: StepState = "todo";
    if (runStatus === "completed") state = "done";
    else if (runStatus === "running") state = i < Math.max(reached, 0) ? "done" : i === Math.max(reached, 0) ? "active" : "todo";
    else if (runStatus === "failed") state = i <= reached ? "done" : "todo";
    return { label: d.label, verb: d.verb, state };
  });
  const current = steps.find((s) => s.state === "active") ?? null;
  return { steps, current };
}

/** Kanban column for a work item. */
export type BoardStage = "investigate" | "propose" | "needs_you" | "vendor" | "done";

export const BOARD_STAGES: { key: BoardStage; label: string }[] = [
  { key: "investigate", label: "Investigate" },
  { key: "propose", label: "Propose" },
  { key: "needs_you", label: "Needs you" },
  { key: "vendor", label: "Supplier" },
  { key: "done", label: "Done" },
];
