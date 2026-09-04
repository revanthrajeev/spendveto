# Changelog

Every feature listed here is exercised by the end-to-end suite (`npm run verify`) — the suite grew from 33 assertions at the first public cut to **114** at v0.7.0. If a claim isn't an assertion, it doesn't ship.

## 0.22.0 — 2026-09-04

The protocol-drift release. Two things changed underneath this codebase between v0.21 and now, both found by asking the public x402 facilitator what it actually supports rather than by reading an announcement: it settles a **new network** (Algorand, fee sponsored by the facilitator itself), and it settles **two new schemes** on base-sepolia — `upto` and `batch-settlement` — beside `exact`.

- **`upto`-scheme governance** (`server/upto.js`) — the scheme exists for usage-based billing inside one request: the buyer signs an authorization for a **maximum** and the seller decides afterwards what to actually charge. Every control here until now governed a known price, and treating an `upto` authorization like an `exact` payment fails three ways. Policy now decides on the **ceiling**, not the quote (a "$2" call permitting $50 is a $50 decision). An open authorization **holds** its ceiling against the hourly budget until it resolves — card pre-auth semantics — because otherwise an agent can sign ten $50 authorizations under a $60/hour cap and break nothing, since nothing has settled. Settlement releases the unused headroom, and only the settled amount enters the spend record. The three rules the scheme places on the *seller* — settle at most once, never above the authorized maximum, never after the deadline — are re-checked on the buyer's side, because the buyer is the party who pays for the facilitator being wrong: `upto_over_settlement`, `upto_already_settled`, `upto_expired`. `POST /api/upto/authorize` → `/settle` → `/void`, with `GET /api/upto` and `GET /api/upto/holds/:address`.
- **Arc** (`eip155:5042002`) — Circle's USDC-native L1, registered as an EVM chain because it is one, but it inverts an assumption the rest of the registry shares: USDC is the **gas token**, not an ERC-20 on top of one. The registered address is the ERC-20 interface over that native balance — 6 decimals over an 18-decimal native unit — which is the view an x402 `AssetAmount` is denominated in. Chain id verified live against its RPC, not copied from a doc.
- **Algorand** (`algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe`) — registered as **governed-but-not-signable**, the honesty rule applied to a chain. The public facilitator settles it and sponsors the fee, but no `@x402/algorand` client scheme package is published on npm, so this instance can govern an Algorand payment (chain allowlists, delegated chain scope, per-chain ledger) and cannot sign one. It has no entry in the payout map, so it can never enter `liveSettlementChains` by accident, and `schemeFor` throws for it rather than quietly signing an Algorand payment with the EVM scheme.
- Fixed: `CONTROLS.md` had its "Known gaps" section buried in the middle of the control table (rows 27+ appeared after it); the gaps now close the document. The site's static chain-picker fallback listed XRPL as `live` while the registry called it `ready` — the registry is right, since XRPL mainnet settlement is disabled unless an operator explicitly opts in.
- Verify: 291 (+11).

## 0.21.0 — 2026-08-21

