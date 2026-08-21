# Research triage — Gemini + GPT deep-research round (2026-07-11)

Both outputs from `DEEP_RESEARCH_PROMPTS.md` were triaged against the honesty bar: **build it only if it runs locally, needs no partnership, and can be proven by an assertion in `npm run verify`.** Numbers were re-verified against primary sources before touching any public claim.

## Adopted and SHIPPED (this round → verify suite now 141 assertions)

| Research finding | What shipped |
|---|---|
| Gemini #1: "structured denial / self-correct rejection loop" — blocked agents should get a machine-readable reason they can act on | Every denial now carries `code` + `suggestion` through the whole stack: CLI prints `Fix:`, MCP blocked-tool errors tell the model how to self-correct, proxy 403s include `denial {code, suggestion}` |
| Gemini #5: ephemeral / time-bound grants | `npm run delegate -- 0.05 "flash" --ttl 10m` → `expiresAt` on the grant; expired links (and expired *ancestors*) block the branch, tested with a 1-second TTL |
| Gemini #7: simulation / dry-run endpoint | `--dry-run` on the CLI and `{"dryRun": true}` on the proxy — full pipeline verdict (`would_pay` / `would_pause_for_approval` / `would_block` + denial), proven side-effect-free (ledger length asserted unchanged) |
| Gemini #2: Slack/Telegram approvals | The honest local version: approval webhooks now carry one-click `approveUrl`/`denyUrl`, and `GET /api/approvals/:id/decide?decision=…` makes them work from chat. (A hosted bot with buttons = funded milestone.) |
| Gemini rails data: x402 169M payments / 590K buyers / 100K sellers in year one | **Independently re-verified against InfoQ (Jul 2026) before use**; site + pitch updated. The "$50M volume" figure was NOT in the InfoQ piece — kept only with its original April 2026 citation. |
| GPT: billion-dollar positioning ("trust and governance layer for autonomous AI agents") | Added to PITCH.md positioning as the long-game framing; spend governance stays the wedge |

## Validated (no code needed — we already do it)

- Gemini exec summary: "buyer-side governance is the underserved layer" / "HITL circuit breakers mandatory" / "bps-on-governed-volume over per-seat" — this is the existing thesis, now with citations to reuse.
- Gemini teardown: "show policy interception, not settlement, in the How-it-works" — our pipeline section already renders *Agent asks → Policy decides → Humans escalate → Pay + prove*.
- Hero headline options noted; current hero already leads with governance-before-payment. Candidates kept for A/B when deployed: "The kill switch for the agent economy" / "Stop bad spend before the signature."

## Rejected or deferred (with reasons)

| Item | Verdict |
|---|---|
| Gemini kill list (custody wallets, seller-side gateway, fiat ramps, agent runtime, appchain) | **Agreed — never build.** Matches our scope discipline exactly. |
| Stripe MPP client adapter | Deferred: needs a Stripe account to test honestly; can't be verified end-to-end in the local suite. Documented as the first multi-rail adapter post-funding. The *rail-adapter interface* refactor is the prep step. |
| Target/ABI + merchant-category allowlists | Our resources are catalog tools — tool scoping already IS this control at our layer. Revisit when arbitrary external x402 endpoints are callable. |
| Per-token scoping | Catalog is USDC-native; adding a token knob with nothing behind it would be a fake control. |
| Trust-score → auto-raised caps | Interesting but auto-*loosening* controls needs careful design; parked. |
| Fallback RPC routing | Testnet-mode nicety; not verifiable headlessly without funded wallets. |
| GPT layers 3–12 (identity/SSO, RBAC, marketplace, SIEM/SOC2, hosted cloud, multi-language SDKs) | Correct **long-term** map; every one needs hosted infra or org features — this is literally the "what funding buys" slide, not a local build. Logged in PITCH roadmap. |
| GPT "risk engine" (geo/time/amount anomaly scoring) | Partial overlap with what exists (burst detector + trust scores). Richer signals (price-drift, off-hours) already on the roadmap; geo signals need hosted context. |

## Unverified claims from the reports — NOT used anywhere public

