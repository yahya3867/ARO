# ARO — Autonomous Resource Operations

Essential resources. Autonomously coordinated.

ARO is a single-instance resource coordination workspace. Six specialists work around a central operator, while an Operations Director delegates investigations and prepares requests. The live canvas, handoffs and execution feed show committed SQLite activity. Select an employee to inspect its work, select a feed entry for the underlying evidence, or select the operator to review a decision.

## Run locally

Use Node 22 and npm from the repository root.

```sh
npm ci
npm run operator-key
npm run dev
```

Open http://localhost:3000/canvas. The first-visit introduction offers **Pick a resource event** or **Look around first**. Starting the guided demo creates a browser-specific SQLite deployment with simulated supplier receipts. The shared workspace uses the configured operator key for approvals and guidance. Run `npm run operator-key` to retrieve the local key.

1. Pick **Level 8 medicine shortage** and **Run response**. Hover over a seat for live status or click it to inspect connections, guidance, tasks, outputs and tools.
2. Review the policy comparison and approve the proposed transfer. Ask the team about a finding or open the full operational record.
3. Authorize the draft replenishment. Its task moves to **Supplier** on the board. In the guided demo, select **Simulate supplier delivery** to record a matching receipt and close the order.
4. Inspect the transfer ledger and hash-linked audit trail. **Reset demo** clears and reseeds this browser's sandbox, returns to the canvas, and invalidates queued requests from before the reset.

