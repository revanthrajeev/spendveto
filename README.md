# SpendVeto

**The spend-governance layer for AI agents that pay for things.** Payment rails move an agent's money; SpendVeto decides whether the agent should be allowed to move it — policy checks, human approval, delegated budget caps, and a runaway-agent kill switch, enforced *before* any payment happens.

[**Live site + playground**](https://spendveto.com) · [**Docs**](https://spendveto.com/docs.html) · Apache-2.0 · x402 + MCP native

**Every claim in this README is executed before it ships.** `npm run verify` runs **277 end-to-end assertions** from a clean clone — real secp256k1 keypairs, real ECDSA verification, a real MCP stdio JSON-RPC session, and a synthetic runaway agent frozen mid-burst. If a claim isn't a test, it doesn't ship; features that can't work locally yet are declared slots that refuse honestly, never stubs that pretend.

What *isn't* true yet is stated just as plainly: no external security audit, no customers. Settlement is testnet and simulate only for EVM/Solana/Aptos/Stellar/Hedera — the one exception is XRPL, which settles on mainnet, real money, in RLUSD. Funding positioning and market numbers live in [`PITCH.md`](./PITCH.md).

## What this actually is

A governance gate in front of a catalog of paid endpoints, reachable three ways — CLI, delegated child agents, and any MCP client:

```
agent (CLI / child wallet / Claude via MCP)
   → frozen? (manual kill switch, or auto-frozen by the runaway-burst detector)
   → policy check (per-call, hourly, rate, cascading delegation caps)
   → [maybe: human approval on the dashboard — fails closed on timeout]
   → pay $X USDC via x402 (simulate or Base Sepolia testnet)
   → GET /api/agent/<tool> → Claude does the task
   → everything lands in the ledger; blocked-spend dollars roll up on the dashboard
```

## Quick start

```bash
npm install
npm run server               # terminal 1 — :8402, dashboard at http://localhost:8402
npm run call                  # terminal 2 — pays for "review" ($0.01), auto-approved
npm run call -- summarize      # $0.02 — above the approval line: go approve/deny it on the dashboard
npm run call -- translate      # $0.005
```

`npm run verify` runs the whole thing headlessly — **277 end-to-end assertions**: catalog, forged-signature rejection, hard policy blocks, all three approval outcomes (approved / denied / timed-out-fails-closed), delegation caps including the n-level cascade, tool + chain scoping, multichain settlement (chain-scoped signatures, per-chain balances, chain allowlists), runaway-burst auto-freeze, the manual kill switch, signed-receipt verification, CSV export, per-tool/per-wallet/per-chain analytics, webhook alerts actually arriving at a live receiver, structured self-correcting denials, side-effect-free dry runs, TTL grant expiry, one-click approval links, the stats endpoint, AP2 mandate-chain drift detection, human-not-present authority, governed Bazaar discovery, ACP shared-payment-token scope, request-integrity binding (including a payload swapped after authorization), signed dispute evidence packs and their tamper detection, OpenTelemetry span export under an inbound traceparent, and a real MCP stdio JSON-RPC round trip.

> **On the number:** a fresh clone runs **277** assertions. Three more exercise a real cross-project integration against [Basis](https://github.com/revanthrajeev/basis) and run only when `../prediction-copilot` is checked out beside this repo — the suite prints `(skipped: cross-project Basis integration test …)` when it isn't. Every published number is the 277 anyone can reproduce.

**Marketing site**: `npm run site` serves the deploy-ready landing page (Three.js hero, animated product walkthrough) at http://localhost:8403 — `site/` is fully static and self-contained, drop it on Vercel/Netlify as-is. Includes an **interactive playground** (`site/playground.html`) that runs the real policy-decision logic client-side — set a budget, fire agent spend, watch it pass/pause/block — and a **use-cases** page grounded in real 2026 agent-spend scenarios.

## The catalog

Three real Claude-backed tools at three prices (`shared-config.js`):

| Tool | Price | Governance path |
|---|---|---|
| `translate` | $0.005 | auto-approved |
| `review` | $0.01 | auto-approved |
| `summarize` | $0.02 | pauses for human approval (> $0.015) |

## MCP: governance the model can't opt out of

`mcp/server.js` exposes the paid catalog to any MCP client. The agent sees ordinary tools; every call silently runs the full governed pipeline (policy → approval → x402 payment) before the task executes. Blocked calls come back as tool errors explaining which gate stopped them and that nothing was spent.

```bash
# Register with Claude Code (server must be running: npm run server)
claude mcp add spendveto -- node ~/Desktop/spendveto/mcp/server.js
```

Or in Claude Desktop's config:

```json
{ "mcpServers": { "spendveto": { "command": "node", "args": ["/Users/you/Desktop/spendveto/mcp/server.js"] } } }
```

### MCP-Pay: the seller side of the same server

That's buyer-side governance. The same server also does seller-side monetization: `POST /api/catalog/tools` lets **anyone** register their own MCP tool behind the identical x402 gate, with their own `payTo` — no code changes to `mcp/server.js`, no separate seller infra. It shows up in `tools/list` next to the built-in tools, and a call to it runs through the exact same policy → approval → payment pipeline, but settlement credits the *seller's* address, not SpendVeto's.

```bash
curl -X POST localhost:8402/api/catalog/tools -H 'Content-Type: application/json' -d '{
  "id": "my-tool", "price": 0.01, "payTo": "0xYourAddress...",
  "label": "My paid tool", "description": "what it does"
}'
```

One server, both sides of the market: buyers get governed spend, sellers get a payable, discoverable MCP tool with zero new infrastructure.

Four tools appear: `review`, `summarize`, `translate` (each priced in its description) and `spendveto_status` (free — wallet, balance, policy, last-hour spend, pending approvals, delegated budgets). Ask Claude *"what's my agent's budget status?"* then *"run the paid summarize tool"* and watch the approval appear on the dashboard.

## Budget delegation ("IAM for money")

A parent wallet grants a child agent wallet a capped lifetime budget — and children can delegate onward. Caps cascade: a grandchild's spending counts against its own cap **and every ancestor's**, so a whole team of sub-agents can never outspend the budget at the top of its branch. Enforcement runs in the caller's own policy check on every call; the dashboard shows the hierarchy as live spend-vs-cap bars.

```bash
npm run delegate -- 0.015 "team lead"                 # main wallet grants $0.015
npm run delegate -- 0.05 "intern" --parent "team lead" # team lead grants onward
npm run call -- review --child=intern                  # fine — fits both caps
npm run call -- review --child=intern                  # BLOCKED … granted to ancestor "team lead"
npm run delegate -- 0.02 "translator" --tools translate # scope, not just size
npm run call -- review --child=translator               # BLOCKED … outside its delegated scope
npm run delegate -- 0.02 "base only" --chains base-sepolia  # pin the settlement chain too
npm run call -- review --child="base only" --chain=polygon   # BLOCKED … outside its delegated chain scope
npm run delegate -- 0.05 "flash task" --ttl 10m              # time-boxed budget: self-expires
```

Revoke anytime: `POST /api/delegations/:id/revoke` — a revoked link kills the whole branch below it.

## Receipts, exports, alerts, analytics

Every simulate-mode settlement comes back **ECDSA-signed by the server** (`settlement.signature` / `signedBy` / `receiptId`) so receipts are independently verifiable — and now addressable: `GET /api/receipts/:id` looks one up, `POST /api/receipts/verify` checks any receipt's signature server-side (a tampered price fails — tested). Set `alertSigningSecret` in the policy and every webhook delivery carries an `X-SpendVeto-Signature` HMAC header, so receivers can prove an alert really came from your SpendVeto. The full ledger exports as CSV at `/api/export.csv`; per-tool and per-wallet rollups live at `/api/analytics`; and if you set `alertWebhookUrl` in `data/policy.json`, freezes, blocked calls, and pending approvals POST to it in real time (point it at a Slack incoming webhook).

## Kill switch + runaway detection

Any wallet can be frozen from the dashboard (or `POST /api/freezes`), and a wallet firing payment attempts faster than the policy's burst threshold (default: 10 attempts in 10 seconds) is **frozen automatically** — a runaway agent loop is caught mid-burst, not on next month's invoice. Frozen wallets are blocked in their own policy check *and* refused at the simulate payment gate even with a correctly signed payment (403). Unfreeze with one click once you've figured out what the agent was doing.

## Enforcement proxy — keyless agents ("SpendVeto on the money path")

`npm run proxy` (:8404) flips the trust model: **agents never hold keys at all.** They POST a spending *intent*; the proxy holds custody, runs the full pipeline (freeze → policy → cascading caps/scopes → approval), and only then signs and pays. A rogue agent can't skip its policy check because it never had anything to sign with.

```bash
curl -X POST localhost:8404/proxy/call -H 'Content-Type: application/json' \
  -d '{"tool":"review"}'                      # custody wallet
  -d '{"tool":"review","child":"intern"}'      # spend as a delegated child, by label
```

Refused intents come back `403` with the gate, the reason, and a **structured denial** — nothing signed, nothing moved. Send an `Idempotency-Key` (header or body) and a retried intent **replays the stored response instead of paying twice** — a crash-looping agent can't double-spend (tested: same key twice → one ledger entry).

## Denials agents can act on, dry runs, time-boxed budgets

Three controls born from the July 2026 research round (see `launch/DEEP_RESEARCH_PROMPTS.md`):

- **Self-correcting denials** — every block carries a machine-readable `code` (`per_call_cap`, `chain_scope`, `hourly_usd_cap`, `delegation_expired`, …) and a concrete `suggestion` ("retry on an allowed chain: base-sepolia, base" / "remaining budget on this line is $0.0050 — pick a cheaper tool"). The CLI prints it as a `Fix:` line, MCP blocked-tool errors include it so **the model can self-correct instead of retry-looping**, and the proxy returns it in the 403 body.
- **Dry runs** — `npm run call -- summarize --dry-run` (or `{"dryRun": true}` on the proxy) evaluates the entire pipeline — freeze, chain rules, caps, delegation walk, approval threshold — and reports *would pay / would pause for approval / would block (with the fix)* with **zero side effects**: no payment, no approval request, no ledger entry (tested).
- **Time-boxed budgets** — `--ttl 90` / `--ttl 10m` / `--ttl 2h` on any grant: past `expiresAt` the grant is as dead as a revoked one, and an expired *ancestor* kills its whole branch.
- **One-click approvals** — approval webhooks now carry `approveUrl` / `denyUrl`; paste the alert into Slack and the approver decides with a single click from chat.

## One API, any rail (`rails/`)

Every payment rail plugs in behind the same four-line contract — `{ id, name, status, pay({ tool, account, chain, baseUrl }) }` — and the governance pipeline never learns which rail settled. Two rails are live today (`x402-simulate`, `x402-live` — the latter facilitator-adaptive across every registry chain the facilitator supports); Google AP2, OpenAI ACP, and Stripe Machine Payments are **declared adapter slots** that refuse honestly (`not implemented yet — funded-roadmap slot`) instead of pretending. `GET /api/rails` serves the registry; the proxy advertises it in `/proxy/health`. This is the "Stripe for agent spending" shape without the money-transmitter license: one integration in front of every rail, governance above, settlement below.

## SDK, LangChain, and concurrency-safe caps

Two code-level integration surfaces beside the CLI and MCP server, both dependency-free and both exercised end-to-end in `npm run verify`, not just parsed:

- **`sdk/`** — a Node client (`SpendVeto` class): `.pay()`, `.dryRun()`, `.chat()` (governed LLM/API spend), `.registerAgent()`, `.catalog()`. A blocked call throws a typed `SpendVetoDenialError{code, suggestion, stage}` instead of silently no-oping.
- **`integrations/langchain.js`** — catalog tools exposed as LangChain-shaped `{ name, description, func }` objects, zero hard dependency on `@langchain/core`. Denials throw with the structured code embedded so an agent's next reasoning step can self-correct.
- **`integrations/openai-agents.js`** — the same governed catalog as OpenAI Agents SDK-shaped `{ name, description, parameters, execute }` tools (the `tool()` helper's contract), zero hard dependency on `@openai/agents`; it reshapes the LangChain adapter, so both run one pipeline.

Both call through the enforcement proxy, which now serializes each wallet's decide-and-commit unit (`withWalletLock` in `client/pay.js`) — closing a real race where concurrent calls against the same wallet could each read the same "spent so far" snapshot and jointly overspend a cap sized for one. Proven with 6 concurrent calls against a cap with room for exactly one: exactly one wins, every run. Code samples: [docs.html#sdk](./site/docs.html#sdk).

## Agents, Marketplace & Report pages (the Console, completed)

Two pages close the loop between what the API could already do and what a human can click: **Agents** mints wallet-bound identity tokens and lists marketplace tools from forms (no curl needed), and **Report** answers "what did this cost us and what did governance stop?" for a rolling window — `GET /api/report?days=7` — with a one-line headline built to paste into Slack, spend-by-category and spend-by-chain breakdowns, and the top reasons governance blocked something.

## Competitor-parity controls (from the July 2026 research map)

Four controls the funded players ship, rebuilt honestly and tested:

- **Agent identities** (Skyfire-style "know your agent") — `POST /proxy/agents {label, child}` mints a bearer token, optionally **bound to one wallet**. Open mode while none exist (zero-setup demos); the moment the first identity registers, proxy intents require `Authorization: Bearer …`, and a bound token can only ever spend as its own wallet (tested: a body `child` override is ignored). `GET /proxy/agents/:id/credential` is the KYA credential itself — one read joining that identity to its wallet's live trust score, freeze status, and delegation scope (cap/tools/chains/payees), so a counterparty can check "what is this agent actually allowed to do" without cross-referencing four endpoints by hand.
- **Category caps** (Ramp-style) — tools carry a spend category; `"categoryCapsUSD": {"content": 5}` in the policy caps each category per hour, computed from the ledger's own tags.
- **N-approver rule** (Safe-style) — `"approversRequired": 2`: a deny is instant and final, but approval lands only when enough humans have clicked (tested: one approval keeps it pending).
- **Trading-hours window** — `"allowedHoursUTC": {"start": 13, "end": 21}`: outside the window, nothing spends. The "my bot traded at 3am" control, wrap-around windows included.

## Five more, from the July 2026 competitor re-scan (x402 Foundation launch, AP2/Mastercard Agent Pay/Visa Trusted Agent going live)

- **Per-agent rate limiting + freeze** (`proxy/server.js`) — wallet-level budget caps stay the source of truth for money, but several agent identities can share one wallet (`agents.json`), so a single misbehaving or looping agent needs to be stoppable *without* freezing every other agent on that wallet. Each identity gets its own sliding-window call limit (`PER_AGENT_CALLS_PER_MIN`, default 20); 3 consecutive rate-limit hits auto-freeze just that identity (`POST /proxy/agents/:id/freeze` / `/unfreeze` for manual control too) — reusing the existing freeze store under a synthetic `agent:<id>` key, so it's still dashboard-visible and alerted like any other freeze.
- **Signed consent records** (`server/consents.js`, Visa Trusted-Agent-Protocol-style) — granting or revoking a delegation now also writes an ECDSA-signed consent record (same server key that signs settlement receipts and AP2 verdicts) — `GET /api/consent/:delegationId` for the trail, `POST /api/consent/verify` to check any record's signature independently, without trusting the JSON file.
- **Agentic tokens** (`POST /api/agentic-token`, Mastercard-Agent-Pay-style) — a thin, honest bundle over the two primitives above: a delegation scoped to *exactly one* merchant payee plus its signed consent, returned as one object (`GET /api/agentic-token/:id` to look it up). Enforcement is the same payee-allowlist + cap check every delegation already gets.
- **Verifiable-Credential export for AP2 verdicts** (`server/vc.js`) — `POST /api/ap2/evaluate?format=vc` re-shapes the same signed verdict as a W3C-VC-shaped envelope (AP2 itself is built on Verifiable Credentials). Honestly labeled: the proof type is SpendVeto's own, not a registered DID method/proof suite — but `proof.message` + `proof.proofValue` are the exact same ECDSA signature the unwrapped endpoint already returns, independently checkable with `verifyMessage` or any ECDSA library.
- **Cross-rail receipt normalization** (`server/receipts.js`) — `GET /api/receipts/normalized` projects every ledger entry (x402 crypto settlement, metered LLM/API spend, and whichever rail settles next) through one stable shape, so a client doesn't need to know which rail produced which entry. `proof` is only populated for entries that actually have a signed receipt — never fabricated for the ones that don't.

## Three more, from the August 2026 re-scan (AP2 v0.2.0, x402 v2 Bazaar)

Two protocol moves since the last round changed what a governance layer has to cover, and both open a gap that a per-call spend cap structurally cannot see.

- **AP2 mandate chains — is the cart still the intent?** (`server/ap2.js`, `POST /api/ap2/mandate-chain`) — AP2 models a purchase as a chain: an Intent Mandate the human signs, then a Cart Mandate the agent assembles. `/api/ap2/evaluate` judges one amount, so it cannot catch the failure the chain exists to expose — a cart that is comfortably within budget and still unauthorized. This checks the cart against the intent it claims to come from: total over the intent's ceiling (`cart_exceeds_intent`), a declared total that contradicts its own line items (`cart_total_mismatch` — checked *before* any cap, since a total the cart can't justify is not the number to check a cap against), a merchant or category the intent never authorized (`merchant_drift` / `category_drift`), one authorization fanned across more sellers than the intent allows (`multi_merchant_spray` — a documented agent-compromise signature), an expired intent, and a cart presented with an intent it didn't derive from. Deterministic and local; no model judges the drift. Verdicts are ECDSA-signed like every other decision.
- **Human-not-present authority** (same endpoint) — AP2 v0.2.0 formalized flows where the agent buys with no human available. In those, "pause for approval" is not a pause, it's an unanswerable question, and treating it as one either hangs the flow or quietly waves it through. SpendVeto's rule: the signed intent mandate *is* the human's advance authorization, so within its stated ceiling the call proceeds (`preAuthorizedByIntent: true`, and the verdict says so); beyond it — or when the intent names no ceiling at all — there is no authority and nobody to ask, so it fails closed (`hnp_no_authority`). Never silently upgrades an over-intent spend into an allow.
- **Governed Bazaar discovery** (`server/discovery.js`) — x402 v2's Bazaar layer lets an agent discover and pay a service it has never heard of, with no pre-baked integration. That is the point, and it is also the problem: a payee allowlist consulted at settlement learns about a prompt-injected agent's chosen endpoint far too late to help. `GET /api/discovery/resources` publishes SpendVeto's own catalog in Bazaar's schema (CAIP-2 network, USDC base units, flagged `governed` so a buyer knows the price is a floor). `POST /api/discovery/govern` runs the other direction — it filters a *discovered* catalog through the live policy before the agent sees it, so a service it could never be allowed to pay for is never in the list it chooses from, with each removal naming the rule that made it and the policy version in force. A pre-filter that shrinks what a compromised agent can even name; whatever it does pick still runs the full pipeline at call time.

## Four more, from the August 2026 competitor deep-scan (Fireblocks/x402, ACP, agent chargebacks, OTel)

The buyer side got crowded fast: Fireblocks joined the x402 Foundation and is contributing a security extension for *request integrity and spend governance*; AWS previewed Bedrock AgentCore Payments with spending limits; Cloudflare announced Account Wallets with spend controls; a 2026 Cloud Security Alliance survey put 65% of enterprises running agents at one or more agent-related incidents in twelve months. Four gaps came out of that scan, each one something a per-call cap structurally cannot do.

- **Request integrity — "is this the spend I *allowed*?"** (`server/integrity.js`, `POST /api/integrity/bind` → `/api/integrity/verify`) — every control here answers *is this spend allowed*. None of them answered *is this the spend I allowed*. Policy runs on a described request; something else executes. In between, a compromised or merely buggy agent can change the payload — same payer, same price, same approval, different merchant or different goods — and every amount-based control passes, because the amount never moved. So: canonically digest the request (recursive sorted-key SHA-256, so key order can't change the answer), sign the digest with the same key that signs receipts and verdicts, and refuse at execution when the payload no longer matches (`request_integrity_mismatch`). Bindings are single-use (`binding_consumed` — an authorization that can be replayed is a coupon, not a binding), TTL-bounded (`binding_expired`), and agent-scoped (`binding_agent_mismatch`). This is the buyer-side counterpart to what Fireblocks is contributing to x402.
- **ACP Shared-Payment-Token scope** (`server/acp.js`, `POST /api/acp/checkout`) — ACP's Delegated Payments Spec issues an SPT: a bearer credential minted for an amount, a merchant and a window, letting an agent check out without ever seeing the buyer's card. The merchant validates the token. Nobody validates the shopping — and a token scoped to $200 at one merchant will happily clear $200 of the wrong goods. Same shape as the AP2 drift above, so it gets the same treatment: `spt_merchant_drift`, `session_exceeds_spt`, `spt_expired`, `spt_category_drift`, `session_total_mismatch` (arithmetic checked *before* the ceiling, because a total the line items don't justify is not the number to measure), and `spt_currency_mismatch` — SpendVeto refuses to compare a ceiling in one currency against a charge in another rather than guessing a rate. An allowed session leaves bound to its own bytes; a denied one gets no binding.
- **Dispute evidence packs** (`server/disputes.js`, `GET /api/disputes/:entryHash/evidence`) — when a human disputes a charge, the merchant defends it with device fingerprint, IP, browsing session, delivery confirmation. An agent purchase produces none of those, so agent transactions lose by default and the merchant pays. Visa TAP, Mastercard Agent Pay, AP2 and Amex's agent protections all describe *authorization*; none yet define the after-the-fact defence file. SpendVeto is already sitting on it — nothing new is captured. A pack assembles the ledger entry pinned between its neighbouring hashes (the anti-backdating argument), the policy hash in force with any drift since then **disclosed rather than hidden**, the human approval record, and the signed consents for the delegation the payer spent under — then signs the bundle over its own digest, so a pack edited in transit stops verifying (`pack_tampered`). Every pack carries a `doesNotEstablish` list *inside the artifact*: it never implies delivery, satisfaction, or that the policy was a good one — only that it was in force and was applied.
- **OpenTelemetry decision spans** (`server/otel.js`, `GET /api/otel/spans`) — agent teams already trace prompts, tool calls and sub-agents, and the requirement that keeps appearing in agent-governance evaluations is OTel-native visibility: the spend decision has to appear *as a span inside the trace that caused it*, not in a second system someone correlates by timestamp at 3am. OTLP/HTTP is JSON over POST, so this is dependency-free — pulling the OpenTelemetry SDK into the one component whose job is refusing to trust things would add a supply-chain surface for no gain. Pass a W3C `traceparent` and the refusal lands under the agent run that tried to spend; span ids derive from the entry hash so re-export doesn't duplicate spans in the backend; a malformed header degrades to a standalone trace rather than breaking the decision surface. **A blocked spend is status OK, not ERROR** — the gate did its job, and colouring refusals red trains a team to ignore the colour that matters.

## ElizaOS: governance for agents that already move money

`integrations/eliza.js` is a real ElizaOS plugin — dependency-free, so it imports nothing from `@elizaos/core` and forces an install on nobody. ElizaOS agents already do Solana transfers and swaps, which makes "the agent decided to spend" a live problem there rather than a hypothetical one.

```js
import { createSpendVetoPlugin } from "./integrations/eliza.js";
const plugin = await createSpendVetoPlugin({ agentToken: "tg_..." });
// add `plugin` to your character's plugins array
```

Two halves, and the second matters more:

- **Actions** — one per catalog tool, each running the full governed pipeline through the enforcement proxy before anything is signed. A refusal comes back as `ActionResult{ success: false }` carrying the denial code, **not** as a throw: ElizaOS handlers return results, and a machine-readable code is what lets the next reasoning step pick a cheaper tool instead of retrying the same blocked call.
- **A budget provider** — injects the wallet's live remaining spend, per-call ceiling and approval threshold into the agent's context *before* it decides anything. Blocking a spend after the model has committed to it produces a retry loop, because the model never learns it was near a limit. Telling it up front lets it choose the affordable option. If SpendVeto is unreachable the provider says spending is restricted rather than staying silent — a governance layer that fails open by omission isn't one.

## Marketplace + allowances: the two-sided flywheel

**Anyone can list a paid tool behind the gate** — the catalog is supply, not a fixed demo:

```bash
curl -X POST localhost:8402/api/catalog/tools -H 'Content-Type: application/json' \
  -d '{"id":"haiku","price":0.008,"label":"Haiku writer","upstreamUrl":"https://your-api.example/haiku"}'
npm run call -- haiku        # any agent pays it through the full governed pipeline
```

Registered tools get the identical 402 gate (chain-scoped signatures, receipts, ledger); with an `upstreamUrl` the paid call is forwarded, without one it answers with a canned body. Sellers list, buyers govern — both sides of agentic commerce in one stack.

**Budgets can be allowances** — caps that re-fill on a rolling window instead of running out forever:

```bash
npm run delegate -- 5 "shopping agent" --every 7d    # $5 a week, self-refilling
```

Spend inside the window counts against the cap; as it ages out, the budget refills by itself (tested with a 2-second window: spend → blocked → auto-refill → spends again). This is the "give your agent a weekly allowance" primitive — for teams today, for consumer agents tomorrow.

**Simulated top-ups**: `POST /api/balances/topup {address, chain, amount}` funds a per-chain balance in simulate mode (and only there — on-chain balances come from real faucets, never an API).

## The API-spend rail: governing the money agents already burn

Crypto is rail #1 because it was verifiable locally — but the same pipeline governs LLM/API spend, which is where every agent team bleeds money *today*:

```bash
curl -X POST localhost:8404/proxy/llm -H 'Content-Type: application/json' \
  -d '{"prompt":"summarize x402 in one line","maxTokens":200}'
  -d '{"prompt":"…","maxTokens":20000}'          # big estimate → pauses for human approval, FAILS CLOSED
  -d '{"prompt":"…","child":"intern"}'            # delegated budgets bind token spend too
```

Auth/capture, like real spend platforms: worst-case cost is estimated up front (`LLM_RATE_IN_PER_M` / `LLM_RATE_OUT_PER_M`, USD per million tokens — set from your provider's price sheet), the **full pipeline runs against the estimate** (freeze → policy → cascading budgets → approval), the upstream call happens only if it passes, and the *actual* metered cost lands in the same ledger — rolled up as its own `api` bucket beside the chains. With `ANTHROPIC_API_KEY` set the completion is real; without it, the completion is simulated but the governance and metering are not. An agent's tokens, API calls, and USDC all answer to one policy engine.

## Multi-chain: chain-aware governance, not a logo strip

Seven chains are registered in `shared-config.js` (each with its canonical USDC contract and an RPC), surfaced at `/api/chains`. The chain is a **governed dimension of every payment**, end to end:

- **Chain-scoped signatures** — the chain rides inside the signed payment message, so an authorization created for Polygon can never settle against another chain's balance (tested: a polygon-signed authorization is rejected on arbitrum).
- **Per-chain balances** — every `(wallet, chain)` pair has its own simulated USDC balance; paying on Polygon debits Polygon only.
- **Chain allowlists** — `"allowedChains": ["base-sepolia", "base"]` in `data/policy.json` blocks agents from settling anywhere else; the `cautious` and `production` packs ship with chains pinned.
- **Chain-scoped delegation** — `--chains base-sepolia` pins a child's settlement chains, and (like caps and tool scopes) every ancestor's chain scope binds the whole subtree.
- **Everywhere** — `npm run call -- review --chain=polygon`, proxy intents (`{"tool":"review","chain":"arbitrum"}`), per-chain rollups at `/api/analytics`, a chain column in the CSV export, chain tags on the dashboard ledger.
- **Facilitator-adaptive live settlement** — in testnet mode the gate asks its configured facilitator what it can settle (`GET /supported`) at boot and brings **every registry chain the facilitator names** live: per-chain scheme registration and one accepts entry per chain in every 402, priced as explicit atomic-USDC amounts against each chain's canonical contract. Tested against a mock facilitator both ways: advertising all twelve brings all twelve live; advertising one brings exactly one, with the rest reporting `settlement: "ready"` on `/api/chains`. The public facilitator settles Base Sepolia, Solana devnet, Aptos testnet, Stellar testnet, Hedera testnet, and XRPL mainnet today — six signature schemes across six account models; pointing `SPENDVETO_FACILITATOR_URL` at a CDP facilitator (with an API key) and funding a wallet flips its mainnet chains live with **zero code changes** — the remaining gap to real mainnet spend is a key, funds, and a security audit, not engineering.

On-chain settlement is live on Base Sepolia via x402 today; every registered chain runs the full pipeline in simulate mode (real chain-scoped signatures, local settlement). Per-chain facilitator adapters are the funded milestone — the governance layer is already chain-complete.

## Evidence surfaces: SIEM events, policy versioning, signed verdicts, billing

The July-2026 research round said it plainly: rails log *payments*; enterprises need evidence of the *decisions before them*. Four surfaces (all tested):

- **Decision events** — `GET /api/events` reshapes the hash-chained ledger into one stable schema (`spendveto.decision.v1`): agent, decision, amount, payee, denial reason, receipt id, policy version, chain-of-custody hashes. `GET /api/events/export` emits JSON Lines — one decision per line, straight into Splunk/Datadog/Elastic/`jq`, no envelope parsing.
- **Policy versioning** — every gate decision is stamped with `policyHash`, the SHA-256 of the policy in force at that moment. "Which policy allowed this spend?" is answerable from the ledger alone, after any number of policy edits.
- **AP2-style mandate evaluation** — `POST /api/ap2/evaluate` runs the full policy pipeline against an AP2-shaped mandate (agent, amount, payee, expiry) and returns the verdict **ECDSA-signed** by the server's receipt key: portable evidence anyone can verify. Expired mandates refuse with `mandate_expired`. AP2 *settlement* remains an honest roadmap slot — this is the governance half, real today.
- **Governed billing** — a settlement pushes one `spendveto.usage.v1` event (keyed by receipt id) to `policy.billingWebhookUrl`, optionally HMAC-signed: SpendVeto enforces pre-payment; Lago/Orb/Metronome-style platforms invoice post-usage. Division of labor, not a billing engine.

The control inventory in [CONTROLS.md](./CONTROLS.md) maps all of this (and every other control) to EU AI Act / NIST AI RMF runtime expectations — each row citing the verify assertion that exercises it. A self-assessment, explicitly not a certification.

## Trust scores & policy packs

`GET /api/trust/:address` compresses a wallet's governance history into a 0–100 score with a letter grade — paid history earns trust; blocks, failures, and freezes burn it (a runaway wallet grades **F** at score 0). The score now scales out two ways (both tested): `GET /api/trust/graph` builds the **trust graph** — every wallet a scored node, every delegation an edge, every delegation root an "org" with a paid-volume-weighted score over its whole sub-tree — and `GET /api/trust/payee/:address` is the **counterparty bureau**: a recipient's reputation aggregated across every wallet that ever paid (or was blocked from paying) it, including the average governance score of its payers. Still computed from one deployment's own ledger — the *cross-organization* federation of these graphs is the roadmap this seeds.

Governance ships as presets: `npm run policy` lists the packs (`cautious` / `standard` / `production`), `npm run policy -- apply cautious` applies one (previous policy saved to `.bak`). Teams can commit their own packs.

## Human-in-the-loop approval

Prices above `requireApprovalAboveUSD` (in `data/policy.json`) pause the call and post to the dashboard's approval queue — Approve / Deny buttons, live. Three outcomes, all ledgered with reasons: approved → pays; denied → exits without paying; **no decision in 30s → fails closed** (never spends without sign-off).

## Two modes, both real

| | `simulate` (default) | `testnet` |
|---|---|---|
| Crypto | Real secp256k1 keypair, real ECDSA sign + verify (viem) | Real EIP-3009 payment authorization |
| Settlement | Off-chain balance in `data/balances.json`, seeded $5.00 | Real [x402](https://x402.org) **v2** on Base Sepolia (CAIP-2 ids, `@x402/*` packages) via the public facilitator — set `SPENDVETO_FACILITATOR_URL` to Coinbase CDP's facilitator (self-serve API key) to unlock the mainnet chains it serves |
| Setup | Zero | Fund one wallet at [faucet.circle.com](https://faucet.circle.com) (Base Sepolia) |

Nothing is faked to look real — simulate mode verifies genuine signatures and rejects forged ones (tested); it just settles locally. Testnet mode is the actual `@x402/express`/`@x402/fetch` **v2** packages against the live public facilitator, confirmed working per-tool up to the faucet-funding boundary (browser + captcha — the one unautomatable step).

## Files

```
shared-config.js         tool catalog (id/path/price), 12-chain registry across six signature families (USDC/RLUSD contracts, RPCs), mode, port
server/
  index.js                Express app: catalog, ledger, stats, analytics, CSV export, policy, approvals, delegations, freezes APIs
  simulate.js              per-tool 402 gate factory: real signature verify, replay protection, freeze refusal, signed receipts
  agent.js                 the paid tasks — one Claude call per tool, canned fallback without a key
  ledger.js                JSON ledger + simulated balances
  approvals.js              in-memory pending-approval store
  delegations.js            durable budget-grant store (caps + tool scopes)
  freezes.js                durable kill-switch store
  anomaly.js                runaway-burst detector → auto-freeze
  alerts.js                 fire-and-forget webhook alerts (Slack-ready)
  ap2.js                    AP2 mandate chains: cart-vs-intent drift + human-not-present authority
  discovery.js              x402 v2 Bazaar: publish the catalog, and policy-filter a discovered one
  acp.js                    ACP shared-payment-token scope: is the session the purchase the token funds?
  integrity.js              request binding: is this the spend I allowed? (canonical digest, single-use)
  disputes.js               signed dispute evidence packs — the agent-chargeback defence file
  otel.js                   OTLP decision spans; adopts an inbound W3C traceparent, blocked ≠ ERROR
client/
  wallet.js                parent keypair + delegated child wallets (pick by label)
  policy.js                the governance wedge: freezes, hard limits, approval threshold, cascading caps
  pay.js                   shared governed pipeline: policy → approval → pay → log
  pay-and-call.js           CLI wrapper (--child, --child=<label-or-address>)
rails/
  index.js                 rail registry: one pay() contract, x402 live, AP2/ACP/MPP as honest slots
  x402-simulate.js         zero-setup rail: real ECDSA, chain-scoped, local settlement
  x402-testnet.js          real on-chain rail: Base Sepolia via the public facilitator
mcp/
  server.js                MCP middleware: paid catalog + spendveto_status over stdio
proxy/
  server.js                enforcement proxy: key custody, agents POST intents (:8404)
dashboard/                the Console: 8 pages (overview, approvals, budgets, ledger, chains, analytics, trust, policy) with create/edit/freeze/apply controls
scripts/
  delegate.mjs              grant a capped budget (--parent for deeper levels, --tools for scope)
  gen-wallets.mjs           one-time testnet wallet generation
  policy.mjs                list/apply policy packs
  site.mjs                  serves the marketing site on :8403
  verify.mjs                277 end-to-end assertions incl. MCP stdio round trip + multichain + auto-freeze
data/
  policy.json               editable spend rules incl. anomaly burst threshold + alertWebhookUrl
  policy-packs/             importable governance presets (cautious/standard/production)
  ledger/balances/delegations/children/freezes.json   runtime state (gitignored)
site/                     deploy-ready landing page (Three.js hero, fully static)
PITCH.md                  funding pitch: TAM/SAM/SOM, competition, accelerator targets (all cited)
launch/                   Show HN draft, 90-second demo script, ecosystem-listing blurbs
RESEARCH_PROMPT.md        the deep-research prompt behind feature round 2
```

## Roadmap (what funding buys — see PITCH.md)

- Hosted backend (Postgres) replacing JSON-file storage; orgs, SSO, audit exports
- Richer anomaly signals (price-drift, new-merchant, off-hours) + webhook/Slack alerts on freeze
- Multi-rail adapters: Google AP2, Stripe MPP, Mastercard AP4M — the policy layer shouldn't care which rail settles
- Mainnet settlement via the CDP facilitator (x402 v2 migration: **done**) — needs a funded wallet + CDP API key
- Framework hooks: CrewAI middleware, deeper Claude Code integration; gate a real Sentient SDLC pipeline step (LangChain: **done**, see `integrations/langchain.js`)

**Pricing:** self-host is free forever (this repo is the whole product). Hosted launch tiers — Desk $49/mo, Team $199/mo + 0.5% of governed API spend, Money Path at 10–25 bps on governed volume — are on the [pricing page](./site/pricing.html) behind the waitlist.

Apache-2.0 licensed — see `LICENSE`.
