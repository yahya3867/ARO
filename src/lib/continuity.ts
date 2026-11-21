import type { Snapshot } from "@/server/aro/runtime";
import { allocate } from "@/server/aro/allocation";
import { scenarios, type Resource } from "@/server/aro/catalog";

export type Checkpoint = { savedAt: string; snapshot: Snapshot };
export type QueuedRequest = { requestId: string; workspaceId: string; resource: Resource; createdAt: string };

export function checkpointFresh(checkpoint: Checkpoint, now = Date.now()) {
  const age = now - Date.parse(checkpoint.savedAt);
  return Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000;
}
export function provisionalPlan(checkpoint: Checkpoint, resource: Resource, now = Date.now()) {
  const records = checkpoint.snapshot.continuity.resources[resource];
  if (!records) throw Error("No cached records for this resource");
  // The identical deterministic optimizer is used on the server. This produces
  // advice only: browser data never authorizes a transfer or changes balances.
  const fresh = checkpointFresh(checkpoint, now);
  const elapsedDays = Math.max(0, Math.floor((now - Date.parse(checkpoint.savedAt)) / 86400000));
  const day = new Date(Date.parse(checkpoint.snapshot.continuity.planningDay + "T00:00:00Z") + (Number.isFinite(elapsedDays) ? elapsedDays : 0) * 86400000).toISOString().slice(0, 10);
  const usable = records.inventories.filter(lot => lot.available === 1 && lot.expires > day);
  const needs = records.needs.map(n => ({ ...n, stock: fresh ? Math.min(n.stock, usable.filter(l => l.facility === n.facility).reduce((sum, l) => sum + l.quantity, 0)) : 0 }));
  const suppliers = records.network.suppliers.map(s => {
    const donor = needs.find(n => n.facility === s.source);
    const free = usable.filter(l => l.facility === s.source).reduce((sum, l) => sum + Math.max(0, l.quantity - l.reserve), 0);
    return { ...s, surplus: fresh ? Math.min(s.surplus, free, donor ? Math.max(0, donor.stock - donor.target) : free) : 0 };
  });
  return allocate(needs, { ...records.network, suppliers }, "aro");
}

