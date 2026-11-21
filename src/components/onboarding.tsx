"use client";

import { ArrowRight, X } from "lucide-react";

import { HollowStrip } from "./aro/hollow-strip";

import { ResourceMarker } from "./aro/resource-marker";

import { PixelAgent } from "./pixel-agent";

export function Onboarding({ open, onClose, onStart }: {
    resource?: boolean;
    open: boolean;
    publicDemo: boolean;
    onClose: () => void;
    onStart: () => void;
}) {
    if (!open)
        return null;
    const close = () => {
        onClose();
    };
    const start = () => {
        onStart();
    };
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/30 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="animate-enter relative w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200">
        {/* the resource crew in the Hollow */}
        <div className="relative h-[92px]">
          {<HollowStrip seed={3} className="absolute inset-0 size-full"/>}
          <div className="absolute inset-x-0 bottom-2 flex items-end justify-center gap-2" aria-hidden>
            {(["aro.capacity", "aro.compute", "aro.finance", "aro.operator", "aro.vendor", "aro.budget", "aro.policy"]).map((id) => (<PixelAgent key={id} actorId={id} size={id === "you" ? 32 : 24}/>))}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg bg-white/80 text-zinc-500 backdrop-blur-sm hover:bg-white hover:text-zinc-900">
            <X className="size-4"/>
          </button>
        </div>

        <div className="px-7 pt-6 pb-7">
          <h1 id="onboarding-title" className="text-[24px] leading-[1.15] font-semibold tracking-[-0.02em] text-zinc-950">
            {"Meet your tiny resource team"}
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">{"Six AI specialists coordinate supplies across the Hollow. You’re the coordinator: you just make the calls."}</p>

          <ol className="mt-5 space-y-3.5">
            {([{ title: "Pick a resource event", body: "Try the Level 8 clinic: a medicine shipment arrived 16 kits short." }, { title: "Watch, then decide", body: "The team digs in on the canvas and asks you to approve a transfer." }, { title: "Play the supplier", body: "On the task, approve replenishment, then simulate the delivery and watch it close." }]).map((s, i) => (<li key={s.title} className="flex gap-3">
                {(<span className="mt-0.5 shrink-0">
                    <ResourceMarker color={["yellow", "pink", "purple"][i] as "yellow" | "pink" | "purple"} size={16}/>
                  </span>)}
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-zinc-900">{s.title}</div>
                  <div className="text-[13px] leading-snug text-zinc-500">{s.body}</div>
                </div>
              </li>))}
          </ol>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <button type="button" onClick={start} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-[14px] font-medium text-white hover:bg-zinc-800">
              {"Pick a resource event"}
              <ArrowRight className="size-4"/>
            </button>
            <button type="button" onClick={close} className="h-10 rounded-lg px-3 text-[14px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              Look around first
            </button>
          </div>


        </div>
      </div>
    </div>);
}
