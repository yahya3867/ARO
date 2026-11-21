# ARO blackout continuity

Implemented and verified November 19, 2026. The workforce canvas, controlled operational tools, SQLite persistence, approvals and animation architecture remain in place.

## Failure modes

| Condition | What continues | What does not |
| --- | --- | --- |
| Internet/cloud model unavailable; powered local server reachable | SQLite inventory, durable jobs, deterministic forecasting/allocation, authorized transfers and audit records | Model-generated investigation rationale until model access is restored |
| Browser cannot reach the server; device still powered and previously prepared | Cached application shell and latest checkpoint, provisional local allocation, queued investigation intent, kit/CSV exports | Authoritative inventory writes, transfer approvals, live model calls, current audit-chain verification or uncached task evidence |
| Electricity unavailable everywhere | Printed records, physical counts, signed paper ledgers, local coordinators and manual transport arrangements | The application, browser, server or AI running without power |

## Actual browser offline operation

`public/aro-sw.js` caches the three workspace page shells, the landing page (so the ARO logo still has a cached destination), and their same-origin static scripts, CSS and fonts. It does not cache the demo video, operational API responses or POST requests. IndexedDB stores the latest successful workspace snapshot and pending investigation requests. Application startup restores that checkpoint if the server is unreachable. Use HTTPS or localhost; an insecure LAN origin cannot install a service worker. A first-ever visit without a connection cannot prepare the cache. Browser storage is per origin: each device must visit `https://tryaro.app/canvas` online and prepare its own cache and checkpoint; localhost records do not automatically move to the public domain.

The offline optimizer is the same pure allocation function used by the server. Cached expiry, availability, reserve and route limits are retained. Expiry is checked against the operational planning day plus elapsed checkpoint days. The Hollow demo's base planning day remains March 8, 2087. A checkpoint older than 24 hours, with an invalid timestamp, or apparently from the future produces no transfer proposals. This cut-off is a conservative demonstration policy, not a guarantee of freshness: even a recent count can already be wrong. Unrecorded consumption is not silently subtracted or treated as a known balance.

Agents and handoffs are marked as cached instead of continuing to perform imaginary work. Saved execution events can be inspected, but live audit-chain verification is not claimed offline. The latest task's evidence is cached; requesting other, uncached task evidence displays an explanation rather than substituting another case's evidence.

## Queues and authorization

The queue contains investigation intent only: a UUID, workspace identity, resource and creation time. It contains no operator keys or API credentials. Atomic IndexedDB transactions avoid overwriting requests from another tab. Requests are not automatically sent on reconnection. The operator explicitly chooses **Review & send investigation**, after seeing the current connection and checkpoint.

The server persists accepted request IDs transactionally with the resulting incident. A retry after a lost response returns the same incident. Reusing an ID with different content is rejected. Reset creates a new workspace identity, so pre-reset requests cannot be applied to a reseeded environment. Starting an investigation does not authorize a transfer. Reconnection always uses fresh server stock, and the existing execution gateway rechecks stock, reserves, expiry, route capacity and authorization.

Browser records are not the authoritative inventory. There is no multi-master merge, peer-to-peer transport, automatic reconciliation of paper movements, or automatic replay of approvals. After manual operation, the responsible operator must reconcile signed source/receiver records and physical counts before entering controlled observations. Use numbered paper records to avoid duplicate distribution during a network partition.

## Server continuity

SQLite uses WAL and explicit `synchronous=FULL`; jobs and audit records remain persistent. This improves acknowledged-write durability when the operating system and storage honor flushes. It does not promise survival of disk destruction, filesystem corruption or all hardware power failures. Keep device power protection and backups. Use one process per database and preserve the SQLite volume.

Recognized provider connection, timeout, authentication, credit and service failures generate an audited switch to deterministic tools. Programming errors remain errors. OpenRouter key verification has a 5-second deadline and the model client a 15-second deadline, with SDK network retries disabled. Subsequent stages in that runtime use deterministic tools. A process restart can attempt the configured model again. Reset epochs are rechecked after asynchronous model access so an old response cannot operate on a reseeded workspace.

## Manual kit

**Download printable kit** produces a self-contained HTML document with no external scripts, stylesheets or images. It opens without ARO or internet on a powered device and can be printed with the browser's normal print command. It includes all resource lots (including unavailable/expired lots, labelled for exclusion), protected reserves, essential thresholds, provisional allocations, coordinator/witness/receiver sign-offs and a blank movement ledger. **Export inventory CSV** preserves checkpoint time, lot and facility identity, reserve, availability and expiry. CSV cells are protected against formula injection and HTML content is escaped.

Print and distribute copies before power fails. Check stock and expiry physically, protect donor needs, check transport, obtain local authorization and record signed dispatch/receipt copies. The application cannot produce food, provide treatment, restore electricity or guarantee transport safety.

## Verification evidence

- Full automated suite after the continuity implementation: **86 tests passed** across 21 files. Tests cover serialized local allocation versus the server result, stale/expired supply handling, safe exports, request replay after database restart, idempotency, workspace reset rejection, cloud-failure fallback and approval checkpoints.
- Actual local server stopped, with port 3000 confirmed to have no listener. The browser reloaded Canvas from its installed service worker and restored its IndexedDB checkpoint. It calculated the medicine plan locally: 38 kits to the clinic and 12 to North Commons, without mutating application inventory.
- Printable HTML and CSV were downloaded with the server stopped. An investigation was queued offline and survived cached navigation/reload through Board and Audit trail. Audit was explicitly labelled as cached and not currently verifiable.
- On restart, requests remained queued. One was explicitly reviewed and sent, starting an investigation that paused at approval. A second actual server stop retained the pending case; clicking approval while offline was blocked. After server restoration and fresh approval, the case completed, with exactly two ledger entries totalling 50 kits and a verified 23-record audit chain.
- The in-app drill was separately checked, including navigation persistence. It is a simulation of server request suspension, not an actual network shutdown.
- No system-wide internet disconnection or physical electricity cut was performed. Cloud outage paths were tested using injected connection, timeout and HTTP 503 failures against real SQLite workflows. Total-power-loss continuity is a paper operating procedure.

## Live OpenRouter test

An isolated persistent database used the real configured model **openai/gpt-5.6-luna**, not the public demo or a scripted model. The provider key had a non-renewing $5 limit. The first run completed in 25 seconds. Eight stages recorded real model rationale; inventory execution remained deterministic. There were zero transfer records before human approval. After test approval, 38 kits and 12 kits were recorded on the two dispatch routes.

The final code was also tested in a second real model run, completing in 24 seconds with all eight model-assisted stages, zero transfers before test approval, and the same 38/12-kit execution. Both runs stayed in `llm` mode; neither success was a hidden deterministic fallback.

Billing settles asynchronously: the first run's immediate reported delta was $0.00123840 and the second run's immediate delta was zero, so neither immediate value is a reliable settled charge. A later read reported **$0.01092574 total key usage**, versus **$0.00410899** before verification: a reported increase of **$0.00681675 across the verification window**, with **$4.98907426** remaining under the $5 cap. Do not interpret a zero immediate delta as a free request. No credential is stored in this document, browser cache or exported kit. `scripts/aro-live-check.ts` reproduces the bounded isolated test and reports its actual mode, artifacts, transfers and key usage. The [OpenRouter limits documentation](https://openrouter.ai/docs/api_reference/limits) describes the provider-side key cap and usage endpoint.
