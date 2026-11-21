import { z } from "zod";
import { appendAudit } from "../audit";
import { needs } from "./service";
import { scenarios, type Resource } from "./catalog";
import type { AppContext } from "../context";
import { discussCase } from "./case-discussion";
export const discussionInput = z
  .object({
    id: z.string().regex(/^INC-\d+$/).optional(),
    scope: z.literal("workspace").optional(),
    question: z.string().trim().min(1).max(1200),
    event: z.number().int().positive().optional(),
  })
  .strict();
export async function discuss(
  ctx: AppContext,
  { id, question, event, scope }: z.infer<typeof discussionInput>,
) {
  if (!id || scope === "workspace") {
    const pending = ctx.sqlite.prepare(
      "SELECT i.id,i.resource,i.state,r.status orderState FROM incidents i LEFT JOIN replenishments r ON r.incident=i.id WHERE i.state IN ('review','blocked','replenishment') OR r.status='draft'",
    ).all() as {id:string;resource:Resource;state:string;orderState:string|null}[];
    const shortages = (Object.keys(scenarios) as Resource[]).flatMap(resource =>
      needs(ctx, resource).filter(f => f.stock < f.minimum).map(f =>
        f.name + " has " + f.stock + " " + resource + " units against an essential minimum of " + f.minimum + "."),
    );
    const approvals = pending.length ? pending.map(i =>
      i.id + " · " + scenarios[i.resource] + (i.state === "review" ? " awaits transfer approval." : i.orderState === "draft" ? " has a replenishment draft to authorize." : " needs operator review."),
    ).join("\n") : "No transfers or replenishment drafts currently need your approval.";
    const answer = /approv|decision|attention|needs? (me|my)/i.test(question)
      ? approvals
      : /short|low|stock|resource|suppl|fair|coverage/i.test(question)
        ? shortages.join("\n") || "All facilities meet their essential minimums."
        : approvals + "\n" + (shortages.join("\n") || "All essential minimums are covered.");
    appendAudit(ctx, {actorId:"operator",category:"read",action:"workspace.discuss",details:{question,answer,mode:"deterministic"}});
    return {answer};
  }
  return discussCase(ctx, {id, question, event});
}
