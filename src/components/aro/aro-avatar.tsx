import type { SpriteMood } from "../pixel-agent";
import { AROPixelAgent } from "./aro-pixel-agents";
import type { Seat } from "@/server/aro/catalog";

const sprites: Record<Seat | "director" | "operator", string> = {
  compute: "pip-boy",
  budget: "nuka-girl",
  vendor: "dough-boy",
  finance: "bottle",
  capacity: "petro-chico",
  policy: "cappy",
  director: "vault-boy",
  operator: "vault-boy",
};

export function AroAvatar({ actorId, size = 48, working = false, mood, still = false, className }: {
  actorId: string;
  size?: number;
  working?: boolean;
  mood?: SpriteMood;
  still?: boolean;
  className?: string;
}) {
  if (!Object.hasOwn(sprites, actorId)) return null;
  return <AROPixelAgent className={className} id={sprites[actorId as keyof typeof sprites]} size={size} mood={mood} motion={still ? "still" : working ? "working" : "idle"} />;
}