Without model credentials the controlled tools run deterministically. Configure `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) for local model-assisted work, or set `AGENT_MODE=deterministic` to run without cloud models. The public browser demo starts deterministic; visitors can choose **AI mode** and connect their own OpenRouter key. Public workspaces never use the deployment owner's model credentials. Visitor keys are encrypted separately from operational records, scoped to one workspace and reset generation, and expire after one hour. **Remove key** deletes the connection; **Reset demo** clears it. Hosting requires a server-only 32-byte base64 `ARO_KEY_ENCRYPTION_SECRET` in addition to the Turso configuration. Model availability, timeout, authentication and budget failures switch the worker to deterministic tools, with an audit entry. Authorization and inventory constraints apply in both modes. Set `PUBLIC_DEMO=1` to show the Hollow landing page and walkthrough video at the root URL.

## Blackout continuity

Open **Blackout kit** in the existing workspace header. While connected, ARO saves a local IndexedDB checkpoint and installs a service worker for Canvas, Board, Audit trail and their application assets. This requires a prior visit and HTTPS or localhost. The cache is local to that browser and origin; it is not a replicated inventory authority.

- A powered local Node/SQLite server continues deterministic operations without internet or cloud AI. It still needs a reachable local connection and valid authorization.
- If the browser cannot reach the server, the saved canvas and inventories remain accessible, including after reload. The identical deterministic allocator can produce provisional plans from the checkpoint. No browser-side approval or transfer is executed or automatically replayed.
- Investigation requests can be saved locally. On reconnection, explicitly review and send them. The server deduplicates their IDs and rejects requests from a different or reset workspace. Actual transfers use current server inventory and require approval.
- Download the self-contained **printable emergency kit** and **inventory CSV** beforehand. The kit contains saved counts, reserves, expiry dates, essential needs, provisional routes, a paper movement ledger and manual procedures. Print and distribute copies before a complete power loss. ARO cannot run without electricity.
- **Simulate server outage** pauses operational requests in this tab and is visibly labelled a drill. It does not disconnect the device's network. An actual outage can be demonstrated by stopping the local server after the shell and checkpoint are installed, then reloading the browser.

Cached records can be stale or evicted. Physical counts, safe routes and local human authorization are required for paper dispatch. After 24 hours, or with an invalid checkpoint time, cached plans stop proposing transfers. Missing task evidence and unavailable audit-chain verification are labelled explicitly. See [the resilience implementation and verification](docs/aro-resilience.md) for limits, recovery steps and live AI test results.

To reproduce a bounded real OpenRouter run on an isolated database:

```sh
npm run check:aro:credits
npm run check:aro:live
```

The live check uses `.env.local`, requires a non-renewing provider key cap of $5 or less, reports usage without displaying the key, and never touches the application sandbox. It performs a real, explicitly approved transfer in its isolated test database.

## First deployment · The Hollow

The planning day is March 8, 2087. Quantities represent indivisible dispatch units in one transport window.

| Track question | Operational response |
| --- | --- |
| #2 · Scarcity | Compare upper-level preference with essential needs and proportional coverage. Water crates, battery packs and food parcels have independent inventories, demand and dispatch capacities. |
| #10 · Access to basic care | Coordinate medicine kits for a Level 8 clinic. On a fresh seed the clinic has four kits, an expected shipment of twenty with four received, and weighted consumption of twenty-seven kits per day. The projected stockout is 3.6 hours. |
| #12 · Local food sharing | Route already harvested food from a growers cooperative and a second neighborhood stockpile. Protect reserves and draft replenishment for remaining demand. |

### How allocation works

The forecaster weights the seven preceding days of consumption from oldest to newest. Each facility’s essential floor is the greatest of its explicit minimum, population-based entitlement and priority-weighted daily consumption. The planning target also covers forecast demand over its configured horizon.

The allocator builds a direct-route network with source surplus, destination deficits, lane capacities and unit transport costs. It excludes expired and unavailable lots and protects reserves and local demand at donor facilities. Both policies run against the same measurements. The Directorate fills shallower communities first. ARO awards units to essential needs first and favors the lowest coverage ratio within that group. Successive augmenting paths can reassign earlier shipments between suppliers to keep constrained lanes usable. Transport cost breaks equivalent priority ties.

Comparison artifacts retain per-level coverage, overall essential coverage, facilities below minimum, forecast demand still unmet and transport cost. On the seeded medicine case both policies have 50 transferable kits. ARO can cover both essential floors even though some two-day demand remains unmet. Transfers update origin lots, destination lots and remaining lane capacities in one transaction. Supplies move in earliest-expiry order.

### Intake and replenishment

`GET /api/operations` returns the current incident, jobs, artifacts, comparisons and request. Pass `?incident=INC-1001` to inspect an earlier case. `GET /api/stream` streams committed activity and supports reconnect cursors.

`POST /api/operations` accepts JSON. For a protected action send `Authorization: Bearer <operator key>`. Examples of request bodies follow.

```json
{"action":"scan","resource":"medicine"}
{"action":"approve","id":"INC-1001"}
{"action":"observe","observation":{"kind":"usage","eventId":"clinic-count-001","facility":"deep","resource":"medicine","lot":"local","units":1}}
```

Usage and receipt observations trigger shortage detection. Observation IDs make retries idempotent. When forecast demand remains unmet, the director creates an internal replenishment draft. In the operator desk, authorize the draft. A receiving facility can then reconcile a matching delivery with the order.

```json
{"action":"observe","observation":{"kind":"receipt","eventId":"receipt-001","facility":"depot","resource":"medicine","lot":"shipment-B","units":23,"expected":23,"expires":"2088-01-01","order":"INC-1001"}}
```

Use the actual draft quantity and incident ID. Omit `order` for an independent receipt. Procurement authorization records internal intent. Physical deliveries and supplier acceptance require external confirmation.

### Persistence and verification

ARO runs one persistent Node process against a local SQLite volume. Files default to `data/aro.db`. Keep one process per database so restart recovery owns all running jobs. For Docker, mount `/data` and supply `ARO_OPERATOR_KEY`. If deployed behind a reverse proxy, set `ARO_PUBLIC_ORIGIN` to the canonical browser origin when it differs from the internal origin.

```sh
npm test
npm run typecheck
npm run build
npm start
```

The application contains resource operations and their shared workflow infrastructure. See [the architecture](docs/architecture.md) for persistence, execution, hosting and continuity details.
