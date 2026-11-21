import type { AppContext } from "../context";
import type { Line, Plan } from "./catalog";

/** Original requests and every confirmed revision remain immutable. */
export function transferRequest(ctx: AppContext, id: string) {
  const revision = ctx.sqlite.prepare("SELECT lines,comparison FROM transfer_revisions WHERE incident=? ORDER BY rowid DESC LIMIT 1").get(id) as {lines:string;comparison:string}|undefined;
  const original = ctx.sqlite.prepare("SELECT lines FROM transfer_requests WHERE incident=?").get(id) as {lines:string}|undefined;
  return {
    lines: JSON.parse(revision?.lines ?? original?.lines ?? "[]") as Line[],
    comparison: revision ? JSON.parse(revision.comparison) as {aro:Plan;directorate:Plan} : undefined,
  };
}
