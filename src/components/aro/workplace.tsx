"use client";
import { toast } from "sonner";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleHelp,
  Plus,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrameChat, Composer, useStickToBottom } from "@/components/canvas/sidebar";
import { ResourceConversation } from "./resource-conversation";
import { ResourceTransferDecision } from "./resource-transfer-decision";
import { ResourceHome } from "./resource-home";
import { ResourceTaskTimeline } from "./resource-task-timeline";
import { ResourceCompletionBurst, useResourceJustFinished } from "./resource-done-card";
import { useContinuity } from "./use-continuity";
import { BlackoutKit } from "./blackout-kit";
import { ModelSettings } from "./model-settings";
import { ResourceAudit } from "@/components/aro/resource-audit";
import { ResourceEventPicker } from "./resource-event-picker";
import { ResourceBoard } from "@/components/aro/resource-board";
import { AgentPanel } from "@/components/orbit/agent-panel";
import { Onboarding } from "@/components/onboarding";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Orbit, type Focus } from "@/components/orbit/orbit";
import type { Handoff } from "@/components/orbit/handoff-runner";
import { AroLogo } from "@/components/aro/aro-logo";
import { AroAvatar } from "@/components/aro/aro-avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  crew,
  scenarios,
  type Resource,
  type Seat,
} from "@/server/aro/catalog";
import type { Snapshot } from "@/server/aro/runtime";
import { resourceFrames } from "@/lib/resource-frames";
import { headline } from "@/lib/resource-headlines";
const names: Record<string, string> = {
  ...Object.fromEntries(crew.map((a) => [a.id, a.name])),
  director: "Operations Director",
  operator: "Human operator",
};
const labels: Record<string, string> = {
  working: "In progress",
  approved: "Authorized",
  review: "Awaiting approval",
  completed: "Completed",
  blocked: "Needs attention",
  replenishment: "Replenishment drafted",
  rejected: "Declined",
  superseded: "Superseded",
};
const tidy = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
export default function Workplace() {
  const continuity = useContinuity();
  const { accept: saveLocal, unavailable, drillRef, checkpoint, drill, offline } = continuity;
  const pathname = usePathname(),
    router = useRouter();
  const view =
    pathname === "/board"
      ? "board"
      : pathname === "/audit"
        ? "audit"
        : "canvas";
  const [data, setData] = useState<Snapshot>(),
    [resource, setResource] = useState<Resource>("medicine"),
    [selected, setSelected] = useState("");
  const [focus, setFocus] = useState<Focus>(null),
    [entry, setEntry] = useState<number | null>(null),
    [all, setAll] = useState(false);
  const [dialog, setDialog] = useState<
      "simulate" | "reset" | "help" | "decision" | null
    >(null),
    [trail, setTrail] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pendingQuestion,setPendingQuestion]=useState<{id:string;text:string}|null>(null);
  const [completedChatTask,setCompletedChatTask]=useState<string|null>(null);
  const [intro, setIntro] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromLanding = params.get("intro") === "1";
    if (fromLanding) window.history.replaceState(null, "", window.location.pathname);
    if (!localStorage.getItem("aro-intro-seen") || fromLanding) {
      const frame = requestAnimationFrame(() => setIntro(true));
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  const finishIntro = () => {
    localStorage.setItem("aro-intro-seen", "1");
    setIntro(false);
  };
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const read = () => {
      setSelected(
        new URLSearchParams(window.location.search).get("task") ?? "",
      );
      setAll(!new URLSearchParams(window.location.search).get("task"));
      setFocus(null);
      setEntry(null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [pathname]);
  const session = useRef<Promise<Response> | null>(null);
  const refreshVersion = useRef(0);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (drillRef.current) return;
      const version = ++refreshVersion.current;
      session.current ??= fetch("/api/operations", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action:"session"}), signal: AbortSignal.timeout(5000),
      });
      try {
        const ready = await session.current;
        if (!ready.ok) throw Error("Could not initialize demo");
      } catch (error) {
        session.current = null;
        throw error;
      }
      const res = await fetch(
        "/api/operations?incident=" + encodeURIComponent(selected),
        { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) },
      );
      if (!res.ok) throw Error("Unable to load the workspace");
      const next: Snapshot = await res.json();
      if (!signal?.aborted && version === refreshVersion.current && !drillRef.current) { setData(next); saveLocal(next); setError(""); }
    },
    [selected, saveLocal, drillRef],
  );
  useEffect(() => {
    if (data || !checkpoint) return;
    const frame = requestAnimationFrame(() => setData(checkpoint.snapshot));
    return () => cancelAnimationFrame(frame);
  }, [data, checkpoint]);
  useEffect(() => {
    if (drill) return;
    const controller = new AbortController();
    const load = () =>
      refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) { unavailable(); setError(""); }
      });
    void load();
    const stream = new EventSource("/api/stream");
    stream.addEventListener("activity", load);
    const poll = setInterval(load, 2500);
    return () => {
      controller.abort();
      stream.close();
      clearInterval(poll);
    };
  }, [refresh, drill, unavailable]);
  async function act(action: string) {
    if (offline || drillRef.current) {
      if (action === "scan") {
        try { await continuity.enqueue(resource); setDialog(null); toast.success("Request saved locally. Reconnect and review it in Blackout kit."); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not save request. Record it on paper."); }
      } else setError("The server is unavailable. Approvals and transfers are not executed or queued offline. Use the emergency kit and signed paper records.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: "Bearer " + key } : {}),
        },
        body: JSON.stringify(
          action === "scan"
            ? { action, resource }
            : action === "reset"
              ? { action }
              : { action, id: data?.current?.id },
        ),
      });
      const out = await res.json();
      if (!res.ok) throw Error(out.error);
      if (action === "reset") {
        await saveLocalAfterReset();
        setDialog(null);
        toast.success("Sandbox reset to the seeded Hollow deployment");
        setSelected("");
        setAll(true);
        setFocus(null);
        setEntry(null);
        await refresh();
        router.push("/canvas");
        return;
      }
      setSelected(out.id);
      setDialog(null);
      setFocus(null);
      setAll(false);
      setEntry(null);
      if (pathname === "/board" || pathname === "/audit")
        router.push("/canvas?task=" + encodeURIComponent(out.id));
      else
        window.history.replaceState(
          null,
          "",
          "/canvas?task=" + encodeURIComponent(out.id),
        );
      setKey("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function saveLocalAfterReset() {
    const response = await fetch("/api/operations", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error("Reset completed but the new checkpoint could not be loaded. Reconnect before continuing.");
    const next: Snapshot = await response.json(); setData(next); saveLocal(next);
  }
  const current = data?.current,
    events = data?.events ?? [],
    frames = resourceFrames(data),
    unit = current?.unit ?? "units";
  const justFinished = useResourceJustFinished(data);
  const waiting = current?.state === "review" || current?.state === "blocked";
  const handoffs: Handoff[] = events
    .filter(
      (e) =>
        e.type === "HANDOFF" &&
        crew.some((a) => a.id === e.actor) &&
        crew.some((a) => a.id === e.result.to),
    )
    .map((e) => ({
      id: e.id,
      workItemId: current!.id,
      from: e.actor as Seat,
      to: e.result.to as Seat,
      kind: "handoff" as const,
      label: tidy(e.title.replace("Assigned ", "")),
      detail: "",
      createdAt: e.time,
    }))
    .reverse();
  const artifact = events.find(
    (e) => e.id === (focus?.kind === "frame" ? Number(focus.id) : entry),
  );
  const agent =
    focus?.kind === "node" ? crew.find((a) => a.id === focus.id) : null;
  const missingOfflineTask = Boolean((offline || drill) && selected && data?.current?.id !== selected);
  const list = all || !current || missingOfflineTask;
  // Replace the entire pane on navigation or completion. This also discards
  // stale DOM from a previous task instead of reconciling it into the overview.
  const sidebarKey = `${data?.epoch ?? 0}:` + (
    agent ? `agent:${agent.id}` : artifact && current ? `artifact:${current.id}:${artifact.id}` :
    list ? "overview" : `task:${current?.id}:${current?.state === "completed" ? "done" : "active"}`
  );
  useStickToBottom(conversationRef,current?.state==="completed" && completedChatTask!==current.id?null:sidebarKey);
  // The completed card must be visible when its one-time burst starts. Following
  // the bottom of a long chat otherwise skips straight past the card's heading.
  useEffect(()=>{
    if(current?.state!=="completed" || completedChatTask===current.id) return;
    const frame=requestAnimationFrame(()=>{
      conversationRef.current?.querySelector('[aria-label="Completed resource operation"]')?.scrollIntoView({block:"start",behavior:"instant"});
    });
    return ()=>cancelAnimationFrame(frame);
  },[current?.state,current?.id,justFinished,sidebarKey,completedChatTask]);
  const setCanvasFocus = (f: Focus) => {
    if ((offline || drillRef.current) && f?.kind === "node") {
      setError("Live agent inspectors require the server. Saved artifacts and Blackout kit remain available.");
      return;
    }
    setFocus(f);
    setEntry(null);
    setAll(false);
  };
  function choose(id: string) {
    if ((offline || drillRef.current) && id !== data?.current?.id) {
      setError("Detailed evidence for this task is not in the saved checkpoint. Reconnect to open it; the cached workspace and inventory remain available.");
      return;
    }
    setPendingQuestion(null);
    setSelected(id);
    setFocus(null);
    setEntry(null);
    setAll(false);
    setTrail(false);
    window.history.pushState(
      null,
      "",
      "/canvas?task=" + encodeURIComponent(id),
    );
  }
  function allTasks() {
    setFocus(null);
    setEntry(null);
    setAll(true);
    window.history.replaceState(null, "", "/canvas");
  }
  function openEvent(id: number) {
    setEntry(id);
    setFocus(
      frames.some((f) => f.id === String(id))
        ? { kind: "frame", id: String(id) }
        : null,
    );
    setAll(false);
  }
  function openDialog(d: typeof dialog) {
    setKey("");
    setError("");
    setDialog(d);
  }
  async function sendQuestion(text: string, eventId?: number) {
    if (offline || drillRef.current) { setError("Live agent explanations are unavailable. Saved evidence and local planning are available in Blackout kit."); return; }
    if (!current || !text.trim() || asking) return;
    setAsking(true);
    if(current.state==="completed") setCompletedChatTask(current.id);
    setPendingQuestion({id:current.id,text});
    setError("");
    try {
      const response = await fetch("/api/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, question: text, event: eventId }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAsking(false);
      setPendingQuestion(null);
    }
  }
  async function confirmChat(confirmation:string,cancel:boolean) {
    if(!current || busy || offline || drillRef.current) return;
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/operations",{method:"POST",headers:{"Content-Type":"application/json",...(key?{Authorization:"Bearer "+key}:{})},body:JSON.stringify({action:cancel?"cancel_chat":"confirm_chat",id:current.id,confirmation})});
      if(!response.ok) throw Error((await response.json()).error);
      await refresh();
    } catch(e) {setError(e instanceof Error?e.message:"Could not confirm");}
    finally {setBusy(false);}
  }
  const compare = data?.comparison;
  return (
    <div className="resource-workspace flex h-dvh flex-col overflow-hidden">
      <WorkspaceHeader active={view} logo={<AroLogo />} offline={offline || drill}>
        <ModelSettings data={data} offline={offline||drill} onChanged={async()=>{await refresh();}}/>
        <BlackoutKit continuity={continuity} reconnect={async () => { try { await refresh(); } catch (error) { unavailable(); throw error; } }} onRequest={choose} />
        <div className="flex items-center gap-1.5">
        <button
          className="help"
          title="How ARO works"
          aria-label="How ARO works"
          onClick={() => setIntro(true)}
        >
          <CircleHelp size={16} />
        </button>
        <Button variant="ghost" size="sm" onClick={() => openDialog("reset")}>
          <RotateCcw /> Reset demo
        </Button>
        <Button size="sm" onClick={() => openDialog("simulate")}>
          <Plus /> Simulate resource event
        </Button>
        </div>
      </WorkspaceHeader>
      {(offline || drill) && <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        <b>{drill ? "Outage drill (simulated)" : "Server unreachable"}</b> · {checkpoint ? `Using records saved ${new Date(checkpoint.savedAt).toLocaleString()}.` : "No saved checkpoint on this device."} Provisional local planning only; no approvals or transfers can execute. Open Blackout kit for queued requests and paper procedures.
      </div>}
      {missingOfflineTask && <p role="status" className="failure">The requested task’s evidence is not cached. Showing the saved workspace overview; reconnect for that task’s full record.</p>}
      {error && !dialog && (
        <p role="alert" className="failure">
          {error}
        </p>
      )}
      {view === "canvas" ? (
        <main className="floor-layout">
          <div className="bg-canvas relative min-w-0 flex-1">
            <Orbit
              key={`${data?.continuity?.workspaceId ?? "loading"}:${data?.epoch ?? 0}:${offline || drill ? "cached" : "live"}`}
              resource={{ data, handoffs, paused: offline || drill }}
              frames={frames}
              focus={focus}
              setFocus={setCanvasFocus}
              task={
                !list && current
                  ? { id: current.id, label: scenarios[current.resource] }
                  : null
              }
              onClearTask={allTasks}
              onYou={() => {
                setCanvasFocus(null);
                setAll(false);
                if (current?.state !== "review") openDialog("decision");
              }}
            />
            <ResourceCompletionBurst data={data} justFinished={justFinished} paused={offline||drill}/>
          </div>
          <aside key={sidebarKey} className="case-rail">
            {agent ? (
              <AgentPanel
                key={agent.id}
                actorId={"aro." + agent.id}
                currentItemId={current?.id}
                onClose={() => setCanvasFocus(null)}
                onOpenTask={choose}
                openOutput={(id, incident) => {
                  if (incident && incident !== current?.id) choose(incident);
                  setEntry(id);
                  setFocus({ kind: "frame", id: String(id) });
                  setAll(false);
                  return true;
                }}
              />
            ) : artifact && current ? (
              <FrameChat
                key={current.id + ":" + artifact.id}
                f={{
                  key: current.id + ":" + artifact.id,
                  taskId: current.id,
                  frameId: String(artifact.id),
                  actorId: "aro." + (crew.some(a => a.id === artifact.actor) ? artifact.actor : artifact.actor === "operator" ? "operator" : "director"),
                  agentName: names[artifact.actor] ?? "Operations Director",
                  job: crew.find(a => a.id === artifact.actor)?.remit ?? "Coordinates resource operations",
                  label: frames.find(f => f.id === String(artifact.id))?.label ?? artifact.title,
                  title: headline(artifact, unit),
                  tone: frames.find(f => f.id === String(artifact.id))?.tone ?? "ok",
                }}
                messages={(data?.messages ?? []).filter(m => m.evidence === artifact.id).flatMap(m => [
                  { role: "user" as const, content: m.question },
                  { role: "assistant" as const, content: m.answer },
                ])}
                pending={asking}
                onAsk={text => void sendQuestion(text, artifact.id)}
                onClose={() => setCanvasFocus(null)}
                onTask={choose}
              />
            ) : (
              <>
                {!list && <div className="railhead">
                  <button
                    onClick={
                      artifact || agent ? () => setCanvasFocus(null) : allTasks
                    }
                  >
                    <ArrowLeft size={14} />
                    {artifact || agent ? "Back to task" : "All tasks"}
                  </button>
                  <small>{current?.id ?? "Hollow network"}</small>
                </div>}
                <div ref={conversationRef} className={list ? "railbody !p-0" : "railbody"}>
                  {list ? (
                    <ResourceHome data={data} onOpen={choose} offline={offline || drill} />
                  ) : (
                    current && (
                      <>
                        <small>
                          {current.id} · {labels[current.state]}
                        </small>
                        <h2>{scenarios[current.resource]}</h2>
                        {compare && current.state !== "completed" && (
                          <div className="measures">
                            {(["directorate", "aro"] as const).map((k) => (
                              <div key={k}>
                                <span>
                                  {k === "aro" ? "ARO" : "Directorate"}
                                </span>
                                <i>
                                  <b
                                    style={{
                                      width: compare[k].metrics.coverage + "%",
                                    }}
                                  />
                                </i>
                                <span>{compare[k].metrics.coverage}%</span>
                              </div>
                            ))}
                            <small>Essential demand covered</small>
                          </div>
                        )}
                        {current.state === "review" && data ? (
                          <ResourceTransferDecision
                            key={`decision:${current.id}`}
                            data={data}
                            busy={busy}
                            operatorKey={key}
                            onKeyChange={setKey}
                            onDecide={act}
                          />
                        ) : current.state!=="completed" ? (
                          <>
                        <div className="employee">
                          <AroAvatar
                            actorId={
                              waiting && current.state === "review"
                                ? "finance"
                                : "director"
                            }
                            size={19}
                          />
                          {waiting && current.state === "review"
                            ? "Resource Allocator"
                            : "Operations Director"}
                        </div>
                        <p>
                          {current.state === "blocked"
                            ? "The investigation needs your attention. Review the failed task and reopen it when ready."
                            : data?.lines.length
                              ? data.lines
                                  .map(
                                    (l) =>
                                      l.units +
                                      " " +
                                      unit +
                                      " to " +
                                      (data.facilities[l.facility] ??
                                        l.facility),
                                  )
                                  .join(" · ")
                              : events[0]?.title}
                        </p>
                          </>
                        ) : null}
                        {current.state === "blocked" && (
                          <button
                            className="task-row"
                            onClick={() => openDialog("decision")}
                          >
                            Review incident
                            <ArrowRight size={14} />
                          </button>
                        )}
                        {data?.order && current.state !== "review" && current.state!=="completed" && (
                          <button
                            className="task-row"
                            onClick={() => openDialog("decision")}
                          >
                            Replenishment · {data.order.units} {unit}
                            <small>{data.order.status}</small>
                          </button>
                        )}
                        <div className="record-nav">
                          {current.state==="completed" ? <span>How we got here</span> : <button onClick={() => setTrail(!trail)}>
                            <ChevronDown size={13} />
                            How we got here
                          </button>}
                          <Link
                            href={"/investigations/" + current.id + "/record"}
                            onClick={event => {
                              if (offline || drillRef.current) {
                                event.preventDefault();
                                setError("The full server record requires reconnection. Saved evidence and emergency exports remain available here.");
                              }
                            }}
                          >
                            Full record ↗
                          </Link>
                        </div>
                        {data && <ResourceTaskTimeline data={data} showHistory={trail} justFinished={justFinished} paused={offline||drill} onEvidence={openEvent}
                          conversation={<ResourceConversation data={data} pending={pendingQuestion?.id===current.id?pendingQuestion.text:null} onEvidence={openEvent} onAction={(id,cancel)=>void confirmChat(id,cancel)} busy={busy} offline={offline||drill}/>}/>}
                        {current.state==="completed" && <>
                          <button className="task-row" onClick={()=>{const report=events.find(e=>e.title==="publish report");if(report) openEvent(report.id);}}>Open operational report <ArrowRight size={14}/></button>
                          {data?.order && <button className="task-row" onClick={()=>openDialog("decision")}>Optional replenishment · {data.order.units} {unit}<small>{data.order.status}</small></button>}
                        </>}
                      </>
                    )
                  )}
                </div>
                {!list && current && (
                  <>
                    <div className="shrink-0 px-3 pt-2 pb-3">
                      <Composer placeholder="Ask Resource Allocator, or tell them what to do" onSend={text=>void sendQuestion(text)} disabled={asking||busy||offline||drill}/>
                    </div>
                  </>
                )}
              </>
            )}
          </aside>
        </main>
      ) : view === "board" ? (
        <ResourceBoard data={data} offline={offline || drill} />
      ) : (
        <ResourceAudit incident={selected} offline={offline || drill} snapshot={data} />
      )}
      <Onboarding
        resource
        open={intro}
        publicDemo={!!data?.demo}
        onClose={finishIntro}
        onStart={async () => {
          finishIntro();
          if (data?.demo) {
            openDialog("simulate");
            return;
          }
          const r = await fetch("/api/operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reset" }),
          });
          if (r.ok) {
            router.push("/canvas");
            setAll(true);
            setSelected("");
            await refresh();
            openDialog("simulate");
          }
          else setError("Could not start a demo workspace");
        }}
      />
      <ResourceEventPicker
        open={dialog === "simulate"}
        resource={resource}
        busy={busy}
        error={error}
        onPick={setResource}
        onClose={() => openDialog(null)}
        onStart={() => void act("scan")}
      />
      <Dialog
        open={dialog !== null && dialog !== "simulate"}
        onOpenChange={(open) => {
          if (!open && !busy) openDialog(null);
        }}
      >
        <DialogContent className={dialog === "reset" ? "sm:max-w-[440px]" : "resource-dialog"}>
          <DialogHeader>
          <DialogTitle>
            {dialog === "reset"
              ? "Reset the sandbox?"
              : dialog === "help"
                ? "How ARO works"
                : waiting
                    ? "Review " +
                      (current?.state === "review" ? "transfer" : "incident")
                    : "Operator desk"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "reset"
              ? "Deletes all incidents, transfers, audit events, approvals, and agent guidance, then reloads the seeded Hollow deployment. Use this to repeat the demo."
              : dialog === "help"
                ? "Select an employee to zoom in on their work. Open a frame to inspect the evidence, or select You to review a transfer."
                : current
                    ? scenarios[current.resource] +
                      " · " +
                      labels[current.state]
                    : "No task selected"}
          </DialogDescription>
          </DialogHeader>
          {dialog === "reset" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => openDialog(null)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={() => act("reset")} disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" />}
                Reset sandbox
              </Button>
            </DialogFooter>
          )}
          {dialog === "decision" && (
            <>
              {data?.lines.map((l) => (
                <p key={l.route}>
                  {data.facilities[l.source ?? ""] ?? data.origin} →{" "}
                  {data.facilities[l.facility]} · {l.units} {unit}
                </p>
              ))}
              {current?.state === "blocked" && (
                <p>{data?.jobs.find((j) => j.status === "failed")?.error}</p>
              )}
              {data?.order && (
                <p>
                  Replenishment · {data.order.units} {unit} ·{" "}
                  {data.order.status}
                </p>
              )}
              {!data?.demo && (waiting || data?.order?.status === "draft") && (
                <label>
                  Operator key
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
              )}
              {current?.state === "review" ? (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    className="action"
                    onClick={() => act("approve")}
                  >
                    Approve transfer
                  </button>
                  <button disabled={busy} onClick={() => act("reject")}>
                    Decline
                  </button>
                </div>
              ) : current?.state === "blocked" ? (
                <button
                  disabled={busy}
                  className="action"
                  onClick={() => act("replan")}
                >
                  Replan incident
                </button>
              ) : (
                data?.order?.status === "draft" && (
                  <button
                    disabled={busy}
                    className="action"
                    onClick={() => act("order")}
                  >
                    Authorize replenishment
                  </button>
                )
              )}
            </>
          )}
          {dialog === "decision" &&
            data?.demo &&
            data.order?.status === "authorized" && (
              <button
                className="action"
                disabled={busy}
                onClick={() => act("supplier_receipt")}
              >
                Simulate supplier delivery
              </button>
            )}
          {error && (
            <p role="alert" className="failure">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
