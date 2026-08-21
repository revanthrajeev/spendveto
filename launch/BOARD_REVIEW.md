# SpendVeto — Board-Level Teardown & Company Plan (2026-07-12)

Method: full repo read (every subsystem inspected, not skimmed), the July-2026
verified market facts already in `RESEARCH_TRIAGE.md`, plus two fresh searches
(card networks; Catena/Payman). Claims from fresh searches are cited inline;
anything not independently confirmed is marked UNVERIFIED. This document is
deliberately harsh where the repo's own materials are soft.

The single most important new fact: **Catena Labs closed a $30M Series A in
May 2026 (a16z crypto + Acrew, $48M total) explicitly building "the governance
layer for AI agent transactions" — spending limits, approved recipients,
deterministic policies, audit trails — and has filed for a national trust bank
charter with the OCC** (The Block, May 2026). The window PITCH.md calls
"nearly empty" now contains a funded, a16z-backed company saying SpendVeto's
exact sentences. The differentiation that remains is real but must be stated
precisely: **Catena is becoming the regulated custodial bank for agents;
SpendVeto can be the open-source, self-hostable, MCP-native policy engine that
works with any rail and any custodian — the GitLab to their bank.** That
position is still open. It will not stay open long.

---

## PHASE 1 — Deep product review (ratings, 1–10)

