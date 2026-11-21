"use client";

import { ArrowRight, LoaderCircle, X } from "lucide-react";
import { CrewMeadow } from "../crew-meadow";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { ResourceMarker, type MarkerColor } from "./resource-marker";
import { scenarios, type Resource } from "@/server/aro/catalog";

const OPTIONS: { resource: Resource; color: MarkerColor; body: string }[] = [
  { resource: "medicine", color: "yellow", body: "A Level 8 clinic receives 4 of the 20 medicine kits it expected." },
  { resource: "food", color: "pink", body: "Share a neighborhood’s spare food with communities running short." },
  { resource: "water", color: "purple", body: "Compare the Directorate’s water quotas with a needs-based allocation." },
  { resource: "power", color: "peach", body: "Share stored power across clinics and communities when supplies run low." },
];

export function ResourceEventPicker({ open, resource, busy, error, onPick, onClose, onStart }: {
  open: boolean;
  resource: Resource;
  busy: boolean;
  error: string;
  onPick: (resource: Resource) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  return <Dialog open={open} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[640px]">
      <CrewMeadow resource seed={11}>
        <DialogClose disabled={busy} aria-label="Close" className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg bg-white/80 text-zinc-500 backdrop-blur-sm hover:bg-white hover:text-zinc-900">
          <X className="size-4" />
        </DialogClose>
      </CrewMeadow>
      <div className="px-7 pt-6 pb-7">
        <DialogTitle className="text-[24px] leading-[1.15] font-semibold tracking-[-0.02em]">Pick a resource event</DialogTitle>
        <DialogDescription className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">
          It goes through the same checks and the same team as a real supply shortage.
        </DialogDescription>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map(option => <button key={option.resource} type="button" aria-pressed={resource === option.resource}
            onClick={() => onPick(option.resource)}
            className={"flex gap-3 rounded-xl p-3 text-left ring-1 transition-colors " +
              (resource === option.resource ? "bg-white ring-2 ring-zinc-900" : "ring-zinc-200 hover:bg-zinc-50")}>
            <span className="mt-0.5 shrink-0"><ResourceMarker color={option.color} size={16} /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-zinc-900">{scenarios[option.resource]}</div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-500">{option.body}</p>
            </div>
          </button>)}
        </div>
        {error && <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p>}
        <div className="mt-6 flex items-center gap-2">
          <button type="button" onClick={onStart} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
            Send resource event
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg px-3 text-[14px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">Cancel</button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
