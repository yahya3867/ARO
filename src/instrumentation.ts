export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Hosted Functions hydrate a workspace per invocation. They must never open
  // the local SQLite file or start an unbounded process-local worker.
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) return;
  const { resourceRuntime } = await import("./server/aro/runtime");
  resourceRuntime();
}