const escape = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function emergencyKit(checkpoint: Checkpoint): string {
  const data = checkpoint.snapshot;
  const sections = (Object.keys(scenarios) as Resource[]).map(resource => {
    const records = data.continuity.resources[resource];
    const plan = provisionalPlan(checkpoint, resource);
    const unit = data.overview.find(r => r.resource === resource)?.unit ?? "dispatch units";
    return `<section><h2>${escape(scenarios[resource])}</h2><p><b>Unit:</b> ${escape(unit)}. Provisional essential coverage: ${escape(plan.metrics.coverage)}%. ${escape(plan.metrics.below)} facilities below minimum. This is a historical checkpoint, not a current stock guarantee.</p>
      <table><caption>Counted stock and protected reserves</caption><thead><tr><th>Facility / lot</th><th>Stock</th><th>Reserve</th><th>Available</th><th>Expiry</th></tr></thead><tbody>${records.inventories.map(l => `<tr><td>${escape(l.name)} / ${escape(l.lot)}</td><td>${l.quantity}</td><td>${l.reserve}</td><td>${l.available ? "Yes" : "No"}</td><td>${escape(l.expires)}</td></tr>`).join("")}</tbody></table>
      <table><caption>Demand and essential minimum (dispatch units)</caption><thead><tr><th>Facility</th><th>Recorded stock</th><th>Daily usage</th><th>Essential minimum</th><th>Planning target</th></tr></thead><tbody>${records.needs.map(n => `<tr><td>${escape(n.name)}</td><td>${n.stock}</td><td>${n.daily}</td><td>${n.minimum}</td><td>${n.target}</td></tr>`).join("")}</tbody></table>
      <table><caption>Provisional transfers — physically verify and obtain local authorization before dispatch</caption><thead><tr><th>From</th><th>To</th><th>Route</th><th>Units</th></tr></thead><tbody>${plan.lines.map(l => `<tr><td>${escape(data.facilities[l.source!] ?? l.source)}</td><td>${escape(data.facilities[l.facility] ?? l.facility)}</td><td>${escape(l.route)}</td><td>${l.units}</td></tr>`).join("") || '<tr><td colspan="4">No feasible transfer in the cached records. Escalate unmet needs to local coordinators.</td></tr>'}</tbody></table></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>ARO emergency operating kit</title><style>body{font:14px system-ui,sans-serif;max-width:980px;margin:30px auto;padding:0 18px;color:#111}h1{font-size:26px}h2{font-size:19px}table{width:100%;border-collapse:collapse;margin:15px 0}caption{text-align:left;font-weight:600;padding:6px 0}td,th{border:1px solid #999;text-align:left;padding:7px}p,li{line-height:1.5}section{break-inside:avoid;margin-top:28px}@media print{body{margin:0;font-size:10pt}section{break-before:page}h1,h2{break-after:avoid}}</style><body>
    <h1>ARO · Emergency operating kit</h1><p><b>Checkpoint saved:</b> ${escape(checkpoint.savedAt)}<br><b>Workspace:</b> ${escape(data.continuity.workspaceId)}<br><b>Operational planning day:</b> ${escape(data.continuity.planningDay)}</p>
    <p><b>ARO cannot run without electricity.</b> Print this kit beforehand and keep paper copies at the clinic and supply points. This self-contained document can be opened without the application or internet while a device still has power. Quantities are dispatch units (kits, food parcels, water crates, battery packs), not clinical advice or electrical-grid control.</p>
    <p>Cached plans stop proposing transfers once the checkpoint is over 24 hours old or its timestamp cannot be trusted. Historical counts are not reduced automatically for unrecorded consumption. Physical counts and local authorization are required even for a fresh checkpoint.</p>
    <h2>Manual continuity procedure</h2><ol><li>Name a local coordinator and an independent witness. Establish a safe meeting point and runner/radio schedule where available.</li><li>Physically count usable stock and note date, time and unit. Separate expired, damaged, unavailable and quarantined lots. Protect safety reserves and each donor's own essential needs.</li><li>Recheck population, urgent needs, transport safety and remaining lane capacity. Prioritize essential needs and the least-covered communities. Treat the printed calculations as a starting point; never dispatch against stale figures alone.</li><li>Authorize each movement locally and record source, destination, lot, quantity, route, time, coordinator and witness on paper. Give numbered copies to sender and receiver. Subtract dispatched units immediately in the local paper ledger to prevent double allocation.</li><li>Obtain a signed receipt. Escalate shortages that cannot be met. This kit cannot create food, provide medical treatment, restore electricity or guarantee safe passage.</li><li>When service returns, reconcile physical counts and signed movement records with the operator before entering authorized observations. Do not replay paper approvals automatically. Review queued investigations against current inventory.</li></ol>
    <h2>Manual movement ledger</h2><table><tr><th>Movement / date</th><th>From → to / route</th><th>Resource / lot / units</th><th>Sender / witness / receiver</th></tr>${Array.from({ length: 6 }, () => '<tr><td style="height:32px"></td><td></td><td></td><td></td></tr>').join("")}</table>
    ${sections}<p>These records may be stale. Last server checkpoint: ${escape(data.continuity.capturedAt)}. No transfer in this document is an executed application transaction.</p></body></html>`;
}

export function inventoryCsv(checkpoint: Checkpoint): string {
  const quote = (v: unknown) => { const value = String(v); return '"' + (/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""') + '"'; };
  return [["checkpoint", "resource", "unit", "facility", "lot", "quantity", "reserve", "available", "expires"],
    ...Object.entries(checkpoint.snapshot.continuity.resources).flatMap(([resource, records]) => records.inventories.map(l =>
      [checkpoint.savedAt, resource, checkpoint.snapshot.overview.find(r => r.resource === resource)?.unit ?? "dispatch units", l.name, l.lot, l.quantity, l.reserve, l.available, l.expires]))].map(row => row.map(quote).join(",")).join("\r\n");
}
