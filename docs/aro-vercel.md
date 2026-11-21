# ARO on Vercel

The Next.js app serves the website at `/` (`PUBLIC_DEMO=1`) and the application
at `/canvas`, `/board`, and `/audit`. The landing page's third button opens
`/canvas`. The standalone `site/` export is not the full app deployment.

## Storage and execution

The public deployment uses the Turso Cloud Starter integration provisioned in
the ARO Vercel project, with server-only `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN`. It does not use `/tmp` as durable storage or copy the
operator's local inventory to the public site. No model key is needed for the
public demo: it uses the existing deterministic tools.

To preserve the working synchronous SQLite engine, the adapter commits a
compressed SQLite image for each visitor to an `aro_workspaces` row in hosted
Turso. Each image retains all operational tables, database constraints,
immutable-record triggers, jobs, settings, and the chained audit ledger. It is
rehydrated into memory for an invocation and discarded afterward. A conditional
revision update atomically commits the whole workspace; a conflicting writer
must discard its image and rerun against the newer state. Approval, stock,
transfer ledger, and audit changes therefore commit together.

This is a bounded hackathon demo storage adapter, not a database architecture
for a large operational deployment: workspace images are rewritten on mutations,
individual records cannot be queried across visitors in Turso, compressed images
are capped at 1 MiB, and public demos retain their data until explicitly reset.
For organizational use, retain the volume-backed single-process deployment or
migrate the models to directly queryable hosted tables.

Vercel Workflow runs persisted job claims and execution as separate retryable
steps, retaining the original deterministic tool validation, delegation and
Orchestrator error handling. A durable sleep makes running agents visible.
The flow ends at an approval checkpoint. Approving starts a new bounded run;
no Function stays alive waiting for human input. Each committed workflow step
survives an instance restart. The checkpoint's wake token is a durable outbox;
platform start-hook deduplication makes an uncertain enqueue safe to retry.
Reset rotates the generation so old workflow invocations cannot affect a fresh
demo. Finalized jobs and tool step numbers prevent duplicate execution.

The hosted SSE endpoint returns finite batches from persisted activity rows;
EventSource reconnects and replays by Last-Event-ID. The UI's existing polling
also refreshes current records. No in-process event bus is used across Functions.

## Offline boundaries

The existing service worker, IndexedDB checkpoint, provisional allocation,
queued investigation requests and printable emergency kit remain in place.
Offline approvals and transfers remain prohibited. Cloud workspace persistence
is not a claim that Vercel or an unpowered device works offline.

## Deployment

Use Node 22, the Next.js framework, the project root and `npm run build`.
`next.config.ts` wraps the app with `withWorkflow`. Shared operational tables are initialized by the resource database client
in the Function bundle. `.vercelignore` excludes local environment files and
SQLite databases. Configure `PUBLIC_DEMO=1` and the Turso integration before
deployment. Do not upload `.env.local` or set the public demo's OpenRouter key.

Stage a production deployment with `--prod --skip-domain`, test the actual
hosted approval workflow and audit chain, then promote and attach `tryaro.app`.
The GitHub repository can remain empty; CLI deployments do not require a push.
