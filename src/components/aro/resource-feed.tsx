"use client";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/server/aro/runtime";
import { crew } from "@/server/aro/catalog";
import { resourceFacts, factSummary } from "@/lib/resource-explanations";
import { AroAvatar } from "./aro-avatar";

type Event = Snapshot["events"][number];
const names: Record<string, string> = {
  ...Object.fromEntries(crew.map(a => [a.id, a.name])),
  director: "Operations Director", operator: "You",
};

function explain(e: Event, data: Snapshot): string[] {
  if (typeof e.result.agentSummary === "string") return e.result.agentSummary.split("\n\n");
  return factSummary(resourceFacts(e.title, e.result, data.current!.unit, data.facilities)).split("\n\n");
}

function Typed({ text, live }: { text: string; live: boolean }) {
  const [shown, setShown] = useState(live ? 0 : text.length);
  useEffect(() => {
    if (!live) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setShown(text.length));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor((now - start) * .09));
      setShown(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, live]);
  const reduced = !live;
  return <>{reduced ? text : text.slice(0, shown)}</>;
}

export function ResourceFeed({ data, onEvidence, paused = false }: {
  data: Snapshot; onEvidence: (id: number) => void; paused?: boolean;
}) {
  const [openedAt] = useState(Date.now);
  const events = [...data.events].sort((a, b) => a.id - b.id);
  return <div className="mt-4 space-y-3">
    {events.map((e, i) => {
      if (!["TOOL_CALL", "COMPLETED", "ERROR", "APPROVAL_DECISION"].includes(e.type))
        return <div key={e.id} className="flex items-start gap-2 text-[12px] leading-snug text-zinc-400">
          <span className="mt-[5px] size-1 shrink-0 rounded-full bg-zinc-300" />
          {e.type === "HANDOFF" ? (names[e.actor] ?? e.actor) + " · " + e.title : e.title}
        </div>;
      if (e.type === "APPROVAL_DECISION")
        return <div key={e.id} className="flex justify-end"><div className="rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[13px]">{e.title}</div></div>;
      const grouped = events[i - 1]?.actor === e.actor && events[i - 1]?.type === e.type;
      const paragraphs = e.type === "ERROR" ? [e.title, String(e.result.reason ?? "Open the evidence for details.")] : explain(e, data);
      return <div key={e.id} className="animate-enter">
        {!grouped && <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-zinc-600">
          <AroAvatar actorId={e.actor} size={20} />
          {names[e.actor] ?? e.actor}
          <time dateTime={e.time} className="font-normal text-zinc-400">{new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>}
        <div className="space-y-2 pl-[26px] text-[13.5px] leading-relaxed text-zinc-800">
          {paragraphs.map((text, index) => <p key={index}><Typed text={text} live={!paused && Date.parse(e.time) > openedAt} /></p>)}
          <button className="text-[12px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900" onClick={() => onEvidence(e.id)}>View evidence ↗</button>
        </div>
      </div>;
    })}
    {data.agents.filter(a => !paused && a.status === "working" && a.currentWorkItemId === data.current?.id).map(a =>
      <div key={a.agentId} className="flex items-center gap-2 text-[12px] text-zinc-500">
        <AroAvatar actorId={a.agentId.replace("aro.", "")} size={20} working />{names[a.agentId.replace("aro.", "")]} is working <span className="animate-pulse">•••</span>
      </div>)}
  </div>;
}
