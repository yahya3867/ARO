import { eq } from "drizzle-orm";

import type { AppContext } from "../context";

import { actors } from "../db/schema";

export type ActorRow = typeof actors.$inferSelect;

const cache = new WeakMap<AppContext, Map<string, ActorRow>>();

export function getActor(ctx: AppContext, id: string): ActorRow | undefined {
  let map = cache.get(ctx);
  if (!map) {
    map = new Map();
    cache.set(ctx, map);
  }
  const hit = map.get(id);
  if (hit) return hit;
  const row = ctx.db.select().from(actors).where(eq(actors.id, id)).get();
  if (row) map.set(id, row);
  return row;
}
