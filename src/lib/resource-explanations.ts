import type { Line, Need, Plan, Measure } from "@/server/aro/catalog";

export type ResourceFacts = { summary: string; details: Record<string, string>; next: string };
/** Sentences are constructed exclusively from controlled tool results. Models
 * select relevant fact IDs, never supply numerical claims or approval status. */
export function resourceFacts(tool: string, v: Record<string, unknown>, unit: string, facilities: Record<string, string>): ResourceFacts {
  const name = (id: string) => facilities[id] ?? id;
  const lines = (v.lines ?? []) as Line[];
  const totals = new Map<string,number>();
  for(const line of lines) totals.set(line.facility,(totals.get(line.facility)??0)+line.units);
  const destinations = [...totals].map(([facility,units]) => `${units} ${unit} to ${name(facility)}`).join(" and ");
  switch (tool.replaceAll(" ", "_")) {
    case "reconcile_stock": {
      const receipts = (v.receipts ?? []) as {expected:number;received:number;missing:number}[];
      const missing = receipts.reduce((sum, r) => sum + Math.max(0, r.missing), 0);
      return { summary: `${name(String(v.facility))} has ${v.counted} ${unit} on hand. Shipment receipts are ${missing} ${unit} short.`,
        details: { receipts: `${receipts.reduce((s,r)=>s+r.received,0)} of ${receipts.reduce((s,r)=>s+r.expected,0)} expected ${unit} were received. Missing supplies are not available inventory.` },
        next: "Handing the counted stock to the Demand Forecaster." };
    }
    case "forecast_demand": {
      const ns = v.facilities as (Need & {stockoutHours:number|null})[];
      const urgent = [...ns].sort((a,b)=>(a.stockoutHours??Infinity)-(b.stockoutHours??Infinity))[0];
      return { summary: urgent.stockoutHours === null ? "There is no measured consumption to project a stockout." : `${urgent.name} could run out in ${urgent.stockoutHours} hours: ${urgent.stock} ${unit} on hand, with ${urgent.daily} consumed per day.`,
        details: { method: `Calculated from a ${v.method} over a ${v.horizonDays}-day planning horizon.`, ...Object.fromEntries(ns.map(n=>[n.facility, `${n.name} needs an essential minimum of ${n.minimum} ${unit}; its forecast target is ${n.target} ${unit}.`])) },
        next: "Sending the forecast to the Supply Coordinator." };
    }
    case "locate_surplus": {
      const suppliers = v.suppliers as {source:string;surplus:number}[];
      return { summary: `${suppliers.reduce((s,n)=>s+n.surplus,0)} ${unit} are available after protecting donor needs and safety reserves.`,
        details: Object.fromEntries(suppliers.map(s=>[s.source, `${name(s.source)} can supply ${s.surplus} ${unit} from eligible, unexpired stock.`])), next: "Passing supply and transport constraints to the Resource Allocator." };
    }
    case "allocate_resources": {
      const aro=(v.aro as Plan).metrics, directorate=(v.directorate as Plan).metrics;
      return { summary: `ARO covers ${aro.coverage}% of essential demand, compared with ${directorate.coverage}% under the Directorate policy.`,
        details: { thresholds: `${aro.below} communities remain below their essential minimum.`, demand: `${aro.unmet} ${unit} of forecast target demand remain unmet; essential coverage and forecast target coverage are different measures.` }, next: "Logistics will check the proposed deliveries before approval." };
    }
    case "verify_routes": return { summary: `The proposed deliveries fit the available stock and transport capacity.`, details: { deliveries: `The plan sends ${destinations}.`, cost: `The calculated transport cost is ${v.transportCost}.` }, next: "Sending the plan to the Fairness Auditor." };
    case "review_equity": {
      const aro=v.aro as Measure, directorate=v.directorate as Measure;
      return { summary: Number(v.gainPoints)===0 ? `Both policies cover ${aro.coverage}% of essential demand. ARO does not improve that metric in this scenario.` : `ARO improves essential coverage by ${v.gainPoints} percentage points: ${aro.coverage}% against the Directorate’s ${directorate.coverage}%.`, details: { thresholds: `${aro.below} communities remain below their essential minimum.`, demand: `${aro.unmet} ${unit} of forecast target demand still need replenishment.` }, next: "The review passed. Preparing the transfer request." };
    }
    case "prepare_request": return { summary: lines.length ? `I propose ${destinations}.` : "There is no feasible transfer from the current eligible stock.", details: { replenishment: `${v.replenishmentDraft} ${unit} of forecast target demand remain as a replenishment draft.` }, next: lines.length ? "Sent to you for approval. No inventory moves until you authorize the transfer." : "Replenishment requires separate authorization." };
    case "execute_transfer": return { summary: `Transferred ${destinations}. Inventory and transfer records updated together.`, details: {}, next: "The Operations Director will publish the final report." };
    case "publish_report": {
      const dispatch = v.dispatch as {lines:Line[]};
      return { summary: `${dispatch.lines.reduce((s,l)=>s+l.units,0)} ${unit} transferred. The operational report is ready.`, details: { stock: "The report includes post-transfer stock, protected reserves, remaining target demand and fairness findings." }, next: "You can review the full record and transfer ledger." };
    }
    default: return {summary: tool, details:{}, next:""};
  }
}
export function factSummary(facts: ResourceFacts, selected: string[] = []) {
  if (selected.some(id => !Object.hasOwn(facts.details, id))) throw Error("Model referenced an unknown operational fact");
  return [facts.summary, ...[...new Set(selected)].slice(0,2).map(id=>facts.details[id]), facts.next].filter(Boolean).join("\n\n");
}
