import type { Snapshot } from "@/server/aro/runtime";
import type { Plan, Line } from "@/server/aro/catalog";
type Event = Snapshot["events"][number];
export function headline(e: Event, unit: string): string {
  const v = e.result;
  switch (e.title) {
    case "reconcile stock": {
      const receipts = v.receipts as { missing: number }[];
      const missing = receipts.reduce(
        (sum, r) => sum + Math.max(0, r.missing),
        0,
      );
      return missing
        ? missing + " " + unit + " short on receipts"
        : "Receipts reconciled";
    }
    case "forecast demand": {
      const hours = (
        v.facilities as { stockoutHours: number | null }[]
      ).flatMap((f) => (f.stockoutHours === null ? [] : [f.stockoutHours]));
      return hours.length
        ? Math.min(...hours) + " h to first stockout"
        : "No recent usage";
    }
    case "locate surplus": {
      const suppliers = v.suppliers as { surplus: number }[] | undefined;
      return (
        (suppliers?.reduce((n, s) => n + s.surplus, 0) ?? v.surplus) +
        " " +
        unit +
        " available"
      );
    }
    case "allocate resources":
      return (v.aro as Plan).metrics.coverage + "% essential coverage";
    case "verify routes":
      return (v.lines as Line[]).length + " dispatch lanes checked";
    case "review equity":
      return Number(v.gainPoints) === 0 ? "No essential coverage change" : "+" + v.gainPoints + " coverage points";
    case "execute transfer":
      return (
        (v.lines as Line[]).reduce((n, l) => n + l.units, 0) +
        " " +
        unit +
        " transferred"
      );
    default:
      return e.title;
  }
}