- Skyfire "$19.5M (Seed, Apr 2026)" — conflicts with our previously verified $9.5M seed; Tracxn link was a search redirect. PITCH keeps $9.5M until a primary source confirms.
- "x402 V2 launched Dec 2025 with dynamic routing", "Coinbase Agentic Wallets Feb 11 2026 (TEE)", "Stripe MPP Mar 18 2026", "Brex acquired by Capital One" — plausible but unconfirmed by us; do not cite until checked against primary sources (GPT prompt task #1 covers the x402 v2 question properly).
- Payman "$770K ARR (GetLatka)" — estimate site; don't cite.

---

## Grok technical round (2026-07-11) — triage

Grok ran the full technical prompt (the one GPT stalled on). Findings recorded here as **Grok-sourced**: each load-bearing item gets a primary-source spot-check before it appears in any public claim or before code depends on it.

**Accepted as the build plan (pending spot-checks):**
1. **x402 v2 migration + real multi-chain settlement** — v2 (~Dec 11, 2025): `@x402/*` scoped packages, CAIP-2 network ids (`eip155:84532`), `PAYMENT-*` headers, multi-facilitator routing; v1 = security patches only. The unlock: **Coinbase CDP's facilitator serves Base, Base Sepolia, Polygon, Arbitrum (+Solana) with a self-serve API key** — no partnership. If the spot-check holds, several of our "adapter-roadmap" chains become genuinely live-wireable (~3–5 days). This is build item #1.
2. **LangGraph/LangChain as the one framework integration** (`spendveto-langgraph` tool wrapper) — Grok's reach argument matches 2026 consensus; verify npm numbers before building (~4 days).
3. **Top-5 security tests** (≤10 new assertions): TOCTOU race → denial; cross-chain nonce replay → 403; delegation cycle → rejection; frozen-custody invalid-sig → 403 (already covered — extend); tampered-HMAC webhook → rejected (~2 days).
4. **AP2 + ACP honest stubs** — both have real specs/repos (ap2-protocol.org / google-agentic-commerce/AP2; agenticcommerce.dev): mandate/checkout parsing + verification only, no settlement, behind the existing `rails/` slots (~2 days).

**Disputed-claims ledger (Gemini vs Grok):**
- Skyfire funding: Grok confirms **$9.5M** — matches our original verification; Gemini's "$19.5M (Apr 2026)" now contradicted twice → stays out of all materials.
- Stripe MPP launch **Mar 18, 2026**; Coinbase Agentic Wallets **Feb 11, 2026**; x402 v2 **Dec 2025** — now double-sourced (Gemini + Grok agree) but still cite-with-link only after a primary spot-check.

**Distribution intel (task 6c):** engage x402-foundation GitHub/Discord, @PayAINetwork, CoinbaseDev, Merit-Systems/awesome-x402, Cloudflare Agents + LangChain/CrewAI communities at launch — folded into the Show HN plan.

---

## GPT deep-research round #3 (2026-07-12) — gateway verdict + feature gaps + competitive re-scan

**Task 1 (PSP/gateway vs. governance layer): independently CONFIRMS the standing decision.** Sourced FinCEN/state-MTL licensing timelines, EU/Singapore/Mauritius EMI licensing costs, and the Polygon–Coinme acquisition as evidence a solo founder cannot absorb custody licensing. No new information — this is a second, independently-derived verdict agreeing with the one already reasoned through in this project. Filed, not re-litigated.

**Task 2 (missing features) — triaged:**

| GPT finding | Verdict | What shipped |
|---|---|---|
| "Concurrent/global budget enforcement — 20 agents can each pass a budget check simultaneously before any commits spend" | **Upgraded from feature idea to confirmed bug.** Read `client/policy.js`/`pay.js`/`proxy/server.js` before trusting the claim: `checkPolicy` reads spend over HTTP and the debit+ledger-append happens several `await`s later with no lock — a genuine TOCTOU race, not a hypothetical. | `withWalletLock` in `client/pay.js` serializes the decide-and-commit unit per wallet, covers `governedCall` and `/proxy/llm`. Proof: 6 concurrent calls against a cap sized for exactly one → exactly one wins, every run. |
| "Client SDK (npm/PyPI)" | Confirmed real gap (also independently our own top pick before this prompt existed). | `sdk/` — dependency-free `SpendVeto` class, throws `SpendVetoDenialError{code, suggestion}`. |
| "Agent-framework integrations (LangChain plugin)" | Confirmed; also closes a Grok round-2 item accepted-but-never-built ("LangGraph/LangChain as the one framework integration," above). | `integrations/langchain.js` — duck-typed tool objects, zero hard `@langchain/core` dependency. |
| "Prometheus-style metrics endpoint" | Small, real, no citation given but standard practice — agreed. | `GET /metrics`, text exposition format, paid/blocked/failed + per-category. |
| "Hosted sandbox / demo environment" | Real gap, but it's a deployment decision (a public server, a domain, ongoing cost, abuse-surface) — not a local code change. Left for the user to trigger, same as publish/deploy/Show HN. | Not built this round. |

**Task 3 (competitive re-scan) — GPT's own scan was incomplete; spot-checked via WebSearch before trusting it:**

- **NewCore** — confirmed real: $66M seed (Cyberstarts, Index Ventures, Evolution Equity), $300M valuation, TechCrunch-sourced. But it's an agent **identity/authentication** platform ("split-key" credentials, agent lifecycle/revocation) — adjacent, not a spend-governance competitor. GPT's framing ("a direct sign that enterprises will need agent governance") is fair; "direct competitor" would not be.
- **TealTiger / AgentGuard — GPT conflated two different things and missed the bigger story.** Spot-check found: (1) **TealTiger** (`agentguard-ai/tealtiger`, npm, Apache 2.0) is real and closer to us than GPT's summary suggested — deterministic runtime policy enforcement, cost tracking, cryptographic governance receipts (Merkle + RFC 3161), v1.3.0 as of May 2026. It reads as a pure governance/policy SDK — no evidence it settles payment itself, which is where SpendVeto differs (governs *and* moves the money via the proxy/rails layer). (2) Separately, **Microsoft open-sourced its own "Agent Governance Toolkit" in April 2026** (`microsoft/agent-governance-toolkit`: policy enforcement, zero-trust identity, execution sandboxing, published LangGraph integration, claims full OWASP Agentic Top 10 coverage) — a materially bigger competitive fact than anything GPT's report surfaced as its own line item. Worth tracking; not an immediate pivot trigger.
- **Stripe x402 / Tempo / MPP — dates sharpened.** x402 launched Feb 10, 2026 (Coinbase, open protocol; Stripe added support the same day). Stripe + Tempo's "Machine Payments Protocol" launched Mar 18, 2026 — sessions with a pre-authorized spending limit, streaming micropayments. This is a **rail-level** primitive (baked into one company's payment rail), not a cross-rail, cross-agent governance product — if anything it reinforces the "governance sits above rails, including Stripe's" position rather than threatening it. `rails/index.js` already carries `stripe-mpp` as a declared roadmap slot.

No item in this round changed the standing strategic position. The one genuine surprise was the concurrency bug — the rest confirmed decisions already made.
