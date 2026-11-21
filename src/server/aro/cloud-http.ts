import { start } from "workflow/api";
import { cloudEnabled } from "./cloud-scope";
import { cloudStore } from "./cloud-store";
import { resourceWorkflow } from "./cloud-workflow";

const cookieId = (request: Request) => request.headers.get("cookie")?.match(/(?:^|; )aro_demo=([a-f0-9-]{36})(?:;|$)/)?.[1];
async function wakeWorkspace(id: string) {
  const store = cloudStore(), state = await store.load(id);
  if (!state?.wake || state.run) return;
  let runId: string;
  try {
    const run = await start(resourceWorkflow, [id, state.generation, state.wake], {
      experimental_hook: { token: "aro:" + id + ":" + state.wake, experimental_minRetention: "1d" },
    });
    runId = run.runId;
  } catch (error) {
    // An ambiguous response can be retried safely: the platform admits only one owner.
    if (error && typeof error === "object" && "conflictingRunId" in error && typeof error.conflictingRunId === "string")
      runId = error.conflictingRunId;
    else throw error;
  }
  await store.markStarted(id, state.wake, runId);
}
export async function resourceHttp(request: Request, handler: (request: Request) => Response | Promise<Response>) {
  if (!cloudEnabled()) return handler(request);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && origin !== process.env.ARO_PUBLIC_ORIGIN)
      return Response.json({ error: "Cross-origin action denied" }, { status: 403 });
  }
  const store = cloudStore();
  const existing = cookieId(request);
  try {
    let id = existing;
    if (!id || !await store.load(id)) {
      const input = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
      if (input?.action !== "session") return Response.json({ error: "Open the demo canvas first." }, { status: 401 });
      id = await store.create();
    }
    const response = request.method === "GET"
      ? await store.read(id, () => handler(request))
      : await store.change(id, () => handler(request.clone()));
    // The durable outbox is committed before enqueue. A subsequent request retries
    // uncertain enqueue attempts without repeating the requested operation.
    await wakeWorkspace(id);
    if (id !== existing) response.headers.set("Set-Cookie", `aro_demo=${id}; HttpOnly; SameSite=Strict; Path=/` + (new URL(request.url).protocol === "https:" ? "; Secure" : ""));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("ARO hosted operation failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "The hosted workspace is temporarily unavailable. Your saved records are retained. Please retry." }, { status: 503 });
  }
}
export async function resourceRead<T>(request: Request, fn: () => T | Promise<T>) {
  if (!cloudEnabled()) return fn();
  const id = cookieId(request);
  if (!id) throw Error("Open the demo canvas first.");
  return cloudStore().read(id, fn);
}
