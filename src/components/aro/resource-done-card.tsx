"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/server/aro/runtime";
import { crew } from "@/server/aro/catalog";
import { resourceCompletion } from "@/lib/resource-completion";
import { cn } from "@/lib/utils";
import { DoneMark } from "../canvas/done-card";
import { AgentAvatar } from "../status";
import { toast } from "sonner";

const names: Record<string, string> = { ...Object.fromEntries(crew.map(a => [a.id, a.name])), operator: "You", director: "Operations Director" };

/** ARO's canvas-level completion scene, separate from the permanent recap. */
export function ResourceCompletionScene({title}:{title:string}) {
  return <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center" role="status" aria-label="Resource operation completed">
    <div className="done-rise flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-6 py-5 shadow-lg ring-1 ring-primary/40 backdrop-blur-sm">
      <DoneMark burst size={64}/>
      <div className="text-[15px] font-semibold text-zinc-900">Done</div>
      <div className="max-w-[320px] text-center text-[13px] leading-snug text-zinc-600">{title}</div>
    </div>
  </div>;
}

export function ResourceCompletionBurst({data,justFinished,paused=false}:{data?:Snapshot;justFinished:boolean;paused?:boolean}) {
  const id=data?.current?.id;
  const title=data?resourceCompletion(data)?.title:undefined;
  const [burst,setBurst]=useState<{id:string;title:string}|null>(null);
  useEffect(()=>{
    if(!justFinished || !id || !title) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const frame=requestAnimationFrame(()=>{
      setBurst({id,title});
      toast.success(id+" is done",{description:title});
      timer=setTimeout(()=>setBurst(null),2200);
    });
    return ()=>{cancelAnimationFrame(frame);if(timer) clearTimeout(timer);};
  },[id,title,justFinished]);
  return burst && burst.id===id && justFinished && !paused ? <ResourceCompletionScene title={burst.title}/> : null;
}

/** Match ARO's one-time finale when the currently visible task finishes. */
export function useResourceJustFinished(data?: Snapshot) {
  const id = data?.current?.id;
  const state = data?.current?.state;
  const key = id ? `${data?.epoch}:${id}` : null;
  const seen = useRef<{ key: string | null; state: string | undefined } | null>(null);
  const [finishedKey, setFinishedKey] = useState<string | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { key, state };
    if (prev?.key !== key) setFinishedKey(null);
    else if (prev && prev.state !== "completed" && state === "completed") setFinishedKey(key);
  }, [key, state]);
  return key !== null && finishedKey === key;
}

/** ARO's DoneFinale layout and motion, populated from ARO's completed execution. */
export function ResourceDoneFinale({ data, justFinished }: { data: Snapshot; justFinished: boolean }) {
  const s = resourceCompletion(data);
  if (!s) return null;
  const figures = [
    { key: "transferred", label: "Transferred", value: s.units, tone: "text-zinc-900" },
    { key: "facilities", label: "Facilities", value: s.communities, tone: "text-zinc-900" },
    { key: "coverage", label: "Coverage", value: s.coverage + "%", tone: "text-brand-ink" },
  ];
  const team = [s.agents.length ? s.agents.length + (s.agents.length === 1 ? " agent" : " agents") : null,
    s.calls ? s.calls + (s.calls === 1 ? " call" : " calls") + " from you" : "no input from you"].filter(Boolean).join(" and ");
  const rise = (i: number) => justFinished ? { className: "done-rise", style: { animationDelay: 300 + i * 90 + "ms" } } : { className: "", style: undefined };
  return <div className={cn("overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200", justFinished ? "done-rise" : "animate-enter")} aria-label="Completed resource operation">
    <div className="px-4 pt-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-brand-ink">
        <DoneMark burst={justFinished} size={16} />
        {s.took ? "Done in " + s.took : "Done"}
      </div>
      <div className="mt-1.5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-zinc-950">{s.title}</div>
      {s.agents.length ? <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
        <span className="flex -space-x-1.5">
          {s.agents.map(actor => <AgentAvatar key={actor} actorId={"aro." + actor} size="md" className="ring-2 ring-white" />)}
        </span>
        <span>{team}</span>
      </div> : null}
    </div>
    <div className={cn("px-4 pt-4", rise(0).className)} style={rise(0).style}>
      <dl className="flex divide-x divide-zinc-200 rounded-xl bg-zinc-50 py-2.5 ring-1 ring-zinc-100">
        {figures.map(f => <div key={f.key} className="min-w-0 flex-1 px-3">
          <dt className="text-[11px] text-zinc-500">{f.label}</dt>
          <dd className={cn("mt-0.5 text-[15px] leading-tight font-semibold tracking-[-0.01em] tnum", f.tone)}>{f.value}</dd>
        </div>)}
      </dl>
    </div>
    <div className="px-4 pt-4 pb-4">
      <ol className="relative space-y-3 before:absolute before:top-2.5 before:bottom-2.5 before:left-[9px] before:w-px before:bg-zinc-200">
        {s.steps.map((step, i) => <li key={i} className={cn("relative flex gap-2.5", rise(2 + i).className)} style={rise(2 + i).style}>
          <span className="relative z-10 h-fit rounded-full bg-white ring-[3px] ring-white"><AgentAvatar actorId={"aro." + step.actor} size="sm" /></span>
          <div className="min-w-0 text-[12.5px] leading-snug">
            <span className="font-medium text-zinc-800">{names[step.actor] ?? step.actor}</span>{" "}<span className="text-zinc-500">{step.text}</span>
          </div>
        </li>)}
      </ol>
    </div>
  </div>;
}
