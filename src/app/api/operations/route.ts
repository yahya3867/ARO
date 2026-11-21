import { resetResourceEnvironment } from "@/server/aro/reset";
import type { Resource } from "@/server/aro/catalog";
import { getAgentSettings } from "@/server/settings";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import {
  requestRuntime,
  snapshot,
  startDemo,
  demoId,
} from "@/server/aro/runtime";
import { detect, decide, replan } from "@/server/aro/service";
import { ingest, observation, releaseOrder } from "@/server/aro/intake";
import { appendAudit } from "@/server/audit";
import { receiveQueuedRequest } from "@/server/aro/continuity";
import { resourceHttp } from "@/server/aro/cloud-http";
import { confirmCaseAction } from "@/server/aro/case-actions";

export const dynamic = "force-dynamic";
export function GET(req: Request) { return resourceHttp(req, read); }
function read(req: Request) {
  return Response.json(
    snapshot(
      new URL(req.url).searchParams.get("incident"),
      requestRuntime(req),
      !!demoId(req),
    ),
  );
}
const action = z.discriminatedUnion("action", [
  z.object({action:z.enum(["confirm_chat","cancel_chat"]),id:z.string().regex(/^INC-\d+$/),confirmation:z.uuid()}).strict(),
  z.object({ action: z.literal("queued_scan"), requestId: z.uuid(), workspaceId: z.uuid(), resource: z.enum(["medicine", "food", "water", "power"]) }).strict(),
  z
    .object({
      action: z.literal("scan"),
      resource: z.enum(["medicine", "food", "water", "power"]),
    })
    .strict(),
  z.object({ action: z.literal("reset") }).strict(),
  z.object({ action: z.literal("session") }).strict(),
  z
    .object({
      action: z.literal("supplier_receipt"),
      id: z.string().regex(/^INC-\d+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("guidance"),
      actor: z.enum([
        "compute",
        "budget",
        "vendor",
        "finance",
        "capacity",
        "policy",
      ]),
      guidance: z.string().trim().max(2000),
    })
    .strict(),
  z.object({ action: z.literal("observe"), observation }).strict(),
  z
    .object({
      action: z.enum(["approve", "reject", "replan", "order"]),
      id: z.string().regex(/^INC-\d+$/),
    })
    .strict(),
]);
const hash = (value: string) => createHash("sha256").update(value).digest();
export function POST(req: Request) { return resourceHttp(req, mutate); }
async function mutate(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).protocol + "//" + req.headers.get("host") &&
    origin !== process.env.ARO_PUBLIC_ORIGIN
  )
    return Response.json(
      { error: "Cross-origin action denied" },
      { status: 403 },
    );
  const input = action.safeParse(await req.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid operation" }, { status: 400 });
  const a = input.data;
  try {
    if (a.action === "session" && demoId(req)) return Response.json({ok:true});
    if (a.action === "reset") {
      if (!demoId(req))
        return Response.json({error:"Open the demo before resetting its sandbox."},{status:409});
      await resetResourceEnvironment(requestRuntime(req));
      return Response.json({ok:true});
    }
    if (a.action === "session") {
      const id = startDemo();
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie":
              "aro_demo=" +
              id +
              "; HttpOnly; SameSite=Strict; Path=/" +
              (new URL(req.url).protocol === "https:" ? "; Secure" : ""),
          },
        },
      );
    }
    const { ctx } = requestRuntime(req);
    if (a.action === "queued_scan") return Response.json({ id: receiveQueuedRequest(ctx, a) });
    if (a.action === "scan")
      return Response.json({ id: detect(ctx, a.resource) });
    const token = process.env.ARO_OPERATOR_KEY;
    if (
      !demoId(req) &&
      (!token ||
        !timingSafeEqual(
          hash("Bearer " + token),
          hash(req.headers.get("authorization") ?? ""),
        ))
    ) {
      appendAudit(ctx, {
        actorId: "unknown",
        category: "security",
        outcome: "DENIED",
        action: a.action,
        workItemId: "id" in a ? a.id : null,
      });
      return Response.json(
        { error: "Enter the operator key configured for this deployment." },
        { status: 403 },
      );
    }
    if (a.action === "guidance") {
      ctx.sqlite
        .transaction(() => {
          const before = getAgentSettings(ctx, a.actor);
          ctx.sqlite
            .prepare(
              "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            )
            .run(
              "agent:" + a.actor,
              JSON.stringify({ ...before, guidance: a.guidance }),
            );
          appendAudit(ctx, {
            actorId: "operator",
            category: "decision",
            action: "agent.guidance",
            targetId: a.actor,
            details: { guidance: a.guidance },
          });
        })
        .immediate();
      return Response.json({ ok: true });
    }
    if(a.action==="confirm_chat" || a.action==="cancel_chat") {
      confirmCaseAction(ctx,a.id,a.confirmation,a.action==="cancel_chat");
      return Response.json({id:a.id});
    }
    if (a.action === "supplier_receipt") {
      if (!demoId(req))
        return Response.json(
          { error: "Simulated receipts require a demo workspace." },
          { status: 403 },
        );
      const order = ctx.sqlite
        .prepare(
          "SELECT resource,units,(SELECT source FROM routes WHERE resource=r.resource ORDER BY id LIMIT 1) facility FROM replenishments r WHERE incident=?",
        )
        .get(a.id) as
        { resource: Resource; units: number; facility: string } | undefined;
      if (!order) throw Error("Order not found");
      ingest(ctx, {
        kind: "receipt",
        eventId: "supplier-" + a.id,
        resource: order.resource,
        facility: order.facility,
        lot: "shipment-" + a.id,
        units: order.units,
        expected: order.units,
        expires: "2088-03-08",
        order: a.id,
      });
      return Response.json({ id: a.id });
    }
    if (a.action === "observe")
      return Response.json({ id: ingest(ctx, a.observation) });
    if (a.action === "order") releaseOrder(ctx, a.id);
    else if (a.action === "replan")
      return Response.json({ id: replan(ctx, a.id) });
    else decide(ctx, a.id, a.action);
    return Response.json({ id: a.id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Operation failed" },
      { status: 409 },
    );
  }
}
