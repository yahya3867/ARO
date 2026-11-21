import type { AppContext } from "../context";
import { nowIso, txImmediate } from "../context";
import { appendAudit } from "../audit";
import { needs, network, detect } from "./service";
import { scenarios, type Resource } from "./catalog";
import { planningDay } from "./store";

export function workspaceId(ctx: AppContext): string {
  const row = ctx.sqlite.prepare("SELECT value FROM settings WHERE key='aro:workspace-id'").get() as { value: string };
  return JSON.parse(row.value);
}

export function continuityData(ctx: AppContext) {
  return { workspaceId: workspaceId(ctx), capturedAt: new Date().toISOString(), planningDay,
    resources: Object.fromEntries((Object.keys(scenarios) as Resource[]).map(resource => [resource, {
      needs: needs(ctx, resource), network: network(ctx, resource),
      inventories: ctx.sqlite.prepare("SELECT i.facility,f.name,i.lot,i.quantity,i.reserve,i.available,i.expires FROM inventories i JOIN facilities f ON f.id=i.facility WHERE resource=? ORDER BY i.facility,i.expires,i.lot").all(resource) as {
        facility: string; name: string; lot: string; quantity: number; reserve: number; available: number; expires: string;
      }[],
    }])) };
}

/** Replayed intent starts a fresh investigation, never an approval or inventory write. */
export function receiveQueuedRequest(ctx: AppContext, request: { requestId: string; workspaceId: string; resource: Resource }) {
  return txImmediate(ctx, () => {
    if (workspaceId(ctx) !== request.workspaceId) throw Error("This request belongs to a different or reset workspace. Reconcile it manually.");
    const existing = ctx.sqlite.prepare("SELECT workspace,resource,incident FROM continuity_requests WHERE id=?").get(request.requestId) as { workspace: string; resource: Resource; incident: string } | undefined;
    if (existing) {
      if (existing.workspace !== request.workspaceId || existing.resource !== request.resource) throw Error("Request identity conflict");
      return existing.incident;
    }
    const id = detect(ctx, request.resource);
    ctx.sqlite.prepare("INSERT INTO continuity_requests VALUES (?,?,?,?,?)").run(request.requestId, request.workspaceId, request.resource, id, nowIso());
    appendAudit(ctx, { actorId: "operator", category: "system", action: "continuity.request.received", workItemId: id,
      details: { requestId: request.requestId, resource: request.resource, authorization: "investigation only" } });
    return id;
  });
}
