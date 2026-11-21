"use client";

import { LoaderCircle } from "lucide-react";

export type DecisionOption = { id: string; label: string; hint?: string; primary?: boolean };

/** ARO's standard inline decision rows, shared with resource approvals. */
export function DecisionOptions<T extends DecisionOption>({ choices, busy, onChoose }: {
  choices: T[]; busy: string | null; onChoose: (choice: T) => void;
}) {
  return <div className="animate-enter overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
    {choices.map((choice, index) => <button key={choice.id} type="button" disabled={busy !== null}
      onClick={() => onChoose(choice)}
      className="group flex w-full items-center gap-3 border-t border-zinc-100 px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-zinc-50 disabled:opacity-60">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-zinc-900">{choice.label}</span>
        {choice.hint && <span className="block text-[12px] text-zinc-500">{choice.hint[0].toUpperCase() + choice.hint.slice(1)}</span>}
      </span>
      {choice.primary && choices.length > 1 && <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-medium text-brand-ink">Recommended</span>}
      {busy === choice.id ? <LoaderCircle className="size-4 animate-spin text-zinc-400" /> :
        <kbd className="grid h-5 min-w-5 place-items-center rounded-[5px] bg-zinc-100 px-1 font-mono text-[10.5px] text-zinc-500 ring-1 ring-zinc-200/80 transition-colors group-hover:bg-zinc-900 group-hover:text-white group-hover:ring-zinc-900">{index + 1}</kbd>}
    </button>)}
  </div>;
}
