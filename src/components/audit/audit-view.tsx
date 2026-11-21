"use client";

import Link from "next/link";

import { Fragment, useState } from "react";

import { ChevronRight } from "lucide-react";

import { clockTime } from "@/lib/format";

import { cn } from "@/lib/utils";

import type { AuditData } from "@/server/queries";

import { JsonView } from "../json-view";

import { AgentAvatar } from "../status";

import { Input } from "../ui/input";

type Filter = "all" | "decision" | "posting" | "denied" | "agents";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "decision", label: "Decisions" },
  { key: "posting", label: "Postings" },
  { key: "agents", label: "Agent tool calls" },
  { key: "denied", label: "Denied or failed" },
];

const OUTCOME_TONE: Record<string, string> = {
  ALLOWED: "text-zinc-500",
  DENIED: "text-destructive",
  FAILED: "text-brand-ink",
};

export function EventsTable({ data,resource=false }: { data: Pick<AuditData,"events"|"actors">;resource?:boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const counts: Record<Filter, number> = {
    all: data.events.length,
    decision: data.events.filter((e) => e.category === "decision").length,
    posting: data.events.filter((e) => e.category === "posting").length,
    agents: data.events.filter((e) => e.actorKind === "agent").length,
    denied: data.events.filter((e) => e.outcome !== "ALLOWED").length,
  };
  const rows = data.events.filter((e) => {
    if (filter === "decision" && e.category !== "decision") return false;
    if (filter === "posting" && e.category !== "posting") return false;
    if (filter === "denied" && e.outcome === "ALLOWED") return false;
    if (filter === "agents" && e.actorKind !== "agent") return false;
    if (!q) return true;
    return [e.action, e.workItemId, e.targetId, e.actorId, e.policyId, e.approvalId, e.rule].some((v) => (v ?? "").toLowerCase().includes(q));
  });
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 transition-colors",
                filter === f.key ? "bg-zinc-900 text-white ring-zinc-900" : "text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900",
              )}
            >
              {f.label} <span className={cn("ml-0.5 tnum", f.key === "denied" && counts.denied ? "text-destructive" : filter === f.key ? "text-white/55" : "text-zinc-400")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by work item, action, policy, approval" className="ml-auto h-8 max-w-[300px] rounded-full px-3.5 text-[12.5px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[12px]">
          <thead>
            <tr className="border-b text-left text-[11px] text-muted-foreground">
              <th className="py-2 pr-2 pl-6 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Time</th>
              <th className="px-2 py-2 font-medium">Actor</th>
              <th className="px-2 py-2 font-medium">Action</th>
              <th className="px-2 py-2 font-medium">Outcome</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Work item</th>
              <th className="px-2 py-2 font-medium">Rule / authorization</th>

            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <Fragment key={e.id}>
                <tr onClick={() => setOpen(open === e.id ? null : e.id)} className="cursor-pointer border-b hover:bg-zinc-50">
                  <td className="py-2 pr-2 pl-6 font-mono text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ChevronRight className={cn("size-3 transition-transform", open === e.id && "rotate-90")} />
                      {e.id}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-zinc-600 tnum">{clockTime(e.ts)}</td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <AgentAvatar actorId={resource?"aro."+e.actorId:e.actorId} size="sm" />
                      {data.actors[e.actorId]?.name ?? e.actorId}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">{e.action}</td>
                  <td className="px-2 py-2">
                    <span className={cn("text-[11px] font-medium", OUTCOME_TONE[e.outcome])}>{e.outcome.toLowerCase()}</span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] whitespace-nowrap">
                    {e.workItemId ? (
                      <Link onClick={(ev) => ev.stopPropagation()} className="text-brand-ink hover:underline" href={"/canvas?task=" + e.workItemId}>
                        {e.workItemId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-6 pl-2 text-[11px] text-zinc-600">
                    {[e.rule, e.approvalId, e.policyId].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
                {open === e.id ? (
                  <tr className="border-b bg-zinc-50/60">
                    <td colSpan={7} className="px-6 py-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
                        <JsonView value={e.details} className="max-h-60" />
                        <div className="space-y-1 font-mono text-[10.5px] text-zinc-600">
                          <div>ts {e.ts}</div>
                          {e.targetId ? <div className="break-all">target {e.targetId}</div> : null}
                          <div className="break-all">prev {e.prevHash}</div>
                          <div className="break-all">hash {e.hash}</div>
                          {e.evidenceIds.length ? <div className="break-all">evidence {e.evidenceIds.join(", ")}</div> : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">No events match.</div> : null}
      </div>
    </div>
  );
}
