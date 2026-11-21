import Link from "next/link";
import { StageBoard } from "../dashboard/board";
import { scenarios } from "@/server/aro/catalog";
import type { Snapshot } from "@/server/aro/runtime";
function stage(i: Snapshot["incidents"][number]) {
  if (i.state === "working") return i.step < 3 ? "investigate" : "propose";
  if (i.state === "approved") return "propose";
  if (["review", "blocked", "replenishment"].includes(i.state)) return "needs_you";
  if (i.orderState === "authorized") return "vendor";
  return "done";
}
export function ResourceBoard({ data, offline = false }: { data?: Snapshot; offline?: boolean }) {
  const Navigation = offline ? "a" : Link;
  return (
    <StageBoard
      resource
      entries={(key) => {
        const items = data?.incidents.filter((i) => stage(i) === key) ?? [],
          shown = key === "done" ? items.slice(0, 6) : items;
        return {
          count: items.length,
          cards: (
            <>
              {shown.map((i) => (
                <Navigation
                  key={i.id}
                  href={"/canvas?task=" + i.id}
                  className="card-soft mx-auto block w-full max-w-[260px] animate-enter p-3.5 text-left transition-transform hover:-translate-y-px"
                >
                  <div className="flex justify-between text-[11.5px] text-zinc-500">
                    <span>{i.id}</span>
                    <span>
                      {key === "vendor"
                        ? "Awaiting receipt"
                        : key === "needs_you"
                          ? "Your turn"
                          : i.state}
                    </span>
                  </div>
                  <div className="mt-2 text-[14px] font-medium">
                    {scenarios[i.resource]}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{i.unit}</div>
                </Navigation>
              ))}
              {items.length > shown.length && (
                <small>+{items.length - shown.length} more</small>
              )}
            </>
          ),
        };
      }}
    />
  );
}
