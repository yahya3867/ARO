import type { ActivityRow } from "@/server/queries";
import { crew } from "@/server/aro/catalog";

/** Supply ARO's animation hooks with the same activity semantics from ARO's records. */
export function resourceLifeEvents(events: ActivityRow[]): ActivityRow[] {
  return events.map(event => {
    const result = (event.result ?? {}) as Record<string, unknown>;
    const actorId = crew.some(a => a.id === event.actorId) ? "aro." + event.actorId : event.actorId;
    if (event.type === "APPROVAL_DECISION") {
      return { ...event, actorId,
        changes: ["Approval " + event.workItemId + ": " + (result.decision === "approve" ? "APPROVED" : "REJECTED")] };
    }
    if (event.toolName === "publish_report")
      return { ...event, actorId, type: "COMPLETED" };
    if (event.type === "TOOL_CALL") {
      let reaction: "alert" | "ok" | undefined;
      if (event.toolName === "reconcile_stock") {
        const receipts = result.receipts as {missing:number}[];
        reaction = receipts.some(r => r.missing > 0) ? "alert" : "ok";
      }
      if (event.toolName === "forecast_demand") {
        const facilities = result.facilities as {stockoutHours:number|null}[];
        reaction = facilities.some(f => f.stockoutHours !== null && f.stockoutHours < Number(result.horizonDays) * 24) ? "alert" : "ok";
      }
      if (["allocate_resources","verify_routes","review_equity","execute_transfer"].includes(event.toolName ?? ""))
        reaction = "ok";
      if (reaction) return { ...event, actorId, type: "FINDING", args: {reaction} };
    }
    return { ...event, actorId };
  });
}