The competitor-scan release. A fresh market sweep (Fireblocks joining the x402 Foundation with a *request integrity and spend governance* extension; AWS Bedrock AgentCore Payments previewing spend limits; Cloudflare announcing Account Wallets with spending controls; ACP's Delegated Payments Spec shipping Shared Payment Tokens; a Cloud Security Alliance survey putting 65% of agent-running enterprises at one or more agent incidents in twelve months) surfaced four gaps a per-call cap structurally cannot close. All four are local, deterministic, and dependency-free.

- **Request integrity** (`server/integrity.js`) — the first control here that answers *is this the spend I allowed?* rather than *is this spend allowed?*. Policy runs on a described request and something else executes; in between, a compromised or buggy agent can change the payload while payer, price and approval all still match, and every amount-based control passes. Canonical recursive sorted-key SHA-256 of the request (key order can't change the answer), signed by the same key that signs receipts and verdicts; `POST /api/integrity/bind` → `POST /api/integrity/verify`. Single-use (`binding_consumed`), TTL-bounded (`binding_expired`), agent-scoped (`binding_agent_mismatch`), and a swapped payload fails `request_integrity_mismatch`. The buyer-side counterpart to the extension Fireblocks is contributing to x402.
- **ACP shared-payment-token scope** (`server/acp.js`, `POST /api/acp/checkout`) — an SPT is minted for an amount, a merchant and a window; the merchant validates the token, and nobody validates the shopping. Same failure shape as the AP2 intent→cart drift, so the same treatment: `spt_merchant_drift`, `session_exceeds_spt`, `spt_expired`, `spt_category_drift`, `session_total_mismatch` (arithmetic checked *before* the ceiling), `spt_session_mismatch`, and `spt_currency_mismatch` — a ceiling in one currency is never silently compared against a charge in another. An allowed session leaves bound to its own bytes; a denied one gets no binding.
- **Dispute evidence packs** (`server/disputes.js`, `GET /api/disputes/:entryHash/evidence`) — agent purchases produce no device fingerprint, IP or browsing session, so they lose chargebacks by default; Visa TAP, Mastercard Agent Pay, AP2 and Amex's agent protections all describe authorization but not the after-the-fact defence file. Nothing new is captured — the pack assembles the ledger entry pinned between its neighbouring hashes, the policy hash in force with drift **disclosed**, the human approval and the signed consents, then signs the bundle over its own digest (`pack_tampered` on any edit). Every pack carries a `doesNotEstablish` list inside the artifact: it never implies delivery, satisfaction, or that the policy was a good one.
- **OpenTelemetry decision spans** (`server/otel.js`, `GET /api/otel/spans`) — OTLP/HTTP JSON, no OpenTelemetry SDK (a supply-chain surface the component whose job is refusing to trust things doesn't need). Adopts an inbound W3C `traceparent` so a refusal appears under the agent run that caused it; span ids derive from the entry hash so re-export doesn't duplicate; a malformed header degrades to a standalone trace rather than breaking the decision surface. **Blocked is status OK, not ERROR** — the gate did its job, and colouring refusals red trains a team to ignore the colour that matters.
- Verify: 267 (+30).

## 0.20.0 — 2026-07-17

- **Facilitator-adaptive multichain live settlement.** The testnet gate no longer hardcodes Base Sepolia: at boot it calls the configured facilitator's `GET /supported` and registers **every registry chain the facilitator names** — per-chain `ExactEvmScheme` registration and one accepts entry per live chain in every 402, priced as explicit atomic-USDC `AssetAmount`s from the registry's canonical contracts (the `"$0.01"` shorthand needs the package's default-asset table, which doesn't cover ethereum/optimism/avalanche). Falls back to base-sepolia if `/supported` is unreachable. `/api/chains` now reports per-chain `settlement: "live" | "ready" | "simulated"` plus the instance's `liveSettlementChains`. The client rail generalized to `x402-live` (was `x402-base-sepolia`): it signs for any registry chain and lets the protocol — not an artificial throw — decide. Chain registry statuses: the six non-sepolia chains are now `ready` (full v2 wiring; the facilitator's supported list + a funded wallet flips them live, zero code changes), rendered as READY (not SIM) on the site chain band, signup pills, and console chain cards. 3 assertions via a mock facilitator: all-seven advertised → all seven live with seven CAIP-2 payment options in one real 402; one advertised → exactly one live + six ready.
- Verify: 188.

## 0.19.0 — 2026-07-17

The evidence release — driven by a fresh deep-research round (`launch/PERPLEXITY_RESEARCH_2026.md` + the resulting report): what enterprise buyers ask for that rails don't provide is *pre-decision evidence*, and what the ecosystem's rails standardize is mandates. Four features, all locally verified; the research's "don't build" list (hosted SaaS, ML anomaly models, own custody, deep billing engine, early SOC 2 certification) matches what this repo already deferred.

- **Structured decision events + SIEM export.** `server/events.js` reshapes the hash-chained ledger into one stable schema (`spendveto.decision.v1`): agent, decision, amount, payee, reason, receipt id, policy version, and the chain-of-custody hashes. `GET /api/events` (filterable JSON) and `GET /api/events/export` (JSON Lines — one event per line, straight into Splunk/Datadog/Elastic/`jq`). Read-only over the ledger.
- **Policy versioning in the audit trail.** `policyHash()` (`client/policy.js`) — recursive sorted-key SHA-256 of the effective policy — is stamped onto every gate decision (paid and blocked). An auditor can answer "which policy was in force when this spend was allowed?" from the ledger alone. The enterprise record-keeping detail governance checklists (EU AI Act record-keeping, NIST AI RMF) actually name.
- **AP2-style mandate evaluation with signed verdicts.** `POST /api/ap2/evaluate` runs the full policy pipeline against an AP2-shaped mandate (agent, amount, payee, category, expiry) and returns the verdict ECDSA-signed by the server's receipt key — portable evidence anyone can verify. Expired mandates are refused (`mandate_expired`). AP2 *settlement* remains an honest roadmap rail slot; this is the governance half, real today.
- **Governed-billing sink.** `server/billing.js` — after a settlement, one normalized `spendveto.usage.v1` event (transaction id = receipt id, wallet, tool, amount, chain) is pushed to `policy.billingWebhookUrl` with optional HMAC signing; same fire-and-forget contract as alerts. SpendVeto decides pre-payment; Lago/Orb/Metronome-style platforms invoice post-usage — the division of labor the research recommended instead of building a billing engine.
- **OpenAI Agents SDK adapter.** `integrations/openai-agents.js` — dependency-free `{name, description, parameters, execute}` tools (the Agents SDK `tool()` shape) over the same governed proxy path as the LangChain adapter, catalog-live, structured denials included.
- **CONTROLS.md** — the control inventory mapped to EU AI Act / NIST AI RMF expectations, each row citing the verify assertion that exercises it. A self-assessment, explicitly not a certification.
- Verify: 185 (+9: events schema, JSONL export, policyHash changes with policy, AP2 signed allow / per_call_cap deny / mandate_expired, billing usage event by receipt id, adapter shape, adapter governed call).

## 0.18.0 — 2026-07-17

Two roadmap items from the pitch's funded-milestone list, built to the point they're testable today (the rest of that list — hosted Postgres, multi-tenant SSO, mainnet, full marketplace — genuinely needs infra/funds this environment doesn't have, and stays honestly deferred rather than faked):

- **Cross-org trust graph + counterparty credit bureau (roadmap: "scale the per-wallet score into a cross-organizational agent credit bureau and trust graph").** The flat per-wallet governance score already existed; `server/trust.js` scales it out. `/api/trust/graph` returns the whole forest — every wallet a scored node, every delegation a directed edge, every delegation root an "org" whose blended, paid-volume-weighted reputation aggregates its entire sub-tree (answers "how well-governed is this whole fleet?"). `/api/trust/payee/:address` is the counterparty bureau: the reputation of a *recipient*, aggregated across every wallet that has ever paid it (distinct payers, paid/blocked counts, total volume, and the average governance grade of its payers) — the cross-org signal a single-wallet score can't see, since payees are shared across organizations even when wallets aren't. Paid **and** blocked ledger entries now record `payTo`, so the bureau sees both settled and attempted-but-refused payments. The existing `/api/trust/:address` now shares one score definition with the graph (DRY). 3 assertions.
- **Advanced anomaly models (roadmap: "richer anomaly detection on top of the baseline burst-rate detector").** The burst detector was a single reflex — rate. `analyzeAnomalies()` in `server/anomaly.js` adds a read-side panel of deterministic behavioural signals over a wallet's own ledger: block-rate spike (a probing/misconfigured loop the timer misses), novel payee (money to a never-before-paid recipient), category drift (spend in a category the wallet has never touched), and amount outlier (a paid amount far above the wallet's own median). Each returns a bounded severity and a plain-English reason; the composite advisory `level` (none/low/elevated/high) is surfaced at `/api/anomaly/:address`. Nothing here is a black box or a network call — every signal is a pure function of the ledger, so it's fully reproducible. Advisory only; the burst freeze remains the sole auto-action. 2 assertions.
- **SOC 2 readiness mapping (`SOC2_READINESS.md`).** An honest controls-to-evidence map for the roadmap's SOC 2 item — maps the Trust Services Criteria a security audit would examine to the specific enforced controls and their verify assertions, and states plainly what is *not* yet true (no audit performed, no certification). A readiness artifact for a design partner's security team, not a certification claim.
- Verify: 176.

## 0.17.0 — 2026-07-17

- **API-key auth + roles on the admin surface (board-review issue #10).** Closes the review's disqualifying "platform security" finding: the management API was previously reachable by anyone who could hit the port. `server/auth.js` adds bearer keys with roles (viewer < approver < admin) and a `requireAuth(minRole)` middleware now guarding 12 admin-surface endpoints (policy PUT/apply, shadow PUT/DELETE, freezes, delegations, catalog registration, top-ups, approval decisions). Same "open until configured" pattern the proxy uses for agent identities — zero keys = open mode (zero-setup demos and this suite unaffected); the first key flips the server to auth-required. First key is minted on the trusted host with `npm run apikey [role] [label]`, never over the API (no privilege bootstrap from an unauthenticated request). Public read endpoints (`/api/stats` etc.) stay open so the marketing site keeps working. 5 assertions: unauth write → 401, admin write → 200, viewer write → 403, reads stay open, keys removed → open mode.
- **Deferred honestly: Postgres store (issue #9).** The board review's other P1 was a `Store` interface + Postgres adapter. It's not in this release because this environment has no Postgres to test against, and shipping an untested on-disk-vs-database abstraction would violate the repo's one rule (no claim without a passing assertion). It's the right next build once a real Postgres is available to verify both backends.
- Verify: 171.

## 0.16.0 — 2026-07-17

Two features driven by fresh market research (both surfaced repeatedly as gaps in 2026 agentic-payments guidance and the board review):

- **Payee allowlisting.** Pin which recipient addresses an agent may pay, enforced server-side at the gate — the most-cited guardrail in current agentic-payments guidance ("even if the agent is compromised or prompt-injected, it can only reach addresses on the list"). A global `allowedPayees` policy plus a per-delegation `allowedPayees` scope that cascades through the budget tree exactly like tool/chain scope (`client/policy.js`, `server/delegations.js`, marketplace tools now carry an optional `payTo`). New codes: `payee_not_allowed`, `payee_scope`. Three assertions: off-list payee blocked at the gate, same payment settles once allowlisted, payee-scoped sub-agent blocked from an out-of-scope recipient.
- **Shadow mode.** Set a candidate policy that runs alongside the live one *without enforcing* (`server/shadow.js`; `GET/PUT/DELETE /api/shadow`). Every real decision at the gate is also evaluated against the candidate — same delegations/freezes/spend history — and the report says how much spend it would have additionally blocked or newly allowed. Measure a policy change against live traffic before promoting it. `checkPolicy` gained an optional policy-override param to make this a single source of truth rather than a parallel evaluator. Three assertions: live call still settles, report shows the strict candidate would have blocked it, clearing ends the experiment.
- Verify: 166.

## 0.15.0 — 2026-07-17

Board-review round (`launch/BOARD_REVIEW.md`): a full teardown against the funded competitive landscape (Catena Labs' $30M a16z Series A + bank-charter filing) drove a licensing switch, an honesty pass, and the two deepest correctness items.

- **Server-authoritative enforcement (issue #8).** The single biggest architectural gap the review found: in self-custody mode, policy ran only in the *caller's* library, so a key-holding agent with a modified client could push a validly-signed over-budget payment straight to the settlement gate, which previously checked only freeze + nonce + signature + balance. The gate now runs the **same governance pipeline server-side** (`server/simulate.js` → `checkPolicy`), and above-threshold spends must be backed by a real, **single-use** approval record (`findApprovableFor`/`consumeApproval` in `server/approvals.js`). Governance is now enforced by the party holding the money. Proven by an assertion that reproduces the bypass and confirms the gate refuses it, plus one for the approval requirement.
- **Hash-chained audit ledger (issue #11).** Every ledger entry now carries `prevHash` + `entryHash` (SHA-256 over the prior hash + canonical entry); `GET /api/ledger/verify-chain` walks the chain and returns `brokenAt` for the first tampered row. Tested by editing a settled amount on disk and confirming detection at that exact index.
- **Relicensed MIT → Apache-2.0** (explicit patent grant for payments infra; done now while there are zero external contributors). LICENSE + NOTICE + every reference across README/PITCH/site/SDK.
- **Honesty pass:** competition section updated with Catena's raise (removed "buyer side is nearly empty"); marketplace "two-sided flywheel" downgraded to the supply-side primitive it is; trust score labeled per-instance wallet health with the cross-org trust graph called roadmap; "private beta" language removed sitewide (it's a waitlist, not a live product); a stale "138 verified behaviors" fixed.
- **Distribution prep:** Dockerfile + docker-compose + .dockerignore; SDK readied for npm (types, `files` allowlist, repo metadata, README) — `npm pack` clean.
- Verify: 160.

## 0.14.0 — 2026-07-12

Security-test round, closing the last two items from GPT's "top-5 security tests" backlog (`launch/RESEARCH_TRIAGE.md`) that weren't already covered — TOCTOU races, cross-chain replay, and delegation cycles were already tested; these two weren't:

- **Tampered-webhook detection**: a new assertion proves the HMAC signature on webhook deliveries actually catches tampering — computes the signature a receiver would derive from a mutated payload and confirms it no longer matches what was delivered, rather than just asserting a valid signature exists on the untampered case.
- **Freeze-before-signature ordering**: a new assertion proves a frozen wallet is rejected for being frozen even when the request also carries a forged signature — confirming the freeze check runs first in the pipeline rather than only mattering once a signature would otherwise have passed.
- **`docs/safe-allowance.md` + `rails/safe-allowance.js`**: real (non-stub) implementation of the Safe{Wallet} AllowanceModule off-chain signing math (`transferHash`/`domainSeparator` against the canonical typehashes), gated behind config and honestly refusing until a funded testnet Safe exists to verify the on-chain call path against. `scripts/deploy-safe-allowance.mjs` is ready to run the moment the existing testnet wallet has Base Sepolia ETH (currently blocked on a faucet's human-verification step, confirmed via a live RPC balance check, not assumed).
- Verify: 155.

## 0.13.0 — 2026-07-12

Research-driven correctness + distribution round, triaged from a GPT deep-research pass (`launch/RESEARCH_TRIAGE.md`):

- **Fixed a real concurrency race**: `checkPolicy` reads spend over HTTP, and the debit+ledger-append happened several `await`s later with no lock — two concurrent calls for the same wallet could both read the same "spent so far" snapshot and both pass a cap that only had room for one (the "20 agents each pass a budget check simultaneously" failure mode). `withWalletLock` (`client/pay.js`) now serializes the whole decide-and-commit unit per wallet, covering both `governedCall` (CLI/MCP/`/proxy/call`) and `/proxy/llm`. Proven with 6 concurrent calls against a cap sized for exactly one — verified exactly one wins, every time.
- **`sdk/`**: a dependency-free npm client (`SpendVeto` class — `pay()`, `dryRun()`, `chat()`, `registerAgent()`, throws `SpendVetoDenialError` with `code`/`suggestion`) — the "npm import instead of curl" surface.
- **`integrations/langchain.js`**: catalog tools exposed as duck-typed LangChain-shaped `{ name, description, func }` objects, zero hard dependency on `@langchain/core`. Denials throw with the structured code embedded so an agent's next reasoning step can self-correct.
- **`GET /metrics`**: Prometheus text-exposition scrape target (paid/blocked/failed counters, frozen-wallet gauge, per-category breakdown) alongside the existing JSON `/api/stats`.
- Verify: 151.

## 0.12.0 — 2026-07-12

Console completeness: **Agents & Market** page (mint agent identity tokens, list marketplace tools — from forms, not curl) and **Report** page (`GET /api/report` — headline, spend by category/chain, top block reasons for a rolling window). Console now 10 pages. Fixed an order-dependent assertion in the verify suite (comparing a stale snapshot to live state) before it could flake in CI. verify: 141.

## 0.11.0 — 2026-07-11

Competitor-parity round (research-mapped): **agent identities** (bearer tokens bound to wallets; proxy auth switches on with the first registered identity), **hourly category caps**, **N-approver approvals** (deny instant, approve needs quorum), **trading-hours windows** (UTC, wrap-around). Verify: 138.

## 0.10.0 — 2026-07-11

- **Tool marketplace**: `POST /api/catalog/tools` — anyone lists a paid endpoint behind the same 402 gate (optional `upstreamUrl` forwarding); CLI resolves marketplace tools from the live catalog.
- **Recurring allowances**: `--every 7d` on grants — caps apply to a rolling window and re-fill on their own (tested with a 2s window).
- **Simulated top-ups**: `POST /api/balances/topup` (simulate mode only).

## 0.9.0 — 2026-07-11

- **The API-spend rail** (`POST /proxy/llm`): auth/capture governance for LLM/API dollars — estimate up front, full pipeline against the estimate (fails closed, upstream never called), actual metered cost into the shared ledger's `api` bucket. Real Anthropic upstream with a key; honestly-simulated without.
- PITCH: dual-engine model (SaaS ARR on API spend today + bps on governed volume at scale) and the $1B+ take-rate scenario table.

## 0.8.0 — 2026-07-11

- **x402 v2 migration**: `@x402/*` scoped packages, CAIP-2 network ids on all 7 chains, `x402ResourceServer` + `HTTPFacilitatorClient`, `SPENDVETO_FACILITATOR_URL` override for the CDP facilitator; deprecated v1 packages removed.
- **Idempotency hardening**: store scoped to key+tool+child+chain (poisoning-proof); consumed-authorization replay and delegation-cycle-termination assertions.

## 0.7.0 — 2026-07-11

The "one API, any rail" release: multichain governance, the console, the rails layer, and the research-driven agent-UX features.

**Multichain governance (not a logo strip)**
- The settlement chain rides *inside* every signed payment authorization — a payment signed for Polygon is cryptographically rejected on Arbitrum (tested).
- Per-`(wallet, chain)` balances; 7 chains registered with canonical USDC contracts + RPCs (`/api/chains`).
- Policy-level chain allowlists (`allowedChains`), chain-scoped delegation (`--chains`, ancestors bind subtrees), `--chain=` on the CLI, `chain` on proxy intents, per-chain analytics, chain column in the CSV export.

**Agent-experience features (from the July 2026 deep-research round — see `launch/RESEARCH_TRIAGE.md`)**
- **Self-correcting denials**: every block carries a machine-readable `code` + concrete `suggestion` through CLI (`Fix:` line), MCP tool errors, and proxy 403 bodies — blocked agents adjust instead of retry-looping.
- **Time-boxed budgets**: `--ttl 90|10m|2h` on any grant; expired links (and expired *ancestors*) kill the branch.
- **Dry runs**: `--dry-run` / `{"dryRun":true}` evaluates the whole pipeline with zero side effects (ledger asserted unchanged).
- **One-click approvals**: webhook alerts carry `approveUrl`/`denyUrl`; `GET /api/approvals/:id/decide` works from chat.

**The Console** — the dashboard rebuilt as an 8-page control surface (overview, approvals, budgets, ledger, chains, analytics, trust, policy) with real write controls: create wallet+grant in one call (`POST /api/delegations/wallet`), live policy editing (`PUT /api/policy`), policy-pack apply (`POST /api/policy/apply`), freeze/unfreeze/revoke/approve/deny everywhere, ledger filters + CSV.

**Rails adapter layer (`rails/`)** — one `pay({ tool, account, chain, baseUrl })` contract; `x402-simulate` and `x402-base-sepolia` live behind it, Google AP2 / OpenAI ACP / Stripe MPP as declared slots that refuse honestly. `GET /api/rails`; the proxy advertises its rails in `/proxy/health`.

**Gateway-grade hardening**
- **Idempotency keys** on the proxy: a retried intent replays the stored response — an agent can never pay twice for one intent (tested: one ledger entry).
- **HMAC-signed webhooks**: set `alertSigningSecret` and every alert carries `X-SpendVeto-Signature` for receiver-side verification.
- **Receipts API**: `receiptId` lands in the ledger; `GET /api/receipts/:id` + `POST /api/receipts/verify` (tampered receipts fail — tested).

**Site** — Reown-style self-contained wallet modal (EIP-6963, INSTALLED badges, All-Wallets search grid — no SDK, no cloud project id), "Launch App" sign-in card, chain band + FAQ on the landing page, market numbers re-verified against primary sources (x402: 169M payments / 590K buyers in year one, InfoQ Jul 2026).

## 0.6.0 — 2026-07-10

- **Enforcement proxy** (`npm run proxy`, :8404): keyless agents POST spending intents; custody signs only after the full pipeline passes — SpendVeto on the money path.
- **Trust scores** (`GET /api/trust/:address`): governance history → 0–100 score + grade; a runaway wallet grades F at 0.
- **Policy packs**: `cautious` / `standard` / `production` presets, `npm run policy -- apply <pack>`.
- Sign-up/waitlist + wallet sign-in pages; durable waitlist API (position returned, emails never exposed); 7-chain registry.

## 0.4.0 – 0.5.0 — 2026-07-09/10

- **Kill switch + runaway detection**: manual per-wallet freeze + automatic burst freeze (default 10 attempts/10s); frozen wallets refused even with correctly signed payments (403).
- **n-level budget delegation**: caps cascade — every ancestor's cap binds its whole subtree; revoking a link kills the branch. Tool scoping (`--tools`).
- **ECDSA-signed receipts**, CSV audit export, per-tool/per-wallet analytics, webhook alerts, blocked-spend as the headline metric.
- Deploy-ready marketing site (Three.js hero, fully static, self-contained) + investor deck page + docs page.

## 0.1.0 – 0.3.0 — 2026-07-08/09

- The "smallest real test": x402 payments (real `x402-express`/`x402-fetch` on Base Sepolia via the public facilitator) gating a catalog of three Claude-backed tools at three prices.
- Zero-setup **simulate mode** with real secp256k1/ECDSA signing, nonce replay protection, and local settlement — forged signatures rejected (tested).
- Policy engine (per-call / hourly / rate caps), human approvals that **fail closed** on timeout, governance dashboard, MCP server exposing the governed catalog to any MCP client.
