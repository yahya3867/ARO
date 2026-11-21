import { sleep } from "workflow";
import { claimNextJob, type JobRow } from "../workflow/jobs";
import { cloudStore } from "./cloud-store";

async function claim(id: string, generation: string, wake: string) {
  "use step";
  console.log("ARO: claim next resource task", id);
  return cloudStore().change(id, ({ ctx }, state) => {
    if (state.generation !== generation || state.wake !== wake) return null;
    const job = claimNextJob(ctx);
    if (!job) { state.wake = null; state.run = null; }
    return job?.id ?? null;
  });
}
async function execute(id: string, generation: string, wake: string, jobId: number) {
  "use step";
  console.log("ARO: execute resource task", id, jobId);
  await cloudStore().change(id, async ({ ctx, worker }, state) => {
    if (state.generation !== generation || state.wake !== wake) return;
    const raw = ctx.sqlite.prepare("SELECT * FROM jobs WHERE id=? AND status='running'").get(jobId) as Record<string, unknown> | undefined;
    if (!raw) return; // A retried step must not repeat a committed transfer.
    const job: JobRow = { id: jobId, workItemId: String(raw.work_item_id), kind: String(raw.kind),
      agentId: raw.agent_id === null ? null : String(raw.agent_id), payload: JSON.parse(String(raw.payload)),
      status: "running", attempts: Number(raw.attempts), createdAt: String(raw.created_at),
      startedAt: raw.started_at === null ? null : String(raw.started_at), finishedAt: null, error: null };
    await worker.process(job);
  });
}
export async function resourceWorkflow(id: string, generation: string, wake: string) {
  "use workflow";
  console.log("ARO: resource workflow started", id);
  // Approval is a persisted pause: no running Function waits for the operator.
  for (let stage = 0; stage < 64; stage++) {
    const job = await claim(id, generation, wake);
    if (job === null) return;
    await sleep("1200ms");
    await execute(id, generation, wake, job);
  }
  throw Error("Resource workflow exceeded its bounded task limit");
}