| Subsystem | Score | Why |
|---|---|---|
| Architecture | 6 | Correct layering (governance above a real rail-adapter registry) and small, readable modules. But: single-process, JSON-file persistence, in-memory nonces/idempotency/locks, and modules call each other over localhost HTTP (the policy engine `fetch`es its own server) — none of it survives a second node. |
| Developer experience | 7 | Zero-setup simulate mode with real ECDSA is top-decile; structured denials (`code` + `suggestion`) are genuinely novel DX. But nothing is published: no npm package, no Docker image, no hosted sandbox, JS-only. |
| Security — payment path | 7 | Single-use TTL nonces, chain-inside-the-signed-message, fail-closed approvals, defense-in-depth freeze at the gate, HMAC'd webhooks, signed receipts, idempotency keys, per-wallet locking — all covered by the 155-assertion suite. Unusually disciplined. |
| Security — platform | 2 | **The management API is completely unauthenticated.** Anyone who can reach :8402 can rewrite policy, unfreeze wallets, mint delegations, and read the ledger. The "audit trail" is a mutable JSON file editable with vim. Proxy keys sit in plaintext JSON. Fine for localhost demos; disqualifying for anything real. |
| Enforcement model | 4 | **The deepest architectural finding: in self-custody mode, governance is cooperative, not mandatory.** Policy runs in the *caller's* library; the settlement gate re-checks only freeze + nonce + signature + balance — not budgets, scopes, or approvals. An agent holding its own key with a modified client bypasses everything except the kill switch. Only the enforcement proxy (custody mode) makes governance binding. PITCH.md half-admits this; the architecture must make it explicit and fix it. |
| Enterprise readiness | 2 | No orgs, no multi-tenancy, no SSO/RBAC, no real database, no HA, no compliance posture. Honestly labeled, but a 2 is a 2. |
| Documentation | 6 | Good single-page docs + README with real commands; verified-claims discipline. Missing: OpenAPI spec, integration guides, runbooks. |
| Scalability | 2 | Every policy check fetches and scans the **entire ledger** in JS (O(history) per call); JSON files rewritten whole on every write; approvals poll at 800ms. Falls over around tens of thousands of entries. |
| Code quality | 8 | Small, consistent, dependency-light; comments explain *why*; 155 e2e assertions on a prototype is exceptional. Docked for HTTP-self-calls, no types, e2e-only testing. |
| Dashboard / UI | 6 | Ten pages covering real workflows (approve/deny, freeze, budget tree, report). Vanilla JS, polling, single-user, unauthenticated. |
| Analytics | 5 | Stats, rollups, 7-day report, Prometheus `/metrics`. No retention, no forecasting, anomaly = burst counter only. |
| Payments | 6 | Real x402 v2 on Base Sepolia; simulate mode is a legitimately clever adoption device. No mainnet, one facilitator, 6 of 7 chains simulate-only, no fiat. |
| Policy engine | 7 | Breadth beats every OSS competitor: per-call/hourly/rate caps, n-level cascading budgets, tool+chain scoping, TTL grants, rolling allowances, category caps, trading hours, N-approver rules, structured denials. Missing: per-agent policy documents (one global policy + delegations), versioning/rollback/diff, shadow mode, server-authoritative evaluation. |
| MCP integration | 7 | Real stdio server; governance-in-band ("the model can't opt out") is the single best demo and distribution asset. Not listed in any registry; no remote-MCP/OAuth story. |
| SDK | 6 | Clean, dependency-free, typed errors. Unpublished, JS-only, no `.d.ts`, no retries. |
| CLI | 7 | Good UX, prints `Fix:` lines from structured denials. Not installable (`npx spendveto` doesn't exist). |
| Proxy | 6 | Custody + idempotency + agent identities + sensible open-mode default. Keys in JSON, no KMS, no rate limiting, no TLS story. |
| Marketplace | 3 | An API endpoint with a form, not a marketplace: no discovery, payouts, reputation, or moderation — and the catalog is 3 demo tools. PITCH.md's "two-sided flywheel" is the repo's one real overclaim. |
| Trust scores | 4 | Deterministic score from a single instance's ledger. Useful UI; as "an agent credit file," an overclaim — there is no network. Seed of a moat, currently decorative. |
| API surface | 6 | Everything is reachable over HTTP. Unversioned, unauthenticated, no OpenAPI. |
| Pricing | 6 | Sane anchors (SaaS base + bps on governed volume). Zero validation; the "0.5% of governed API spend" line will meet resistance (buyers hate take-rates on cost passthrough, and Helicone/Langfuse anchor at free). |
| OSS strategy | 4 | "MIT, open source" is declared everywhere — but the repo is **unpublished**. Zero stars, zero installs, zero contributors. No open-core line decided. Strategy exists only as intention. |
| Go-to-market | 2 | Every asset is drafted (Show HN, demo script, deployable site, listing blurbs) and **none of it has shipped**. The waitlist backend runs on localhost. GTM is currently a folder, not a motion. |
| Investor attractiveness | 6 | Hot category (Catena's raise just priced it), a genuinely working verified product, and a founder with a rare proof (1.5M organic downloads = distribution skill). Against: solo, zero traction, contested wedge. |
| Competitive moat | 3 | Today: none — three good engineers replicate the feature set in a quarter. The moat must be *built* from distribution, standard-setting, and data. The current positioning (OSS + MCP-native + rail-neutral + unified spend) is a moat *plan*, and a good one. |

---

## PHASE 2 — Market (verified July 2026 unless noted)

**Rails (all seller/checkout-side or settlement-level — none do buyer-side policy):**
- **x402** — 169M payments, 590k buyers, 100k sellers in year one (InfoQ, Jul 2026). v2 shipped Dec 2025 (CAIP-2, multi-facilitator). Cloudflare x402 Monetization Gateway waitlist opened Jul 1, 2026.
- **Stripe MPP** (Mar 18, 2026) — session spending limits + streaming micropayments. A rail primitive inside one company's rail.
- **Google AP2** — mandate-based authorization protocol; spec, not tooling.
- **Mastercard Agent Pay** (Apr 2025) + **"Agent Pay for Machines"** (Jun 2026) — agentic tokens on MDES, sub-cent programmatic payments ([Mastercard](https://www.mastercard.com/us/en/news-and-trends/press/2026/june/mastercard-launches-agent-pay-for-machines.html)).
- **Visa Intelligent Commerce** (Apr 2025) + **Trusted Agent Protocol** + **Intelligent Commerce Connect** — single integration for agentic commerce; Visa reports hundreds of controlled real-world agent transactions, predicting millions of consumers by holiday 2026 ([TechInformed](https://techinformed.com/visa-opens-one-integration-for-ai-agent-payments/), [Forbes](https://www.forbes.com/sites/digital-assets/2026/06/07/visa-mastercard-and-coinbase-are-fighting-over-how-ai-agents-pay/)).

**Adjacent / competitive:**
- **Catena Labs** — $30M Series A May 2026, a16z crypto + Acrew; explicit governance layer (limits, approved recipients, deterministic policies, audit trails); OCC trust bank charter filed ([The Block](https://www.theblock.co/post/402029/catena-labs-lands-30-million-series-a-files-for-national-trust-bank-charter-to-underpin-agentic-finance)). **Closest competitor. Custodial, regulated, closed.**
- **NewCore** — $66M seed; agent *identity*, not spend policy.
- **Skyfire** — $9.5M seed; wallets + identity + execution.
- **Microsoft Agent Governance Toolkit** (Apr 2026, OSS) — enterprise agent governance framework, no payments.
- **TealTiger/AgentGuard** (OSS) — runtime policy + cost tracking + receipts; no settlement.
- **Payman** — closed platform, fiat, agent-to-human payouts.
- **Ramp / Brex / Pleo** — human corporate spend; Pleo added AI agents *inside* human spend workflows (Jun 2026).
- **Helicone / Langfuse / Portkey** — LLM spend *observability*; none enforce pre-call.
- **OPA / Vault / IAM / RBAC** — the pattern library: OPA won by being embedded everywhere and publishing a standard (Rego). That is the playbook to copy — not their features.

**Opportunities everyone has missed (SpendVeto's actual openings):**
1. **One policy engine for everything an agent spends** — LLM tokens + metered APIs + stablecoins under the same budgets/approvals/kill switch. Observability tools watch; Catena does payments only, custodially. Nobody unifies. SpendVeto's `/proxy/llm` auth/capture already does this — it's the wedge with demand *today*.
2. **OSS self-host in this category at all.** Every funded competitor is closed SaaS or a bank. The GitLab/Grafana position is empty.
3. **MCP-native enforcement.** Nobody ships governance as MCP middleware. Every MCP client is a distribution channel.
4. **Fail-closed HITL approvals as a developer primitive** — with one-click chat approvals. Card networks do risk scoring; nobody gives developers `requireApprovalAboveUSD` as an npm install.
5. **A portable policy standard.** Publish the policy schema + denial-code registry as a spec. Whoever writes the standard sets the defaults for the category.

---

## PHASE 3 — Governance layer vs. "OS for AI spending"

**Verdict: stay the control plane. Do not become the OS.** The "OS" reading —
custody + execution + rails — is the path Catena chose, and it requires what
they're doing: a bank charter, $48M, and a compliance org. This repo's own
earlier research (GPT round 3) already concluded a solo founder cannot absorb
money-transmitter licensing; that conclusion stands and Catena's charter
filing *proves the cost of the other path* rather than invalidating ours.

TAM does not shrink by staying the control plane — it *expands*, because
rail-neutrality is the position (Datadog doesn't own a cloud; OPA doesn't own
a platform). The correct expansion of scope is horizontal: **"everything an
agent spends" — tokens, API calls, stablecoins, then fiat rails via adapters —
one policy engine, any rail, any custodian.** That is the OS-of-spending in
the only sense that doesn't require a charter.

One architecture change *is* required for the position to be honest: **make
enforcement server-authoritative** (see M1). A governance layer that a
key-holding agent can bypass is a linter, not a control plane.

---

## PHASE 4 — Payment rail strategy

The plugin architecture already exists and is the repo's best structural
decision: `rails/` defines one `pay()` contract; x402 (simulate + Base
Sepolia) is live behind it; AP2/ACP/MPP/Safe-Allowance are honest slots.
Formalize it as **PaymentRail interface v1**:

```js
{
  id, name, status,                    // exists today
  railApiVersion: 1,                   // adapter versioning
  capabilities: {                      // capability negotiation
    holds: bool, refunds: bool, streaming: bool,
    minAmountUSD, currencies: [], chains: []
  },
  estimate({tool, chain}) -> {maxUSD}, // for auth/capture rails
  pay({tool, account, chain, baseUrl}) -> settlement,
  verify(receipt) -> bool
}
```

Policies gain `requiredCapabilities` (e.g. "only settle on rails with
refunds"). Governance stays byte-identical across rails — that invariant is
the moat and must be asserted in verify.

**Adapter priority (build):** 1) Coinbase CDP facilitator key → Base mainnet +
Polygon + Arbitrum become genuinely live (largest unlock per triage, ~days);
2) Stripe MPP when an account exists; 3) AP2 mandate verification;
4) Safe AllowanceModule (already scaffolded, blocked on faucet).
**Do not build:** Lightning, Solana Pay, ACH, SEPA, wire, Coinbase Commerce —
zero demand signal; each is an adapter away *when* a customer asks.

---

## PHASE 5 — Self-host vs. cloud, licensing

Pattern evidence: GitLab (MIT CE + proprietary EE) and Grafana (AGPL + cloud)
built the two biggest OSS-infra outcomes; HashiCorp's BSL move triggered the
OpenTofu fork and preceded the IBM sale; Elastic's SSPL triggered OpenSearch
and Elastic later returned to AGPL; MongoDB got away with SSPL only through
existing dominance; Sentry invented FSL for the same reason; PostHog and
Supabase grew fastest of the recent cohort on MIT/Apache + paid cloud.

Lesson: **restrictive licenses defend adoption you already have. At zero
users, they only kill the funnel.**

**Recommendation:**
- **Core: Apache-2.0, switched from MIT now** — the explicit patent grant
  matters for payments infrastructure and enterprises; the switch costs
  nothing today (zero external contributors) and is impossible later.
- **Open-core line:** everything single-team/single-node is free forever
  (policy engine, proxy, MCP, SDK, dashboard, all rails). Commercial:
  multi-tenant control plane, SSO/SAML/SCIM, RBAC, audit retention/export,
  hosted chat approvals, managed custody/KMS, compliance packs.
- **Mechanism:** hosted-cloud-only paid features first (simplest for a solo
  founder); a license-keyed self-host EE later when an enterprise demands
  air-gap. No BSL. No AGPL (it frightens the exact buyers being courted).
- CLA on contributions to preserve future licensing freedom.

---

## PHASE 6 — Revenue model (one recommendation)

Comparators: Datadog (usage: hosts/ingestion; ~130% NRR — the benchmark),
Stripe (take-rate on volume), Ramp ($0 software + interchange), Metronome/
Orb/Lago (platform fee + usage), MongoDB Atlas (consumption), GitLab
(per-seat — wrong here: agents aren't seats, and seat pricing caps the upside
the whole thesis depends on).

**The model (final):** open-core + hosted cloud, three engines:

1. **SaaS on governed decisions** (hosted): free dev tier → **Team ~$199/mo**
   including N agents + 50k governed decisions/mo, overage per 1k decisions.
   *Governed decisions* (policy evaluations on the enforcement path) is the
   metering unit — clean, Datadog-shaped, and it monetizes the LLM/API-spend
   wedge **without** taking a % of API costs (buyers resent take-rates on
   passthrough spend, and observability tools anchor that market at free).
2. **Basis points on custody volume only**: 10–25bps where SpendVeto actually
   signs (hosted proxy / managed custody). Take-rates are justified precisely
   where the product bears the risk. This is the call option on the McKinsey
   $3–5T curve — upside engine, not the near-term P&L.
3. **Enterprise annual contracts** ($30–150k): SSO, RBAC, audit
   retention/export, self-host EE license, SLA, support.

Direct answers to the posed questions: self-host core **stays free forever**
(it *is* the distribution). Enterprise self-host **pays yearly** (EE license
key). Transaction fees exist **only on the custody path**. Governed *API*
volume is **not** billed as a percentage (decisions cover it). Cloud and
self-host **differ**: multi-tenancy, hosted approvals, managed custody are
cloud/EE.

---

## PHASE 7 — Enterprise features (demand-ordered, most of the list is a trap)

- **P0 — required for the first paying customer of any size:** Postgres,
  API-key auth on every endpoint, org/workspace model, hash-chained
  append-only audit ledger, OpenTelemetry traces.
- **P1 — required to close the first enterprise deal:** OIDC/SAML SSO, RBAC
  (admin / approver / viewer / agent-manager), Slack + Teams approvals,
  **policy versioning + rollback + diff + shadow mode** (product
  differentiators, cheap because dry-run exists), Terraform provider, Helm.
- **P2 — build when a signed contract demands it:** SCIM, Vault/KMS for proxy
  keys, SIEM export, SOC 2 Type I → II, PagerDuty.
- **NO until revenue demands:** LDAP, HSM, FedRAMP, HIPAA, ServiceNow,
  multi-region active-active. Fortune-500 checklists are how seed-stage
  infra companies die.

Pull-forward exception: **shadow mode + canary policies + policy diff** are
not enterprise checkboxes — they're OPA-grade product features that also
generate the "would-have-blocked $X" number, which is the sales deck.

---

## PHASE 8 — Dashboard

Do **not** redesign now; the 10-page console already exceeds prototype
standard. Three additions that sell, in order: (1) Overview headline = ROI
("blocked $X · auto-froze N runaways · shadow mode would have saved $Y");
(2) live event stream over SSE, replacing 800ms polling; (3) exportable
executive report (PDF / scheduled email). Persona dashboards (SOC view,
forecasting, heatmaps) belong to the multi-tenant cloud, not the local
console. Dark mode exists; do a cheap accessibility pass (focus states,
aria labels) before launch.

---

## PHASE 9 — Developer experience

- **P0 (launch adjacent):** publish repo; publish `spendveto-sdk` to npm with
  `.d.ts`; `npx spendveto init` scaffold; Dockerfile + compose; **hosted live
  sandbox** (watch Claude get blocked in the browser, no install); MCP
  registry listings; `awesome-x402` PR; **GitHub Action "policy CI"** — dry-run
  policy changes in PRs and comment the diff of would-be verdicts. Novel,
  cheap, demoable.
- **P1:** **Python SDK** — the single biggest adoption blocker; LangChain/
  CrewAI/AutoGen are Python-first and the current surface is JS-only. CrewAI
  + OpenAI-function-calling adapters beside the LangChain one.
- **P2:** Go SDK, Terraform provider, Helm chart, K8s operator (cloud-stage).
- **NO:** VS Code/JetBrains extensions, Rust/Java SDKs, CloudFormation —
  maintenance drag, zero demand signal.

---

## PHASE 10 — The 10-year moat (what actually compounds)

1. **Standard-setting** — publish the policy schema + denial-code registry as
   an open spec ("Agent Spend Policy v1"), invite other implementers. The OPA
   playbook: the reference implementation of a standard is never ripped out.
2. **Config gravity** — policy packs committed into thousands of repos +
   MCP/framework embeds = switching costs that grow with usage.
3. **Policy pack registry** — community-shared packs ("trading desk",
   "support fleet", "CI agents"), forkable like Grafana dashboards.
4. **Trust graph** — cross-org agent reputation, freeze intelligence,
   overcharging-tool signals. The genuine decade asset — but it requires
   cloud scale; today's per-instance score should be marketed as "wallet
   health," not "credit bureau."
5. **Benchmark data** — anonymized policy-outcome norms ("teams like yours
   cap review at $0.02") once the cloud has tenants.

Not moats: the marketplace (two-sided cold start with a 3-tool catalog —
retire the framing until supply exists), trading-hours as a "trading desk
wedge" (fine feature, wrong ICP story).

---

## PHASE 11 — Roadmap

| P | Item | Difficulty | Time | Impact | Revenue | Enterprise | OSS | Investor | Build? |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Publish repo + npm + Docker + Show HN + MCP listings | Low | 1–2 wk | Extreme | Indirect | — | Extreme | Extreme | **YES** |
| 0 | Relicense Apache-2.0 (pre-publish) | Trivial | 1 d | High | High (later) | High | High | Med | **YES** |
| 0 | Deploy site + real waitlist backend + hosted sandbox | Low | 3–5 d | High | Indirect | — | High | High | **YES** |
| 1 | Server-authoritative enforcement (close the bypass) | Med | 1–2 wk | Extreme | High | Extreme | High | High | **YES** |
| 1 | Store interface + Postgres; indexed spend counters | Med | 2–3 wk | Extreme | High | Extreme | Med | High | **YES** |
| 1 | API-key auth everywhere + minimal roles | Med | 1 wk | Extreme | High | Extreme | Med | Med | **YES** |
| 1 | Hash-chained audit ledger; SSE events; OpenAPI spec | Med | 1–2 wk | High | Med | High | Med | Med | **YES** |
| 2 | Multi-tenant cloud alpha + Stripe billing (decisions) | High | 6–10 wk | Extreme | Extreme | High | — | Extreme | **YES** |
| 2 | Slack/Teams approvals (hosted) | Low-Med | 1 wk | High | High | High | Med | Med | **YES** |
| 2 | Python SDK + CrewAI/OpenAI adapters | Med | 2–3 wk | Extreme | High | Med | Extreme | High | **YES** |
| 3 | OIDC/SAML + RBAC; SOC 2 Type I | Med-High | 4–8 wk | High | Extreme | Extreme | — | High | **YES** |
| 3 | Policy versioning/diff/shadow/canary | Med | 2–3 wk | High | High | High | High | Med | **YES** |
| 3 | CDP facilitator: mainnet Base + Polygon + Arbitrum | Med | 1–2 wk | High | Med | Med | High | High | **YES** |
| 3 | Stripe MPP adapter; AP2 verification | Med | 2–3 wk | Med | Med | Med | Med | High | YES (when account) |
| 4 | Policy pack registry + ASP v1 spec publication | Med | 4–6 wk | High | Med | Med | Extreme | High | **YES** |
| 4 | Trust graph beta (opt-in, cloud) | High | 8–12 wk | Med now / Extreme later | Med | Med | Med | Extreme | YES (post-A) |
| — | VS Code ext, Java/Rust SDKs, LDAP/HSM/FedRAMP, K8s operator, multi-region, marketplace v2 | — | — | Low | Low | Speculative | Low | Low | **NO** |

---

## FINAL OUTPUT

**1. REMOVE**
- "Marketplace / two-sided flywheel" framing from PITCH.md (keep the API).
- "Agent credit file / trust graph" as a *present-tense* claim → "wallet health score (trust graph: roadmap)".
- signup.html's "Hosted platform in private beta" — there is no hosted platform; say "waitlist for the hosted beta."
- "Pitch" link from the customer-facing site nav (keep the page, unlink it).
- The "trading desk wedge" story (keep the trading-hours feature).

**2. ADD** (in order): repo publication + npm + Docker; server-side enforcement; Postgres + auth; hosted sandbox; SSE; Slack approvals; Python SDK; policy versioning/shadow; CDP mainnet; decisions-metered cloud; GitHub Action policy CI; OpenAPI; ASP v1 spec.

**3. REWRITE**
- Policy evaluation: client-library → server-authoritative (proxy path becomes the *only* path that earns the word "enforcement"; client checks demoted to preflight).
- Storage: JSON files → `Store` interface (JSON impl for dev, Postgres for prod); ledger scans → indexed counters.
- Approvals: polling → SSE/webhooks.
- PITCH.md competition section: Catena $30M A + charter; delete "nearly empty."
- Docs: single HTML page → docs site with OpenAPI-generated reference.

**4. DELAY**: SOC 2 Type II (do Type I with first enterprise), SCIM/LDAP/HSM/FedRAMP, K8s operator, multi-region, marketplace v2, trust-graph productization, extra rails beyond CDP + MPP.

**5. BIGGEST WEAKNESSES**: (1) zero distribution while the window closes — everything is drafted, nothing is shipped, and Catena just got funded; (2) enforcement is bypassable outside custody mode; (3) prototype infrastructure (unauthenticated API, JSON files, O(n) policy checks); (4) solo founder against funded teams; (5) the bps revenue engine depends on volume that mostly doesn't exist yet — near-term revenue must come from the decisions/SaaS engine.

**6. BIGGEST STRENGTHS**: (1) verification culture — claims=assertions is a sellable trust signal no competitor has; (2) control breadth beyond any OSS alternative; (3) MCP-native distribution wedge; (4) rail-adapter architecture already real; (5) the unified spend surface (tokens + API + crypto) nobody else offers; (6) zero-setup simulate DX; (7) founder-market fit on distribution (1.5M organic downloads is proof, not a claim).

**7. FASTEST PATH TO $1M ARR** (12–18 mo): M0 ship → MCP/x402/HN channels → 20 design partners on the LLM/API-governance wedge → hosted Team tier + 3–5 enterprise pilots at $50–100k governing agent fleets. Mix: ~5 × $100k + ~200 × $200/mo ≈ $1M. Requires M0–M2 and nothing else.

**8. FASTEST PATH TO $10M ARR** (24–36 mo): Python ecosystem + Slack approvals + SOC 2 T1 + seed/A raise ($5–10M, team of 12–20). 40–60 enterprise accounts ($100–250k) + 1–2k teams. Requirement: become the default governance dependency inside two major agent frameworks.

**9. FASTEST PATH TO $100M ARR** (2028–2030, contingent): the custody bps engine turns on as agentic payments hit their S-curve — $20–50B/yr governed at 2–5bps ($10–25M) stacked on 300–500 enterprise accounts ($60–80M) plus platform. Requires the standard-setter position (ASP spec + registry) established *now*, cheaply, so the volume lands on SpendVeto when it arrives.

**10. FASTEST PATH TO $1B VALUATION**: $50–100M ARR at infra multiples — or earlier at $15–25M ARR growing >3× in a category this hot. The strategic floor: once SpendVeto is the neutral governance standard embedded in MCP/frameworks, every rail (Stripe, Coinbase, Visa, Catena) has a build-vs-buy decision in which buying the neutral layer is cheaper than fighting it.

---

## IMPLEMENTATION PLAN — Milestones & issues

### M0 — "Exist in public" (weeks 1–2)
- **#1 Relicense MIT → Apache-2.0.** AC: LICENSE + NOTICE replaced; headers where needed; README/PITCH/site updated. Note: must precede first external contributor.
- **#2 Publish GitHub repo.** AC: public repo, CI running `npm run verify` green on push (ports freed per CLAUDE.md), issues enabled, SECURITY.md contact live.
- **#3 Publish `spendveto-sdk` to npm.** AC: `npm i spendveto-sdk` works; `.d.ts` shipped; README quickstart ≤10 lines; version 0.14.x matching repo.
- **#4 Dockerfile + docker-compose.** AC: `docker compose up` → server+proxy+dashboard on fresh machine; documented in README.
- **#5 Deploy site + waitlist backend.** AC: site on prod domain; waitlist POST hits a deployed store, not localhost; contact emails on the new pages point at real inboxes.
- **#6 Hosted sandbox.** AC: public URL, simulate mode, seeded wallets, read-only policy edit, "watch a block happen" scripted demo; abuse-limited (rate cap, daily reset).
- **#7 Show HN + MCP registries + awesome-x402 PR.** AC: drafts in `launch/` shipped as-is; MCP server listed in ≥2 registries. (User-owned trigger per CLAUDE.md.)

### M1 — "Production core" (weeks 2–6)
- **#8 Server-authoritative enforcement.** The 402 gate runs the full policy pipeline (budgets, scopes, approvals state) server-side before settlement, not just freeze+signature; CLI/library checks become preflight UX. AC: a client that skips `checkPolicy` and submits a validly-signed payment for an over-budget call is refused at the gate; new verify assertions prove it; README/site wording updated to match reality.
- **#9 `Store` interface + Postgres adapter.** AC: all reads/writes behind one interface; JSON impl remains default for dev; `SPENDVETO_DB=postgres://…` switches; verify passes against both; spend queries use indexed counters, not full-ledger scans (policy check p95 <20ms at 1M entries).
- **#10 API-key auth + minimal roles.** AC: every mutating endpoint requires a key; roles admin/approver/viewer; dashboard login; verify updated; unauthenticated mode only behind an explicit `SPENDVETO_INSECURE_LOCAL=1`.
- **#11 Hash-chained audit ledger.** AC: each entry carries `prevHash`; `GET /api/ledger/verify-chain` detects tampering; assertion tampers a row and proves detection.
- **#12 SSE event stream + OpenAPI spec.** AC: `/api/events` streams approvals/freezes/settlements; dashboard drops polling; OpenAPI 3.1 doc generated and served at `/api/spec`.
- **#13 Persist nonces/idempotency; rate-limit public endpoints.** AC: restart does not reset replay protection; burst-limit assertions.

### M2 — "Cloud alpha" (weeks 6–12)
- **#14 Multi-tenant control plane** (orgs/workspaces/members on Postgres). AC: two orgs fully isolated (data + custody); invite flow.
- **#15 Stripe billing on governed decisions.** AC: metering pipeline counts decisions per org; free tier caps enforced; Team plan subscribable end-to-end.
- **#16 Slack approvals.** AC: approval posts to Slack with Approve/Deny buttons signed one-click URLs (already exist server-side); decision round-trips <2s; fails closed unchanged.
- **#17 Hosted proxy with KMS-held keys.** AC: keys in KMS (or age-encrypted at rest minimum), never in JSON; per-org custody wallets.

### M3 — "Enterprise + rails" (months 3–6)
- **#18 OIDC/SAML SSO + full RBAC.** AC: Okta + Google Workspace tested; role matrix documented.
- **#19 Policy versioning, diff, shadow mode, canary.** AC: every policy change stores a version; `spendveto policy diff` + dashboard view; shadow mode logs would-be verdicts without enforcement; canary applies a policy to N% of decisions; "would-have-blocked $X" lands on Overview.
- **#20 CDP facilitator adapter** → mainnet Base, Polygon, Arbitrum live. AC: real settlement on ≥2 mainnet chains behind the same `pay()` contract; capability fields populated; verify covers capability negotiation (mainnet settlement itself smoke-tested out-of-suite).
- **#21 Python SDK + CrewAI/OpenAI adapters.** AC: `pip install spendveto` parity with JS SDK; example repos per framework.
- **#22 SOC 2 Type I; Terraform provider; GitHub Action policy CI.** AC: audit window opened with a vendor; `terraform apply` manages policies/orgs; Action comments policy-diff dry-runs on PRs.

### M4 — "Moat" (months 6–12)
- **#23 ASP v1 spec** (policy schema + denial codes) published in a standalone repo with a conformance test kit. AC: ≥1 external implementation or integration partner.
- **#24 Policy pack registry.** AC: publish/fork/install packs from CLI + dashboard; 10 first-party packs.
- **#25 Trust graph beta.** AC: opt-in cross-org freeze/behavior signals; privacy review; per-org off switch.
- **#26 Anomaly v2 + governance AI.** AC: price-drift and off-hours signals beyond burst; "suggested policy" generated from 30 days of ledger, one-click apply behind shadow mode.

*(Effort estimates assume 1–2 engineers through M1, a funded team ≥M2. Every issue lands with verify assertions per the repo's one rule.)*
