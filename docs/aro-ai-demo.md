# Recording the local AI demo

The public Vercel demo starts deterministic. **AI mode** lets a visitor connect
their own OpenRouter key for a one-hour, encrypted, per-workspace connection.
No public model calls can fall back to the deployment owner's key. Pausing or
removing the connection returns to deterministic mode; Reset demo clears it.
The local instance enables browser
model calls only with `ARO_LOCAL_AI=1`, `AGENT_MODE=llm`, a configured provider
key, and no Vercel environment. The existing OpenRouter guard requires a
non-renewing key limit of at most $5 and credit remaining.

## Clean walkthrough

1. Start a fresh local demo and select **Level 8 medicine shortage**.
2. Watch the auditor find the 16-kit receipt shortfall. Open the forecast:
   the clinic has 4 kits and consumes 27 per day, giving 3.6 hours of supply.
3. Open the allocation artifact: ARO satisfies 100% of essential demand versus
   82.3% under the Directorate. Forecast target demand still has a 23-kit gap.
4. At approval, type **Why is ARO fairer than the Directorate?**
5. Type **Move 52 kits**, then **how about 49**, then **37 to level 8, 12 to
   North Commons**. The agent rejects 52, asks only for the missing destination
   for 49, then offers a checked split with a warning that the clinic would be
   one kit below its essential minimum. Nothing has been authorized yet.
6. Type **make that 38 to the clinic, keep North Commons the same**. The newest
   **On confirm** card shows 38/12; older cards are superseded. **Cancel** leaves
   inventory unchanged. **Confirm** records the reviewed revision and authorizes
   exactly that split. Execution, report and completion use the revised request.
7. Show Blackout kit if covering resilience. Distinguish its simulated outage
   from an actual disconnected browser and do not claim power-free computing.

The model genuinely invokes each assigned tool and reads its result before
selecting supporting facts for an update. The application renders all numerical
claims from those measured facts. Chat receives the full case and recent
conversation; the model interprets unfamiliar questions and destination
references. Explicit operational terms, numerical feasibility, available stock,
transport, and approvals stay under deterministic application control.

Unsupported/fabricated summary references are discarded and audited; the
measured tool result remains visible. A failed explanation cannot repeat a
committed transfer or block its handoff. Legacy unvalidated rationale paragraphs
are not rendered as factual summaries. Post-transfer chat distinguishes current
stock from the original investigation and does not replay old handoff language.

Task chat uses agent replies, conversation history and a separate Confirm/Cancel
card for proposed changes. Confirmations are bound to server-stored plans and
current inventory/routes; stale cards are rejected. Original requests and
confirmed revisions remain immutable. Evidence chat stays read-only. Resource
policy editing through chat is not implemented.

## Verification

- Unit/regression: `npx vitest run`.
- Complete live medicine workflow: `npm run check:aro:live`.
- All four live model scenarios and operator questions:
  `node --env-file=.env.local --import tsx scripts/aro-ai-regression.ts`.
- Single scenario: add `--resource medicine`, `food`, `water`, or `power`.
- Live conversational correction and confirmation:
  `node --env-file=.env.local --import tsx scripts/aro-chat-live-check.ts`.
- One tool/summary check: add `--single`.
- Provider-reported usage: `npm run check:aro:credits` (usage may settle later).
- Isolated live public visitor workflow, chat confirmation and key removal:
  `node --env-file=.env.local --import tsx scripts/aro-public-byok-check.ts`.
  This requires HTTPS access to tryaro.app and uses the configured key only as
  that test visitor's credential, removing its saved connection in `finally`.

Live regression requires successful model summaries and model-assisted chat;
it fails rather than silently passing on deterministic fallback. It verifies no
transfer before approval, exactly-once execution, completion, and the audit hash
chain. Unit tests additionally inject outages, fabricated fact IDs, out-of-scope
evidence, negative/fractional amounts, route limits and a reset during chat.
