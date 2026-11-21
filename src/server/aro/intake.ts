import {recordActivity} from "../activity";
import { z } from "zod";
import { appendAudit, stableStringify } from "../audit";
import { nowIso, txImmediate, type AppContext } from "../context";
import { detect, NoShortage } from "./service";
import { planningDay } from "./store";

const base = {
  eventId: z.string().min(1).max(120),
  facility: z.string().min(1),
  resource: z.enum(["food", "water", "power", "medicine"]),
  lot: z.string().min(1).max(100),
  units: z.number().int().positive().max(1000000),
};
export const observation = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("receipt"),
      expected: z.number().int().nonnegative(),
      expires: z.iso.date(),
      order: z.string().optional(),
    })
    .strict(),
  z.object({ ...base, kind: z.literal("usage") }).strict(),
]);
export function releaseOrder(c: AppContext, id: string) {
  txImmediate(c, () => {
    const result = c.sqlite
      .prepare(
        "UPDATE replenishments SET status='authorized' WHERE incident=? AND status='draft'",
      )
      .run(id);
    if (!result.changes)
      throw Error("No draft replenishment for this incident");
    appendAudit(c, {
      actorId: "operator",
      category: "decision",
      action: "replenishment.authorize",
      workItemId: id,
    });
  });
}
export function ingest(c: AppContext, input: z.infer<typeof observation>) {
  return txImmediate(c, () => {
    const db = c.sqlite;
    const existing = db
      .prepare("SELECT body,incident FROM observations WHERE id=?")
      .get(input.eventId) as
      { body: string; incident: string | null } | undefined;
    if (existing) {
      if (existing.body !== stableStringify(input))
        throw Error("Event ID already belongs to another observation");
      return existing.incident;
    }
    if (input.kind === "usage") {
      const updated = db
        .prepare(
          "UPDATE inventories SET quantity=quantity-? WHERE facility=? AND resource=? AND lot=? AND quantity>=? AND available=1 AND expires>?",
        )
        .run(
          input.units,
          input.facility,
          input.resource,
          input.lot,
          input.units,
          planningDay,
        );
      if (!updated.changes) throw Error("Usage exceeds usable stock");
      db.prepare(
        "INSERT INTO consumption VALUES (?,?,?,?) ON CONFLICT(facility,resource,day) DO UPDATE SET units=units+excluded.units",
      ).run(input.facility, input.resource, planningDay, input.units);
    } else {
      if (input.order) {
        const order = db
          .prepare(
            "UPDATE replenishments SET status='received' WHERE incident=? AND resource=? AND status='authorized' AND units=? AND ? IN (SELECT source FROM routes WHERE resource=?)",
          )
          .run(
            input.order,
            input.resource,
            input.units,
            input.facility,
            input.resource,
          );
        if (!order.changes)
          throw Error("Receipt does not match an authorized replenishment");
      }
      const receipt = db
        .prepare(
          "INSERT INTO inventories VALUES (?,?,?,?,0,1,?) ON CONFLICT(facility,resource,lot) DO UPDATE SET quantity=quantity+excluded.quantity WHERE expires=excluded.expires",
        )
        .run(
          input.facility,
          input.resource,
          input.lot,
          input.units,
          input.expires,
        );
      if (!receipt.changes)
        throw Error("Conflicting expiration for existing lot");
      db.prepare(
        "INSERT INTO deliveries(facility,resource,expected,received) VALUES (?,?,?,?)",
      ).run(input.facility, input.resource, input.expected, input.units);
    }
    if(input.kind==="receipt" && input.order){
      recordActivity(c,{workItemId:input.order,actorId:"vendor",type:"COMPLETED",title:"Supplier delivery reconciled",result:{quantity:input.units,facility:input.facility,lot:input.lot,receipt:input.eventId}});
      appendAudit(c,{actorId:"vendor",category:"posting",action:"supplier.delivery.reconciled",workItemId:input.order,details:{receipt:input.eventId,quantity:input.units}});
    }
    let incident: string | null = null;
    try {
      incident = detect(c, input.resource);
    } catch (e) {
      if (!(e instanceof NoShortage)) throw e;
    }
    db.prepare("INSERT INTO observations VALUES (?,?,?)").run(
      input.eventId,
      stableStringify(input),
      incident,
    );
    appendAudit(c, {
      actorId: "operator",
      category: "write",
      action: "inventory." + input.kind,
      workItemId: incident,
      details: { ...input, recorded: nowIso() },
    });
    return incident;
  });
}
