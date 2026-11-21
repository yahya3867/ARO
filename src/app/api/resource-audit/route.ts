import { requestRuntime } from "@/server/aro/runtime";
import { auditEvents, actors } from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";
import { verifyAuditChain } from "@/server/audit";
import { resourceHttp } from "@/server/aro/cloud-http";
export const dynamic = "force-dynamic";
export function GET(req: Request) { return resourceHttp(req, read); }
function read(req: Request) {
  const { ctx } = requestRuntime(req),
    id = new URL(req.url).searchParams.get("incident") || null;
  const events = ctx.db
    .select()
    .from(auditEvents)
    .where(id ? eq(auditEvents.workItemId, id) : undefined)
    .orderBy(desc(auditEvents.id))
    .limit(600)
    .all();
  const people = Object.fromEntries(
    ctx.db
      .select()
      .from(actors)
      .all()
      .map((a) => [a.id, a]),
  );
  return Response.json({
    events,
    actors: people,
    chain: verifyAuditChain(ctx),
    policies: ctx.sqlite.prepare("SELECT * FROM allocation_policies").all(),
    ledger: ctx.sqlite
      .prepare(
        "SELECT t.*,r.source,r.destination,r.resource FROM transfers t JOIN routes r ON r.id=t.route WHERE (? IS NULL OR t.incident=?) ORDER BY t.rowid DESC",
      )
      .all(id, id),
  });
}
