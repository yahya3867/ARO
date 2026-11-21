import { AroAvatar } from "./aro/aro-avatar";

import { User, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";

import { PixelAgent, spriteTint } from "./pixel-agent";

export const STATE_META: Record<string, { label: string; dot: string }> = {
 working:{label:"Investigating",dot:"bg-primary"},review:{label:"Needs approval",dot:"bg-primary"},approved:{label:"Authorized",dot:"bg-primary"},blocked:{label:"Needs attention",dot:"bg-amber-400"},completed:{label:"Completed",dot:"bg-primary"},rejected:{label:"Declined",dot:"bg-zinc-400"},replenishment:{label:"Awaiting supplier",dot:"bg-amber-400"},new:{label:"New",dot:"bg-zinc-400"}
};

export function StateDot({ state, className }: { state: string; className?: string }) {
  const meta = STATE_META[state] ?? STATE_META.new;
  return <span title={meta.label} className={cn("inline-block size-2 shrink-0 rounded-full", meta.dot, state === "working" && "animate-pulse", className)} />;
}

export function StateBadge({ state, className }: { state: string; className?: string }) {
  const meta = STATE_META[state] ?? STATE_META.new;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-zinc-700", className)}>
      <StateDot state={state} />
      {meta.label}
    </span>
  );
}

export function AgentAvatar({ actorId, size = "md", className }: { actorId: string; size?: "sm" | "md" | "lg"; className?: string }) {
  if (actorId === "aro.operator" || actorId === "aro.director") {
    const box = size === "sm" ? "size-5 rounded-[5px]" : size === "lg" ? "size-9 rounded-lg" : "size-6 rounded-md";
    const pixels = size === "sm" ? 16 : size === "lg" ? 32 : 20;
    return <span className={cn("inline-grid shrink-0 place-items-center overflow-hidden bg-zinc-100", box, className)}>
      <AroAvatar actorId={actorId.slice(4)} size={pixels} still={size === "sm"} />
    </span>;
  }
  const tint = spriteTint(actorId);
  if (tint) {
    const box = size === "sm" ? "size-5 rounded-[5px]" : size === "lg" ? "size-9 rounded-lg" : "size-6 rounded-md";
    const px = size === "sm" ? 16 : size === "lg" ? 32 : 20;
    return (
      <span className={cn("inline-grid shrink-0 place-items-center overflow-hidden", box, className)} style={{ background: tint }}>
        <PixelAgent actorId={actorId} size={px} still={size === "sm"} />
      </span>
    );
  }
  const style = { icon: actorId === "system.orchestrator" ? Workflow : User, className: "bg-zinc-200 text-zinc-700" };
  const Icon = style.icon;
  const dims = size === "sm" ? "size-5 text-[9px]" : size === "lg" ? "size-9 text-xs" : "size-6 text-[10px]";
  const iconDims = size === "sm" ? "size-3" : size === "lg" ? "size-4.5" : "size-3.5";
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", dims, style.className, className)}>
      <Icon className={iconDims} />
    </span>
  );
}

export function modeLabel(mode: string | null | undefined) {
  if (!mode) return null;
  return mode === "llm" ? "LLM" : "Replay";
}
