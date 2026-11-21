import { enrichResourceArtifact } from "./resource-artifacts";
import type { Frame, FrameSpec } from "./frames";
import { headline } from "./resource-headlines";
import { crew, type Seat } from "@/server/aro/catalog";
import type { Snapshot } from "@/server/aro/runtime";

function table(input: unknown, columns: string[]): FrameSpec["table"] {
  if (!Array.isArray(input)) return;
  return {
    cols: columns.map((k) => k.replace(/([A-Z])/g, " $1")),
    rows: input.map((row) => columns.map((k) => String(row[k] ?? "—"))),
  };
}
export function resourceFrames(data?: Snapshot): Frame[] {
  if (!data?.current) return [];
  const unit = data.current.unit;
  return data.events
    .slice()
    .reverse()
    .flatMap((e): Frame[] => {
      if (
        !["INGESTION", "TOOL_CALL", "ERROR", "APPROVAL_DECISION","COMPLETED"].includes(
          e.type,
        )
      )
        return [];
      const v = e.result;
      const label = e.title.replace(/^./, (c) => c.toUpperCase());
      const spec: FrameSpec = {
        eyebrow: (crew.find(a => a.id === e.actor)?.name ?? "Operations Director") + " · " + e.title.replaceAll(" ", "_"),
        title: headline(e, unit),
      };
      if (e.title === "review equity" || e.title === "allocate resources") {
        if (data.comparison)
          spec.bars = Object.entries({ aro: v.aro, directorate: v.directorate } as typeof data.comparison).map(([policy, p]) => ({
            label: policy === "aro" ? "ARO" : "Directorate",
            share: ("metrics" in p ? p.metrics.coverage : (p as unknown as {coverage:number}).coverage) / 100,
            display: ("metrics" in p ? p.metrics.coverage : (p as unknown as {coverage:number}).coverage) + "%",
          }));
      } else if (Array.isArray(v.receipts))
        spec.table = table(v.receipts, ["expected", "received", "missing"]);
      else if (Array.isArray(v.facilities))
        spec.table = table(v.facilities, [
          "name",
          "stock",
          "daily",
          "stockoutHours",
        ]);
      else if (Array.isArray(v.suppliers))
        spec.table = table(v.suppliers, ["source", "surplus"]);
      else if (Array.isArray(v.lines))
        spec.table = table(v.lines, ["source", "facility", "units"]);
      else if (Array.isArray(v.postTransfer))
        spec.table = table(v.postTransfer, ["name", "stock", "minimum"]);
      else
        spec.table = {
          cols: ["Record", "Value"],
          rows: Object.entries(v)
            .filter(([, value]) => typeof value !== "object")
            .map(([k, value]) => [k, String(value)]),
        };
      if(e.type==="INGESTION"){
        spec.match={head:{label:"Inventory signal",detail:String(v.facility),value:v.onHand+" "+unit},rows:[{label:"Planning target",value:v.target+" "+unit,tone:"base"}],result:{label:"Unmet demand",value:(Number(v.target)-Number(v.onHand))+" "+unit,tone:"warn"}};
        delete spec.table;
      }
      if(Array.isArray(v.receipts)){
        spec.checks=v.receipts.map(r=>({label:"Shipment "+r.id,detail:r.received+" of "+r.expected+" "+unit+" received",ok:r.received===r.expected}));
      }
      if(Array.isArray(v.facilities)){
        spec.bars=v.facilities.map(n=>({label:n.name,share:Math.min(1,n.stock/Math.max(1,n.target)),display:n.stock+"/"+n.target+" "+unit}));
      }
      if (e.title === "forecast demand" && Array.isArray(v.facilities)) {
        const facility = [...v.facilities].filter(n => n.daily > 0)
          .sort((a, b) => a.stock / a.daily - b.stock / b.daily)[0];
        if (facility) {
          spec.stockForecast = { name: facility.name, stock: facility.stock,
            daily: facility.daily, minimum: facility.minimum,
            hours: Number(v.horizonDays ?? 2) * 24, unit };
          spec.summary = "Forecast calculated using " + v.method + ".";
          delete spec.table;
          delete spec.bars;
        }
      }
      if(e.title==="verify routes"&&Array.isArray(v.lines))spec.checks=v.lines.map(l=>({label:l.route,detail:l.units+" "+unit+" fit the available lane",ok:true}));
      if (typeof v.agentSummary === "string") spec.summary = v.agentSummary.split("\n\n")[0];
      enrichResourceArtifact(spec, e, data);
      const node = crew.some((a) => a.id === e.actor)
        ? (e.actor as Seat)
        : e.type === "INGESTION"
          ? "compute"
          : "policy";
      return [
        {
          id: String(e.id),
          tool: e.title.replaceAll(" ", "_"),
          node,
          label,
          createdAt: e.time,
          tone:
            e.type === "ERROR"
              ? "denied"
              : e.type === "INGESTION"
                ? "warn"
                : "ok",
          spec,
        },
      ];
    });
}
