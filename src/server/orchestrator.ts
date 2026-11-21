import { recordActivity } from "./activity";
import type { AppContext } from "./context";
import { RunAbortedError } from "./workflow/errors";
import { claimNextJob, finishJob, recoverInterruptedJobs, type JobRow } from "./workflow/jobs";

const MAX_ATTEMPTS = 2;

/**
 * Durable worker. Jobs live in SQLite, so queued and interrupted work resumes
 * after a restart. Different work items run concurrently; each work item runs
 * one job at a time.
 */
export class Orchestrator {
  private timer: NodeJS.Timeout | null = null;
  private active = new Set<Promise<void>>();
  private paused = false;
  private readonly onChange = (topic: string) => {
    if (topic === "jobs") this.tick();
  };

  constructor(private ctx: AppContext, private concurrency = 3, private dispatch: (ctx: AppContext, job: JobRow) => Promise<unknown>, private onFailure: (ctx: AppContext, job: JobRow, message: string) => void, private manual = false) {}

  start() {
    if (this.timer) return;
    this.paused = false;
    const recovered = recoverInterruptedJobs(this.ctx);
    if (recovered > 0) {
      recordActivity(this.ctx, {
        actorId: "system.orchestrator",
        type: "SYSTEM",
        status: "info",
        title: "Recovered " + recovered + " interrupted job(s) after restart",
      });
    }
    this.timer = setInterval(() => this.tick(), 400);
    this.ctx.bus.on("change", this.onChange);
    this.tick();
  }

  stop() {
    this.paused = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx.bus.off("change", this.onChange);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    if (!this.manual) this.tick();
  }

  get activeCount() {
    return this.active.size;
  }

  async waitForIdle(timeoutMs = 15_000) {
    const until = Date.now() + timeoutMs;
    while (this.active.size > 0 && Date.now() < until) await Promise.race([...this.active]);
  }

  private tick() {
    if (this.paused) return;
    while (this.active.size < this.concurrency) {
      const job = claimNextJob(this.ctx);
      if (!job) break;
      const promise: Promise<void> = this.process(job).finally(() => {
        this.active.delete(promise);
        setImmediate(() => this.tick());
      });
      this.active.add(promise);
    }
  }

  async process(job: JobRow) {
    const epoch = this.ctx.epoch;
    try {
      await this.dispatch(this.ctx, job);
      if (epoch === this.ctx.epoch) finishJob(this.ctx, job.id, "done");
    } catch (error) {
      if (error instanceof RunAbortedError || epoch !== this.ctx.epoch) return;
      const message = error instanceof Error ? error.message : String(error);
      if (job.attempts < MAX_ATTEMPTS && job.kind === "AGENT_RUN") {
        finishJob(this.ctx, job.id, "queued", message);
      } else {
        finishJob(this.ctx, job.id, "failed", message);
        this.onFailure(this.ctx, job, message);
      }
    }
  }

  /** Process queued jobs sequentially until none remain (tests, seeding). */
  async drain(limit = 500) {
    for (let i = 0; i < limit; i += 1) {
      const job = claimNextJob(this.ctx);
      if (!job) return;
      await this.process(job);
    }
    throw new Error("drain limit reached");
  }
}
