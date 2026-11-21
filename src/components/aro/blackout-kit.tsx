"use client";
import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "../ui/button";
import { CrewMeadow } from "../crew-meadow";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { ResourceMarker } from "./resource-marker";
import { scenarios, type Resource } from "@/server/aro/catalog";
import { emergencyKit, inventoryCsv, provisionalPlan, checkpointFresh } from "@/lib/continuity";
import type { useContinuity } from "./use-continuity";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BlackoutKit({ continuity: c, reconnect, onRequest }: {
  continuity: ReturnType<typeof useContinuity>; reconnect: () => Promise<void>; onRequest: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [resource, setResource] = useState<Resource>("medicine");
  const [showPlan, setShowPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const checkpoint = c.checkpoint;
  const unit = checkpoint?.snapshot.overview.find(r => r.resource === resource)?.unit ?? "units";
  const disconnected = c.offline || c.drill;
  const plan = showPlan && checkpoint ? provisionalPlan(checkpoint, resource) : null;
  async function recover() {
    c.endDrill(); setBusy(true); setMessage("");
    try { await reconnect(); setMessage("Connected. Review queued requests before sending them. No approvals were replayed."); }
    catch { setMessage("The server is still unreachable. Continue with cached records and the paper procedure."); }
    finally { setBusy(false); }
  }
  async function send(request: typeof c.queue[number]) {
    if (disconnected) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queued_scan", ...request, createdAt: undefined }), signal: AbortSignal.timeout(10000) });
      const out = await response.json();
      if (!response.ok) throw Error(out.error);
      await c.remove(request.requestId);
      await reconnect();
      onRequest(out.id);
      setMessage("Investigation received. Any resulting transfer still requires approval against current stock.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request remains queued. Retry when connected."); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><ShieldCheck />Blackout kit{c.queue.length ? ` (${c.queue.length})` : ""}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 font-sans sm:max-w-[640px]">
        <CrewMeadow resource seed={11}>
          <DialogClose aria-label="Close" className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg bg-white/80 text-zinc-500 backdrop-blur-sm hover:bg-white hover:text-zinc-900">
            <X className="size-4" />
          </DialogClose>
        </CrewMeadow>
        <div className="px-7 pt-6 pb-5">
          <DialogTitle className="text-[24px] leading-[1.15] font-semibold tracking-[-0.02em]">Blackout kit</DialogTitle>
          <DialogDescription className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">Keep your records and a plan ready before the network goes dark.</DialogDescription>
        </div>
        <div className="space-y-6 px-7 pb-7 text-[13px] leading-relaxed text-zinc-600 [&_button[data-slot=button]]:h-9 [&_button[data-slot=button]]:text-[13px]">
          <section className="space-y-2.5 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <h3 className="flex items-center gap-2 text-[14px] font-medium text-zinc-900"><span aria-hidden="true" className={"size-1.5 shrink-0 rounded-full " + (disconnected ? "bg-amber-500" : "bg-emerald-500")} />{c.drill ? "Outage drill · simulated" : c.offline ? "Server unreachable · cached operation" : "Connected to the operational server"}</h3>
            {checkpoint && <p className="text-xs text-zinc-500">Last server execution mode: {checkpoint.snapshot.mode}. Cached planning never calls an AI service.</p>}
            <p>{checkpoint ? `Last checkpoint: ${new Date(checkpoint.savedAt).toLocaleString()}. These records can become stale; physically verify stock and routes before manual dispatch.` : "No local checkpoint yet. Connect to the server to save inventory before relying on offline access."}</p>
            <p className="text-xs text-zinc-500">{c.shellReady ? "Offline page shell installed on this device." : "Offline page shell not confirmed. Keep this tab open until installation finishes."} Browser storage can be cleared or evicted; keep printed copies too.</p>
            {c.storageError && <p role="alert" className="text-amber-800">{c.storageError}</p>}
            <div className="flex flex-wrap gap-2">
              {!disconnected && <Button variant="outline" size="sm" disabled={!checkpoint} onClick={c.beginDrill}>Simulate server outage</Button>}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void recover()}>{c.drill ? "End drill & reconnect" : "Reconnect"}</Button>
            </div>
            {c.drill && <p className="text-xs text-amber-800">Simulation only: this tab pauses operational server requests. The device’s network is still available. After the offline shell and checkpoint are saved, disconnect this device from the internet and reload the canvas to test an actual outage.</p>}
          </section>
          <section className="space-y-3">
            <h3 className="flex items-center gap-2.5 text-[14px] font-medium text-zinc-900"><ResourceMarker color="yellow" size={12} />Local rationing plan</h3>
            <p>Uses the same deterministic allocator as the server, with saved stock, protected reserves and route capacities. This is provisional advice, not an executed transfer.</p>
            <label className="block space-y-1.5 text-[12.5px] font-medium text-zinc-500"><span className="block">Resource</span><select aria-label="Offline planning resource" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-normal text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2" value={resource} onChange={e => { setResource(e.target.value as Resource); setShowPlan(false); }}>
              {(Object.keys(scenarios) as Resource[]).map(r => <option key={r} value={r}>{scenarios[r]}</option>)}
            </select></label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!checkpoint} onClick={() => setShowPlan(true)}>Calculate local plan</Button>
              <Button variant="outline" size="sm" disabled={!checkpoint || busy} onClick={() => { void c.enqueue(resource).then(() => setMessage("Investigation request saved on this device. It will not send until you reconnect and review it.")).catch(error => setMessage(String(error.message))); }}>Queue investigation request</Button>
            </div>
            {plan && checkpoint && <div className="space-y-2 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200" aria-label="Provisional offline allocation">
              {!checkpointFresh(checkpoint) && <p className="text-amber-800">Checkpoint older than 24 hours or its timestamp is invalid. No cached transfers will be proposed. Recount supplies and use the manual operating procedure.</p>}
              <p className="text-[14px] font-medium text-zinc-900">{plan.metrics.coverage}% essential coverage from cached data</p>
              <p>{plan.metrics.below} facilities below minimum · {plan.metrics.unmet} {unit} of target demand unmet</p>
              <ul className="mt-2 space-y-1">{plan.lines.map((l, i) => <li key={i}>{checkpoint.snapshot.facilities[l.source!] ?? l.source} → {checkpoint.snapshot.facilities[l.facility] ?? l.facility}: {l.units} {unit} via {l.route}</li>)}</ul>
              {!plan.lines.length && <p>No feasible transfer in this checkpoint. Escalate unmet needs to the local coordinator.</p>}
              <p className="mt-2 text-xs text-amber-800">Verify current counts, expiry, donor reserves and safe transport. Obtain local authorization and keep a signed paper ledger. No application inventory has changed.</p>
            </div>}
          </section>
          <section className="space-y-3 border-t border-zinc-100 pt-5">
            <h3 className="flex items-center gap-2.5 text-[14px] font-medium text-zinc-900"><ResourceMarker color="purple" size={12} />Emergency records</h3>
            <p>Download the self-contained kit and print it before power fails. It includes all resource inventories, minimum needs, provisional routes, a blank movement ledger and manual operating procedures.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!checkpoint} onClick={() => checkpoint && download("aro-emergency-kit.html", emergencyKit(checkpoint), "text/html;charset=utf-8")}>Download printable kit</Button>
              <Button variant="outline" size="sm" disabled={!checkpoint} onClick={() => checkpoint && download("aro-inventory.csv", inventoryCsv(checkpoint), "text/csv;charset=utf-8")}>Export inventory CSV</Button>
            </div>
            <p className="text-xs text-zinc-500">With no electricity, use paper copies, physical stock counts and human coordination. No computer or cloud service can continue running without power.</p>
            <details className="rounded-xl p-3 ring-1 ring-zinc-200"><summary className="cursor-pointer text-[13px] font-medium text-zinc-900">Manual operating steps</summary>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
                <li>Appoint a coordinator and witness. Agree on a safe meeting point and a runner or radio schedule.</li>
                <li>Physically count supplies. Exclude expired, damaged and unavailable lots; protect donor needs and safety reserves.</li>
                <li>Confirm urgent essential needs and safe routes. Obtain local authorization before dispatch.</li>
                <li>Use numbered, signed paper dispatch and receipt copies. Record lots, units, time and recipient, and subtract dispatched units in the local ledger immediately.</li>
                <li>Reconcile signed records and fresh physical counts with the operator when service returns. Never replay paper approvals automatically.</li>
              </ol>
            </details>
          </section>
          <section className="space-y-3 border-t border-zinc-100 pt-5">
            <h3 className="flex items-center gap-2.5 text-[14px] font-medium text-zinc-900"><ResourceMarker color="peach" size={12} />Queued investigations<span className="ml-auto rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-zinc-500">{c.queue.length}</span></h3>
            {!c.queue.length && <p className="text-zinc-500">No queued requests. Transfer approvals and dispatches are never queued for automatic execution.</p>}
            {c.queue.map(request => <div key={request.requestId} className="space-y-2 rounded-xl p-3 ring-1 ring-zinc-200">
              <p className="text-[14px] font-medium text-zinc-900">{scenarios[request.resource]}</p><p className="text-xs text-zinc-500">Saved {new Date(request.createdAt).toLocaleString()}</p>
              {checkpoint && request.workspaceId !== checkpoint.snapshot.continuity.workspaceId ? <p className="text-amber-800">Different or reset workspace. Reconcile this request manually; it cannot be replayed here.</p> : <Button size="sm" variant="outline" disabled={disconnected || busy} onClick={() => void send(request)}>Review & send investigation</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void c.remove(request.requestId).catch(() => setMessage("Could not remove the saved request.")); }}>Discard request</Button>
            </div>)}
          </section>
          {message && <p role="status" className="rounded-lg bg-zinc-100 p-3">{message}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
