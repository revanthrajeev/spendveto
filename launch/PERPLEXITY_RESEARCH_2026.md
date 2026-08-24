# Perplexity research prompt — SpendVeto, what to build next (July 2026)

Paste everything below the line into Perplexity (use **Deep Research** mode if
available). It is self-contained. Supersedes the root `RESEARCH_PROMPT.md`,
which is stale — everything that prompt asked for has since been built.

---

I'm building **SpendVeto**, an open-source (Apache-2.0) **spend-governance layer for AI agents that pay for things**. Payment rails move an agent's money; SpendVeto decides whether the agent is *allowed* to move it, before anything settles. Node.js/Express, x402 (HTTP 402 + USDC) and MCP native.

**Stage, honestly:** solo founder, prototype in public, v0.18.0. Default "simulate" mode uses real ECDSA signatures + replay protection against a local ledger; "testnet" mode does real x402 settlement on Base Sepolia. **No mainnet, no external security audit, no paying customers, no hosted product yet.** Every public claim is backed by an assertion in an end-to-end suite (272 assertions today) — I don't ship claims I can't test.

## Already built — do NOT re-suggest these

Policy engine enforced *before* payment: per-call cap, hourly budget, call-rate limit, approval threshold, per-category caps, allowed trading hours, chain allowlist, per-tool scope, and **payee allowlisting** (pin which recipient addresses an agent may pay at all).

- **Server-authoritative enforcement** — the payment gate re-runs the full policy pipeline itself, so an agent with its own key and a hand-rolled client still can't overspend.
- **Human-in-the-loop approvals** — above-threshold spend pauses for a decision; approve / deny / timeout-fails-closed; approvals are single-use and tied to settlement.
- **Budget delegation** — a parent agent grants a capped sub-budget to a child; n-level cascade (a child's spend counts against every ancestor), TTL expiry, rolling windows, and per-grant tool/chain/payee scope.
- **Runaway auto-freeze** (burst detection) + a manual kill switch.
- **Hash-chained, tamper-evident audit ledger** (SHA-256 prev/entry hashes; a verify-chain endpoint reports the first broken row) + ECDSA-signed receipts + CSV export.
- **Shadow mode** — evaluate a candidate policy against live traffic without enforcing it.
- **API-key auth with roles** (viewer < approver < admin) on the admin surface.
- **Trust graph** — per-wallet 0–100 governance score, wallets as nodes / delegations as edges, org rollups, plus a **counterparty bureau** (reputation of a *recipient*, aggregated across every wallet that paid it).
- **Anomaly signals** beyond burst-rate: block-rate spike, novel payee, category drift, amount outlier.
- **Surfaces:** MCP stdio server, an npm SDK, a LangChain adapter, an enforcement proxy for keyless agents (custody + idempotency keys + agent identities), a 10-page ops console, a marketing site with an interactive policy playground, Prometheus `/metrics`, Docker.
- **Rails:** x402 v2 (`@x402/*`) live; Google AP2, OpenAI ACP, Stripe MPP, and Safe{Wallet} AllowanceModule exist as *declared adapter slots that refuse honestly* behind one `pay()` contract — not stubs that pretend.

## Deliberately deferred (tell me if this ordering is wrong)

Hosted Postgres backend (currently JSON files); hosted multi-tenant proxy with orgs/SSO/SLAs; mainnet Base; two-sided marketplace with developer payouts; SOC 2; richer ML anomaly models.

## What I want researched

Be specific and current. This is **July 2026** — I need what's true *now*, not 2024–2025 background.

1. **Competitive landscape.** Who is actually shipping in agent payments *and* agent spend governance? Name products and cite links + dates: Skyfire, Nevermined, Payman, Catena, Circle (agent tooling / Gateway), Coinbase (x402 ecosystem, AgentKit), Google AP2, OpenAI ACP / Instant Checkout, Stripe (Machine Payments / ACP), Visa Intelligent Commerce, Mastercard Agent Pay, plus anyone newer. For each: what do they enforce *before* payment vs. only report after? **Where is the governance gap a solo open-source project can still own?**

2. **Feature gaps vs. my "already built" list.** What capabilities do real deployments/buyers ask for that I do *not* have? Rank by (a) genuinely non-redundant value, (b) buildable solo in days without a customer base or a team. Flag anything that hard-requires a database, hosted infra, or enterprise contracts.

3. **The enterprise greenlight checklist.** What do security, finance, and procurement teams concretely require before letting an autonomous agent spend company money? I want the real checklist: audit-trail/evidence standards, SIEM/log export expectations, SSO/SCIM, data residency, ERP/reconciliation integration, insurance/liability, SOC 2 vs ISO 27001 sequencing, and what an *unaudited pre-mainnet* project realistically can and cannot sell into.

4. **Standards & platform risk.** Where are x402 (v2+), AP2, ACP, and MPP actually heading, and who is winning adoption? Critically: **is a standalone governance layer at risk of being commoditized** by the rails themselves (Stripe/Coinbase/Visa shipping native spend controls), or does a neutral cross-rail governance layer survive? What's the evidence either way?

5. **Business model & pricing.** What do comparable infrastructure companies charge, and what maps to "agent spend governance"? Look at metering/billing (Lago, Metronome, Orb), policy/authorization (Oso, Cerbos, Permit.io, Open Policy Agent's commercial path), and security posture tools. Per-agent? Per-decision? % of governed spend? Which pricing survives contact with buyers, and which OSS→commercial conversion patterns actually work?

6. **Distribution for a solo OSS dev-infra founder.** What has *measurably* worked in 2025–2026 for this category — specific launches, communities, integration/marketplace listings (MCP registries, framework plugin directories), design-partner motions? Name concrete examples and outcomes, not "post on HN."

7. **What kills this.** Steelman the strongest case that SpendVeto fails: is "agent spend governance" a real standalone budget line, or a feature of the rail/platform? Who has tried this and stalled, and why? What signal would tell me early that I'm wrong?

## Output format

- **A prioritized "build next" list** — each item: what it is, why it's non-redundant given what I've built, evidence someone actually wants it (cite it), effort (solo-days vs needs-infra/team), and what it unlocks commercially.
- **A separate "don't build" list** — things that look attractive but are commoditized, premature pre-audit/pre-mainnet, or already table-stakes elsewhere.
- **Every factual claim carries a source link and a date.** Prefer primary sources (docs, changelogs, pricing pages, launch posts) over listicles.
- **Mark speculation explicitly** as speculation. If evidence is thin or contested, say so rather than filling the gap — I'd rather have "unknown" than a confident guess.
- Where you name a competitor capability, say whether it is **enforced pre-payment** or **reported post-hoc** — that distinction is the entire thesis of this product, so don't blur it.
