# ARO architecture

ARO uses Next.js, React, TypeScript, Geist, SVG artifacts, SQLite and Drizzle. The workforce canvas remains the primary operating surface.

## Resource services

`src/server/aro/` owns resource intake, seven-day weighted forecasting, constrained allocation, route validation, fairness comparisons, transfer approvals, execution, replenishment, chat confirmations, visitor model access and continuity exports. Structured model output cannot write inventory directly. Controlled tools recheck reserves, expiry, availability, demand and route capacity before an authorized atomic transfer.

## Shared infrastructure

`src/server/context.ts`, `db/`, `workflow/jobs.ts`, `orchestrator.ts`, `activity.ts`, `audit.ts` and `settings.ts` provide database access, durable job claims, bounded retries, interrupted-job recovery, agent guidance, observable events and a hash-chained audit. The worker requires an explicit resource dispatcher and failure handler. There is no alternate business-domain dispatcher.

Fresh databases create only shared operational tables and resource-domain tables. Existing resource workspace images are upgraded without modifying inventory, approvals, execution events or audit hashes. Obsolete empty tables are removed. Unexpected populated tables stop the upgrade with an export/reconciliation instruction instead of being silently deleted.

## Hosting and continuity

A local deployment uses a persistent SQLite file. The public Vercel deployment hydrates a visitor-specific SQLite image from Turso and commits changes with revision checks. Durable workflow invocations resume pending resource jobs. Optional visitor OpenRouter credentials are encrypted separately, scoped to the workspace and expire after one hour.

The service worker and IndexedDB retain prepared page shells, checkpoints and queued investigation intent. Cached allocation is provisional, approvals require a reachable authoritative server, and recovery never automatically replays approvals. A simulated outage drill is labelled separately from actual loss of connectivity. During total power loss, communities use previously printed records and manual procedures.

## Interface and limits

The canvas preserves agent seats, animated handoffs, reactions, progressively rendered evidence, approval checkpoints and completion celebrations. Artifact figures render recorded tool results using React and SVG. Board, audit, transfer ledger and operational records show the same persisted work.

The Hollow fixture uses a fixed planning day, integral resource units and direct routes. Delivery confirmation is simulated in the public demo. Physical transportation, food production, clinical treatment and power restoration remain human and organizational responsibilities.
