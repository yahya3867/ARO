import type { Checkpoint, QueuedRequest } from "./continuity";

const DB_NAME = "aro-continuity-v1";
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(key: string): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction("records").objectStore("records").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function writeCheckpoint(value: Checkpoint) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const current = store.get("checkpoint");
      current.onsuccess = () => {
        const saved = current.result as Checkpoint | undefined;
        if (!saved || Date.parse(saved.snapshot?.continuity?.capturedAt) <= Date.parse(value.snapshot.continuity.capturedAt) || !Number.isFinite(Date.parse(saved.snapshot?.continuity?.capturedAt)))
          store.put(value, "checkpoint");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const loadCheckpoint = async () => {
  const saved = await read<Checkpoint>("checkpoint");
  if (saved && (!saved.snapshot?.continuity?.workspaceId || !saved.snapshot?.continuity?.resources || !saved.savedAt))
    throw Error("The local checkpoint is incomplete. Reconnect to save a new copy.");
  return saved;
};
export const saveCheckpoint = (value: Checkpoint) => writeCheckpoint(value);
export const loadQueue = async () => (await read<QueuedRequest[]>("queue")) ?? [];

async function mutateQueue(change: (queue: QueuedRequest[]) => QueuedRequest[]) {
  const db = await open();
  try {
    return await new Promise<QueuedRequest[]>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const request = store.get("queue");
      let next: QueuedRequest[] = [];
      request.onsuccess = () => { next = change(request.result ?? []); store.put(next, "queue"); };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const addStoredRequest = (request: QueuedRequest) => mutateQueue(queue => queue.some(q => q.workspaceId === request.workspaceId && q.resource === request.resource) ? queue : [...queue, request]);
export const removeStoredRequest = (id: string) => mutateQueue(queue => queue.filter(q => q.requestId !== id));
