"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { Snapshot } from "@/server/aro/runtime";
import { scenarios } from "@/server/aro/catalog";
import { HollowStrip } from "./hollow-strip";
import { ResourceMarker } from "./resource-marker";

const resourceNames = { medicine: "Medicine", food: "Food", water: "Water", power: "Stored power" };
const subscribeToHour = () => () => {};
const localHour = () => new Date().getHours();
const initialHour = () => 12;

export function ResourceHome({ data, onOpen, offline = false }: { data?: Snapshot; onOpen: (id: string) => void; offline?: boolean }) {
  const hour = useSyncExternalStore(subscribeToHour, localHour, initialHour);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(true);
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const waiting = data?.incidents.filter(i => ["review", "blocked", "replenishment"].includes(i.state)) ?? [];
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    if (offline) {
      setAnswer("From the saved checkpoint: " + (data?.overview.map(r => `${resourceNames[r.resource]} covers ${r.coverage}% of essential needs`).join("; ") ?? "no inventory is cached") + ". These figures may be stale. Use Blackout kit for a provisional plan and manual procedures.");
      return;
    }
    setBusy(true);
    setQuestion(text);
    try {
      const response = await fetch("/api/discussion", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "workspace", question: text }),
      });
      const result = await response.json();
      setAnswer(response.ok ? result.answer : result.error);
    } catch { setAnswer("The workspace connection was interrupted. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-full flex-col">
    <HollowStrip seed={5} className="block h-14 w-full shrink-0" />
    <div className="px-5 pt-5">
      <h2 className="!m-0 !text-[24px] leading-[1.15] font-semibold tracking-[-0.02em]">{greeting}, Resistance</h2>
      <p className="mt-1.5 text-[14px] text-zinc-600">
        {offline ? "Saved records. Verify stock locally; server actions are paused." : waiting.length ? waiting.length + (waiting.length === 1 ? " decision needs you." : " decisions need you.") : "The crew is monitoring essential supplies."}
      </p>
      <div className="mt-5 rounded-2xl p-3.5 ring-1 ring-zinc-200">
        <div className="flex justify-between text-[14px] font-medium">
          <span>Essential resource coverage</span><span className="text-[11px] font-normal text-zinc-400">Hollow demo</span>
        </div>
        <ul className="mt-3 space-y-2">
          {data?.overview.map(r => <li key={r.resource} title={r.available + " " + r.unit + " available above reserves"}>
            <div className="flex justify-between gap-2 text-[12px]">
              <span>{resourceNames[r.resource]}</span>
              <span className="text-zinc-500">{r.covered} / {r.minimum} {r.unit}</span>
            </div>
            <div className="relative mt-1 h-1.5 rounded-full bg-zinc-100" role="progressbar"
              aria-label={resourceNames[r.resource] + " essential needs covered"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.coverage}>
              <div className={"h-full rounded-full transition-[width] " + (r.coverage < 100 ? "bg-amber-400" : "bg-primary")} style={{ width: r.coverage + "%" }} />
              <div className="absolute -inset-y-0.5 right-0 w-px bg-zinc-500" />
            </div>
          </li>)}
        </ul>
      </div>
      {[
        { title: "Needs you", items: waiting, color: "pink" as const },
        { title: "In progress", items: data?.incidents.filter(i => ["working", "approved"].includes(i.state)) ?? [], color: "yellow" as const },
        { title: "Done", items: data?.incidents.filter(i => i.state === "completed") ?? [], color: "green" as const },
      ].filter(group => group.items.length).map(group => <section key={group.title} className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-zinc-500"><ResourceMarker color={group.color} size={12} />{group.title}<span className="ml-auto">{group.items.length}</span></div>
        {group.items.map(i => <button key={i.id} onClick={() => onOpen(i.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-[12.5px] hover:text-zinc-500">
          {scenarios[i.resource]}<ArrowUpRight size={12} />
        </button>)}
      </section>)}
      <section className="mt-5">
        <button className="flex w-full items-center gap-2 text-[12px] text-zinc-500" onClick={() => setFeedsOpen(!feedsOpen)} aria-expanded={feedsOpen}>
          <ResourceMarker color="purple" size={12} />{offline ? "Saved event feeds" : "Running on its own"}<ChevronDown size={12} className="ml-auto" />
        </button>
        {feedsOpen && <div className="mt-2 space-y-2">
          {data?.feeds.map(feed => <div key={feed.resource} className="flex items-start gap-2 text-[11.5px]">
            <span className={"mt-1.5 size-1.5 shrink-0 rounded-full " + (feed.runs ? "bg-primary" : "bg-zinc-300")} />
            <span>{resourceNames[feed.resource]} inventory feed</span>
            <span className="ml-auto text-right text-zinc-400">{feed.runs ? `${feed.runs} ${feed.runs === 1 ? "event" : "events"}` : "Ready"}</span>
          </div>)}
          <p className="text-[11px] text-zinc-400">Pick a resource event to start a response.</p>
        </div>}
      </section>
    </div>
    <div className="mt-auto px-4 pt-8 pb-4">
      {answer && <p className="mb-4 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700" aria-live="polite">{answer}</p>}
      {["What needs my approval?", "Where are supplies running low?"].map(text =>
        <button key={text} disabled={busy} className="flex w-full items-center justify-between py-2 text-left text-[12px] text-zinc-500 hover:text-zinc-900" onClick={() => void ask(text)}>{text}<ArrowUpRight size={12} /></button>)}
      <form className="mt-2 flex items-center rounded-full border border-zinc-200 px-3 py-2" onSubmit={e => { e.preventDefault(); void ask(question); }}>
        <input aria-label="Ask about resource operations" placeholder="Ask about resource operations" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1200} />
        <button disabled={busy || !question.trim()} aria-label="Send workspace question" className="ml-2 text-zinc-500 disabled:opacity-40">{busy ? "…" : "↑"}</button>
      </form>
    </div>
  </div>;
}
