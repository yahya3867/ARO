"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/server/aro/runtime";
import { AroAvatar } from "./aro-avatar";
import { Typed } from "../review/decision-thread";
import { DecisionOptions } from "../review/decision-options";

export function ResourceTransferDecision({ data, busy, operatorKey, onKeyChange, onDecide }: {
  data: Snapshot;
  busy: boolean;
  operatorKey: string;
  onKeyChange: (value: string) => void;
  onDecide: (decision: "approve" | "reject") => Promise<void>;
}) {
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const total = data.lines.reduce((sum, line) => sum + line.units, 0);
  const unit = data.current!.unit;
  const byFacility = new Map<string, number>();
  for (const line of data.lines)
    byFacility.set(line.facility, (byFacility.get(line.facility) ?? 0) + line.units);
  const destinations = [...byFacility].map(([facility, units]) =>
    units + " " + unit + " to " + (data.facilities[facility] ?? facility),
  ).join(" and ");
  const opener = "The plan sends " + destinations + ". I'd approve the transfer.";
  const choices: {id:"approve"|"reject";label:string;hint:string;primary?:boolean}[] = [
    {id:"approve",label:"Approve transfer",hint:"Move " + total + " " + unit,primary:true},
    {id:"reject",label:"Decline transfer",hint:"Keep current inventory"},
  ];
  async function choose(decision: "approve" | "reject") {
    if (busy || active || !typed) return;
    setActive(decision);
    try { await onDecide(decision); }
    finally { setActive(null); }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!typed || busy || active || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT","TEXTAREA","SELECT"].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === "1" || event.key === "2") {
        event.preventDefault();
        void choose(event.key === "1" ? "approve" : "reject");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return <div className="animate-enter space-y-4">
    <div className="text-[13.5px] leading-relaxed text-zinc-800">
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
        <AroAvatar actorId="finance" size={20} />
        Resource Allocator
      </div>
      <Typed text={opener} onDone={() => setTyped(true)} />
    </div>
    {typed && <>
      {!data.demo && <label className="block text-xs text-zinc-500">
        Operator key
        <input aria-label="Operator key" type="password" autoComplete="off" value={operatorKey}
          onChange={event => onKeyChange(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-2" />
      </label>}
      <DecisionOptions choices={choices} busy={active ?? (busy ? "pending" : null)} onChoose={choice => void choose(choice.id)} />
    </>}
  </div>;
}
