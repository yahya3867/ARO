"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/server/aro/runtime";
import type { Resource } from "@/server/aro/catalog";
import type { Checkpoint, QueuedRequest } from "@/lib/continuity";
import { loadCheckpoint, saveCheckpoint, loadQueue, addStoredRequest, removeStoredRequest } from "@/lib/continuity-storage";

export function useContinuity() {
  const [checkpoint, setCheckpoint] = useState<Checkpoint>();
  const [queue, setQueue] = useState<QueuedRequest[]>([]);
  const [offline, setOffline] = useState(false);
  const [drill, setDrill] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [shellReady, setShellReady] = useState(false);
  const drillRef = useRef(false);
  const onlineSeen = useRef(false);
  const queueRef = useRef<QueuedRequest[]>([]);
  useEffect(() => {
    let alive = true;
    let restoringDrill = false;
    try { restoringDrill = sessionStorage.getItem("aro:outage-drill") === "1"; } catch { /* The drill can still run in memory. */ }
    if (restoringDrill) drillRef.current = true;
    const frame = requestAnimationFrame(() => { if (restoringDrill && alive) setDrill(true); });
    void Promise.all([loadCheckpoint(), loadQueue()]).then(([saved, requests]) => {
      if (!alive) return;
      if (!onlineSeen.current) setCheckpoint(saved);
      queueRef.current = requests;
      setQueue(requests);
    }).catch(() => { if (alive) setStorageError("Browser storage is unavailable. Download or print an emergency kit while connected."); });
    const disconnected = () => setOffline(true);
    window.addEventListener("offline", disconnected);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/aro-sw.js").then(async registration => {
        await navigator.serviceWorker.ready;
        const active = registration.active;
        const channel = new MessageChannel();
        channel.port1.onmessage = event => { if (alive && event.data === "ARO_SHELL_READY") setShellReady(true); };
        active?.postMessage("ARO_SHELL_STATUS", [channel.port2]);
      }).catch(() => { if (alive && !navigator.serviceWorker.controller) setStorageError("Offline page installation failed. Keep this tab open and export the emergency kit."); });
    }
    return () => { alive = false; cancelAnimationFrame(frame); window.removeEventListener("offline", disconnected); };
  }, []);
  const accept = useCallback((snapshot: Snapshot) => {
    onlineSeen.current = true;
    const next = { savedAt: new Date().toISOString(), snapshot };
    setCheckpoint(next);
    setOffline(false);
    void saveCheckpoint(next).catch(() => setStorageError("Could not save the checkpoint on this device. Export the emergency kit."));
  }, []);
  const unavailable = useCallback(() => setOffline(true), []);
  const beginDrill = () => { try { sessionStorage.setItem("aro:outage-drill", "1"); } catch { /* In-memory drill remains available. */ } drillRef.current = true; setDrill(true); };
  const endDrill = () => { try { sessionStorage.removeItem("aro:outage-drill"); } catch { /* Reconnection is still explicit. */ } drillRef.current = false; setDrill(false); };
  function updateQueue(next: QueuedRequest[]) {
    queueRef.current = next;
    setQueue(next);
  }
  async function enqueue(resource: Resource) {
    if (!checkpoint) throw Error("No saved workspace is available. Record this request on paper.");
    const workspaceId = checkpoint.snapshot.continuity.workspaceId;
    const existing = queueRef.current.find(q => q.workspaceId === workspaceId && q.resource === resource);
    if (existing) return existing;
    const request = { requestId: crypto.randomUUID(), workspaceId, resource, createdAt: new Date().toISOString() };
    updateQueue(await addStoredRequest(request));
    return request;
  }
  const remove = async (id: string) => updateQueue(await removeStoredRequest(id));
  return { checkpoint, queue, offline, drill, drillRef, storageError, shellReady, accept, unavailable, beginDrill, endDrill, enqueue, remove };
}
