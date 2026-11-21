"use client";
import useSWR from "swr";
import Link from "next/link";
import type { AuditData } from "@/server/queries";
import { fetcher } from "@/lib/api";
import { EventsTable } from "../audit/audit-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import type { Snapshot } from "@/server/aro/runtime";
type Data = Pick<AuditData, "events" | "actors" | "chain"> & {
  policies: { id: string; objective: string }[];
  ledger: {
    incident: string;
    source: string;
    destination: string;
    resource: string;
    units: number;
    lot: string;
  }[];
};
export function ResourceAudit({ incident, offline = false, snapshot }: { incident: string; offline?: boolean; snapshot?: Snapshot }) {
  const { data, error } = useSWR<Data>(
    offline ? null : "/api/resource-audit?incident=" + encodeURIComponent(incident),
    fetcher,
    { refreshInterval: 2500 },
  );
  if (offline) return <div className="h-full overflow-y-auto p-6">
    <h1 className="text-2xl font-semibold">Cached execution events</h1>
    <p className="my-3 text-sm">The server audit chain cannot be verified while disconnected. These are saved activity records, not a current audit certification. Export inventory and manual procedures from Blackout kit.</p>
    <ul className="divide-y">{snapshot?.activity.map(e => <li key={e.id} className="py-3 text-sm">{e.createdAt} · {e.actorId} · {e.title}</li>)}</ul>
  </div>;
  return (
    <div className="h-full overflow-y-auto">
      <Tabs defaultValue="events" className="gap-0">
        <header className="px-6 pt-7 pb-4">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight">
            Audit trail
          </h1>
          <p className="mt-1.5 text-[14px] text-zinc-600">
            Every step the team took, every transfer, and every call you made.
          </p>
          <TabsList className="mt-4">
            {["Events", "Policies", "Transfer ledger"].map((t) => (
              <TabsTrigger key={t} value={t === "Events" ? "events" : t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          {incident && (
            <Link className="ml-4 text-xs" href="/audit">
              All incidents ↗
            </Link>
          )}
        </header>
        {error ? (
          <p role="alert">Could not load audit records.</p>
        ) : data ? (
          <>
            <TabsContent value="events">
              <div className="px-6 pb-3 text-xs text-zinc-500">
                {data.chain.ok ? "Hash chain verified" : "Audit chain mismatch"}{" "}
                · {data.chain.count} records
              </div>
              <EventsTable data={data} resource />
            </TabsContent>
            <TabsContent value="Policies" className="px-6">
              {data.policies.map((p) => (
                <div className="border-t py-4" key={p.id}>
                  <b>{p.id.toUpperCase()}</b>
                  <p>{p.objective}</p>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="Transfer ledger" className="px-6">
              {data.ledger.length ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Task",
                        "Resource",
                        "Source",
                        "Destination",
                        "Lot",
                        "Units",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.map((r, i) => (
                      <tr className="border-t" key={i}>
                        <td>
                          <Link href={"/canvas?task=" + r.incident}>
                            {r.incident}
                          </Link>
                        </td>
                        {[
                          r.resource,
                          r.source,
                          r.destination,
                          r.lot,
                          r.units,
                        ].map((v, j) => (
                          <td className="py-2" key={j}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No transfers posted yet.</p>
              )}
            </TabsContent>
          </>
        ) : (
          <p className="px-6">Loading audit records…</p>
        )}
      </Tabs>
    </div>
  );
}
