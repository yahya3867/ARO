import type { Snapshot } from "@/server/aro/runtime";
import type { Line, Need } from "@/server/aro/catalog";
import { crew } from "@/server/aro/catalog";

function duration(ms: number) {
  if (ms < 60_000) return Math.max(1, Math.round(ms / 1000)) + " s";
  if (ms < 3_600_000) return Math.round(ms / 60_000) + " min";
  if (ms < 86_400_000) return (ms / 3_600_000).toFixed(ms < 36_000_000 ? 1 : 0).replace(/\.0$/, "") + " h";
  return Math.round(ms / 86_400_000) + " days";
}

/** The completed transfer's records, frozen at report publication, not its proposed plan. */
export function resourceCompletion(data: Snapshot) {
  if (data.current?.state !== "completed") return null;
  const report = data.events.find(e => e.title === "publish report" && e.type === "COMPLETED");
  const execution = data.events.find(e => e.title === "execute transfer" && e.type === "TOOL_CALL");
  if (!report || !execution) return null;
  const events = data.events.filter(e => e.id <= report.id).sort((a, b) => a.id - b.id);
  const lines = execution.result.lines as Line[];
  const postTransfer = report.result.postTransfer as Need[];
  const units = lines.reduce((sum, line) => sum + line.units, 0);
  const communities = new Set(lines.map(line => line.facility)).size;
  const minimum = postTransfer.reduce((sum, facility) => sum + facility.minimum, 0);
  const covered = postTransfer.reduce((sum, facility) => sum + Math.min(facility.stock, facility.minimum), 0);
  const coverage = minimum ? Math.round(covered / minimum * 1000) / 10 : 100;
  const agents = [...new Set(events.filter(e => crew.some(a => a.id === e.actor)).map(e => e.actor))];
  const calls = events.filter(e => e.type === "APPROVAL_DECISION").length;
  const unit = data.current.unit;
  const steps = events.flatMap(e => {
    const v = e.result;
    let text: string;
    switch (e.title) {
      case "reconcile stock": {
        const missing = (v.receipts as { missing: number }[]).reduce((sum, receipt) => sum + receipt.missing, 0);
        text = missing ? `Found ${missing} ${unit} missing from shipment receipts.` : "Reconciled shipment receipts against counted inventory.";
        break;
      }
      case "forecast demand": {
        const forecasts = (v.facilities as { stockoutHours: number | null }[]).flatMap(f => f.stockoutHours === null ? [] : [f.stockoutHours]);
        text = forecasts.length ? `Projected the first stockout in ${Math.min(...forecasts)} h.` : "Calculated demand from recorded consumption.";
        break;
      }
      case "locate surplus":
        text = `Located ${(v.suppliers as { surplus: number }[]).reduce((sum, supplier) => sum + supplier.surplus, 0)} ${unit} above protected reserves.`;
        break;
      case "allocate resources":
        text = `Proposed ${units} ${unit} across ${communities} facilities.`;
        break;
      case "review equity":
        text = Number(v.gainPoints) === 0 ? "Confirmed essential coverage matches the Directorate baseline." : `Improved essential coverage by ${v.gainPoints} percentage points over the Directorate.`;
        break;
      case "execute transfer":
        text = `Transferred ${units} ${unit}; inventory and transfer records updated together.`;
        break;
      case "publish report":
        text = "Published the operational report with post-transfer stock and the audit trail.";
        break;
      default:
        if (e.type !== "APPROVAL_DECISION") return [];
        text = v.decision === "approve" ? "Approved the transfer." : "Declined the transfer.";
    }
    return [{ actor: e.type === "APPROVAL_DECISION" ? "operator" : e.actor, text }];
  });
  const first = events[0];
  const elapsed = first ? Date.parse(report.time) - Date.parse(first.time) : NaN;
  return { title: `${units} ${unit} transferred`, took: Number.isFinite(elapsed) && elapsed >= 0 ? duration(elapsed) : null,
    agents, calls, units, communities, coverage, steps };
}
