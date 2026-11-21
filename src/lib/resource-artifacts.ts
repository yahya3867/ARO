import type { FrameSpec, Tone } from "./frames";
import type { Snapshot } from "@/server/aro/runtime";
import type { Need, Line, Plan, Measure } from "@/server/aro/catalog";
import type { Network } from "@/server/aro/network";

type Event = Snapshot["events"][number];

/** Adapt ARO's existing visual primitives to recorded resource-tool evidence. */
export function enrichResourceArtifact(spec: FrameSpec, event: Event, data: Snapshot) {
  const v = event.result;
  const unit = data.current!.unit;
  const facility = (id: string) => data.facilities[id] ?? id;
  const amount = (n: number) => n + " " + unit;
  const lines = (v.lines ?? []) as Line[];
  const total = lines.reduce((sum, line) => sum + line.units, 0);
  switch (event.title) {
    case "reconcile stock": {
      const receipts = v.receipts as { id: number; expected: number; received: number; missing: number }[];
      const expected = receipts.reduce((n, r) => n + r.expected, 0);
      const received = receipts.reduce((n, r) => n + r.received, 0);
      const missing = receipts.reduce((n, r) => n + Math.max(0, r.missing), 0);
      spec.status = { label: missing ? "Receipt discrepancy" : "Reconciled", tone: missing ? "warn" : "ok" };
      spec.match = {
        head: { label: "Shipment reconciliation", detail: facility(String(v.facility)), value: amount(expected) + " expected" },
        rows: receipts.map(r => ({ label: "Shipment " + r.id, detail: amount(r.expected) + " expected",
          value: amount(r.received), delta: r.missing > 0 ? "−" + r.missing : undefined,
          tone: r.missing > 0 ? "warn" : "ok" })),
        result: { label: "Missing on receipts", value: amount(missing), tone: missing ? "warn" : "ok" },
      };
      spec.stack = expected > 0 ? { total: amount(expected) + " expected", parts: [
        { label: "Received", share: Math.min(1, received / expected), display: amount(received), tone: "ok" },
        { label: "Missing", share: missing / expected, display: amount(missing), tone: "warn" },
      ] } : undefined;
      spec.summary = amount(Number(v.counted)) + " counted on hand. Receipt totals describe deliveries, while counted stock reflects current inventory.";
      spec.sources = ["Shipment receipts", "Counted inventory"];
      delete spec.table;
      break;
    }
    case "forecast demand": {
      const facilities = v.facilities as (Need & { stockoutHours: number | null })[];
      const hours = Number(v.horizonDays) * 24;
      spec.timeline = {
        ticks: [{ at: 0, label: "Now" }, { at: .5, label: hours / 2 + " h" }, { at: 1, label: hours + " h" }],
        lanes: facilities.map(f => ({
          key: f.facility, label: f.name, value: f.stockoutHours === null ? "No measured usage" : f.stockoutHours + " h of supply",
          tone: (f.stockoutHours !== null && f.stockoutHours < hours ? "warn" : "ok") as Tone,
          spans: [{ from: 0, to: f.stockoutHours === null ? 1 : Math.min(1, f.stockoutHours / hours) }],
        })),
        marks: [],
      };
      spec.sources = ["Seven-day consumption", "Counted inventory", "Community populations"];
      break;
    }
    case "locate surplus": {
      const network = v as unknown as Network;
      const total = network.suppliers.reduce((n, s) => n + s.surplus, 0);
      spec.stack = total > 0 ? {
        total: amount(total) + " eligible surplus",
        parts: network.suppliers.filter(s => s.surplus > 0).map(s => ({
          label: facility(s.source), share: s.surplus / total, display: amount(s.surplus), tone: "ok",
        })),
      } : undefined;
      spec.table = {
        cols: ["From", "To", "Capacity", "Cost / unit"],
        rows: network.lanes.map(l => [facility(l.source), facility(l.facility), amount(l.capacity), String(l.cost)]),
      };
      spec.status = { label: total ? "Supply located" : "Replenishment needed", tone: total ? "ok" : "warn" };
      spec.summary = "Surplus is calculated after local demand, safety reserves, expiry and route eligibility checks.";
      spec.sources = ["Eligible inventory lots", "Facility demand", "Transportation routes"];
      break;
    }
    case "allocate resources": {
      const aro = v.aro as Plan, baseline = v.directorate as Plan;
      spec.match = {
        head: { label: "Essential demand covered", detail: "Needs-based allocation against upper-level priority", value: aro.metrics.coverage + "% ARO" },
        rows: [
          { label: "Directorate", value: baseline.metrics.coverage + "%", tone: "warn" },
          { label: "Unmet target demand", value: amount(aro.metrics.unmet), tone: aro.metrics.unmet ? "warn" : "ok" },
          { label: "Below essential minimum", value: String(aro.metrics.below), tone: aro.metrics.below ? "warn" : "ok" },
          { label: "Transport cost", value: String(aro.metrics.cost), tone: "base" },
        ],
        result: { label: "Essential coverage improvement", value: Math.round((aro.metrics.coverage - baseline.metrics.coverage) * 10) / 10 + " points", tone: "ok" },
      };
      spec.table = {
        cols: ["Level", "Directorate essential", "ARO essential"],
        rows: aro.metrics.byLevel.map(l => {
          const b = baseline.metrics.byLevel.find(b => b.level === l.level);
          return [String(l.level), b ? b.covered + "/" + b.minimum : "—", l.covered + "/" + l.minimum];
        }),
      };
      spec.sources = ["Demand forecast", "Eligible surplus", "Feasible dispatch lanes", "Allocation policies"];
      break;
    }
    case "verify routes":
      spec.match = {
        head: { label: "Dispatch validation", detail: lines.length + " feasible lanes", value: amount(total) },
        rows: lines.map(l => ({ label: l.route, detail: facility(l.facility), value: amount(l.units), tone: "ok" })),
        result: { label: "Validated transport cost", value: String(v.transportCost), tone: "ok" },
      };
      spec.sources = ["Proposed allocation", "Current route capacity", "Eligible inventory"];
      delete spec.table;
      break;
    case "review equity": {
      const aro = v.aro as Measure, baseline = v.directorate as Measure;
      spec.table = { cols: ["Measure", "Directorate", "ARO"], rows: [
        ["Essential coverage", baseline.coverage + "%", aro.coverage + "%"],
        ["Below essential minimum", String(baseline.below), String(aro.below)],
        ["Unmet target demand", amount(baseline.unmet), amount(aro.unmet)],
        ["Transport cost", String(baseline.cost), String(aro.cost)],
      ] };
      spec.checks = [
        { label: "Essential coverage meets baseline", detail: aro.coverage + "% against " + baseline.coverage + "%", ok: aro.coverage >= baseline.coverage },
        { label: "Communities below minimum", detail: String(aro.below), ok: aro.below === 0 },
      ];
      spec.status = { label: "Fairness review recorded", tone: "ok" };
      spec.sources = ["ARO allocation", "Directorate baseline", "Essential thresholds"];
      break;
    }
    case "prepare request":
    case "execute transfer":
      spec.stack = total > 0 ? { total: amount(total) + (event.title === "execute transfer" ? " transferred" : " proposed"),
        parts: lines.map(l => ({ label: facility(l.facility), share: l.units / total, display: amount(l.units) })) } : undefined;
      spec.table = { cols: ["Source", "Destination", "Route", "Quantity"],
        rows: lines.map(l => [facility(l.source ?? ""), facility(l.facility), l.route, amount(l.units)]) };
      spec.status = { label: event.title === "execute transfer" ? "Execution recorded" : "Requires operator approval",
        tone: event.title === "execute transfer" ? "ok" : "warn" };
      spec.sources = ["Validated transfer plan", "Inventory ledger", "Approval record"];
      if (event.title === "prepare request") {
        spec.draft = { to: "Human operator", subject: "Authorize resource transfer · " + data.current!.id,
          body: lines.map(l => "Transfer " + amount(l.units) + " from " + facility(l.source ?? "") + " to " + facility(l.facility) + " via " + l.route + ".").join("\n") +
            "\nReplenishment draft for unmet target demand: " + amount(Number(v.replenishmentDraft ?? 0)) + ".\nInventory changes require your authorization and a successful execution check." };
      }
      break;
    case "publish report": {
      const post = v.postTransfer as Need[];
      const dispatch = v.dispatch as { lines: Line[] };
      const fairness = v.fairness as { aro: Measure; directorate: Measure; gainPoints: number };
      const moved = dispatch.lines.reduce((n, l) => n + l.units, 0);
      spec.title = amount(moved) + " transferred · operational report";
      spec.table = { cols: ["Facility", "Post-transfer stock", "Essential minimum", "Target"],
        rows: post.map(f => [f.name, amount(f.stock), amount(f.minimum), amount(f.target)]) };
      spec.checks = post.map(f => ({ label: f.name, detail: amount(f.stock) + " on hand against " + amount(f.minimum) + " essential minimum", ok: f.stock >= f.minimum }));
      spec.match = { head: { label: "Approved transfers recorded", detail: dispatch.lines.length + " dispatch lanes", value: amount(moved) },
        rows: [{ label: "ARO essential coverage", value: fairness.aro.coverage + "%", tone: "ok" },
          { label: "Remaining target demand", value: amount(fairness.aro.unmet), tone: fairness.aro.unmet ? "warn" : "ok" }],
        result: { label: "Coverage improvement", value: fairness.gainPoints + " points", tone: "ok" } };
      spec.status = { label: "Report published", tone: "ok" };
      spec.summary = "Post-transfer inventory is recorded above. Coverage compares the two allocation policies at planning time. Remaining target demand may require a separately authorized replenishment.";
      spec.sources = ["Executed transfer records", "Post-transfer inventory", "Fairness review"];
      break;
    }
  }
}
