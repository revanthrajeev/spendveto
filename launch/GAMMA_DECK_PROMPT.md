# Gamma deck prompt — SpendVeto (general-purpose pitch deck, 10-slide version)

**Copy ONLY the region between the two `=== COPY FROM HERE ===` /
`=== COPY TO HERE ===` markers below** and paste that into Gamma's
Card-by-card content box. That region is exactly 10 slides separated by
`---`, so Gamma should show **"10 cards total"** — not 13. (The design-brief
and tone notes are folded into Slide 1 and Slide 10 below so they don't each
become their own extra card.)

Source-accurate to `PITCH.md` in this repo as of v0.21.0 (264 verified
end-to-end assertions); every number is cited so Gamma doesn't need to invent
anything.

=== COPY FROM HERE ===

**Slide 1 — Title**
Design direction for the whole deck: dark background (near-black, #070a08), one accent green (#46d68c), clean geometric sans headings (Space Grotesk or similar), minimal — technical/developer-infrastructure aesthetic like Stripe or Vercel decks, NOT flashy or consumer-startup style. No stock photos. Use diagrams/icons for the product-flow and market-sizing slides, not photography.
Content: SpendVeto. Tagline: "The spend-governance layer for AI agents that pay for things." Sub-line: "Payment rails move an agent's money. SpendVeto decides whether it should be allowed to move it." Footer: open source, Apache-2.0, x402 + MCP native.

---

**Slide 2 — Problem**
Headline: "An agent with a wallet is a corporate card with no limit — issued to software that runs at machine speed."
Body points:
- AI agents now pay for tools, APIs, and data autonomously — no human, no card form.
- The x402 payment protocol alone cleared 169M payments across 590,000 buyers and 100,000 sellers in its first year (Coinbase, via InfoQ, July 2026; ~$50M cumulative volume per Coinbase's April 2026 disclosures).
- Coinbase, Stripe, Visa, Mastercard, Google, and Cloudflare are all shipping agent-payment rails in 2026 — every one answers "how does the agent pay?"
- Almost nobody answers the question every team deploying agents asks first: "how do I stop it from overspending?"

---

**Slide 3 — Why now (market timing / asymmetry)**
Headline: "The seller side is commoditizing monthly. The buyer side is funded — but closed."
Body points:
- Seller side (getting paid) is commoditizing fast: Cloudflare opened its x402 Monetization Gateway waitlist July 1, 2026; Stripe has the Machine Payments Protocol; Nevermined, xpay.sh, Zuplo, Apify all monetize MCP tools for sellers.
- Buyer-side governance (stopping agents from overspending) is now being funded but stays closed: Catena Labs raised a $30M Series A in May 2026 (a16z crypto + Acrew) and is filing for a national trust bank charter; Payman is a closed fiat platform.
- The open position: open-source, self-hostable, rail-neutral, MCP-native buyer-side governance. Position it as "the GitLab to their bank" — works with any rail or custodian, competes with none.

---

**Slide 4 — Product: what's actually built, and proven (not a roadmap)**
Headline: "A governance gate between an agent and its money — working today, and verified, not just claimed."
Present as a labeled flow diagram: Agent → Frozen check (kill switch) → Policy check (caps, budgets, rate limits, allowlists) → Human approval if above threshold → Payment settles (x402/USDC) → Everything ledgered.
Below the diagram, a grid of ~8 capability tiles, each one short phrase:
- Policy engine (per-call caps, hourly budgets, rate limits, payee allowlisting, category caps, trading-hours windows)
- Server-authoritative enforcement (the gate itself enforces policy — a client can't bypass it)
- Human-in-the-loop approvals (fails closed on timeout) + N-level budget delegation ("IAM for money")
- Runaway auto-freeze + manual kill switch
- Hash-chained tamper-evident audit ledger + signed receipts
- Trust graph + counterparty reputation bureau
- Multi-chain, facilitator-adaptive live settlement (7 chains registry-wired)
- SDK, LangChain adapter, OpenAI Agents SDK adapter, MCP server, enforcement proxy
Below the tiles, a proof callout box: "264 end-to-end assertions, all passing, re-run on every code change. If a claim isn't a test, it doesn't ship." Real ECDSA cryptography, real x402 settlement, no mocking.

---

**Slide 5 — Competition**
Table with columns: Player | What they are | What they don't do.
Rows:
- Coinbase x402 ecosystem — the payment rail itself — no buyer-side policy, budgets, or approvals
- Skyfire ($9.5M seed, Coinbase Ventures + a16z CSX) — wallets, identity, payment execution — not a policy/governance SDK
- Payman — spend limits, approvals, allowlists — closed, fiat/enterprise, not open-source, not x402/MCP-native
- Catena Labs ($30M Series A, May 2026, a16z crypto + Acrew; filing for a bank charter) — closest funded competitor, governance layer for agent transactions — custodial and closed, becoming a regulated bank, not open-source or self-hostable
- Google AP2 / Mastercard Agent Pay — authorization protocols/standards — standards, not developer tooling (SpendVeto can implement them)
Closing line: "The gap: open-source, developer-first, buyer-side governance that plugs into the stack agents already use (MCP)."

---

**Slide 6 — Market size**
TAM: $3–5T global agentic-commerce spend by 2030 (McKinsey); stablecoins already moved $4.5T in Q1 2026 alone.
Analog: business spend-management software (built for human spenders) is $26B today, projected $56B by 2032 — agents are the next, faster-growing cohort of spenders, currently unserved.
SAM: 590,000 x402 buyers + the fast-growing MCP ecosystem.
SOM (first 18–24 months): a few hundred paying teams via a hosted tier ≈ $1–3M ARR — the open-source-led wedge.

---

**Slide 7 — Business model**
Headline: "Monetizes like a payment network, not seat software — plus a SaaS layer on spend that already exists today."
Two engines:
1. Volume engine: a take rate (10–25 bps) on governed payment volume as agentic commerce grows.
2. SaaS engine (available now, no crypto adoption required): every team running AI agents already burns real money on LLM tokens and metered APIs, unbudgeted — SpendVeto governs that spend today. Pricing tiers: Desk $49/mo, Team $199/mo + 0.5% of governed spend, Money Path 10–25 bps on governed volume (managed custody). Self-host free forever.
Illustrative math (label clearly as illustrative, not a forecast): 1,000 Team accounts ≈ $2.4M/yr base before usage; 10,000 teams at ~$200/mo ≈ $24M ARR before any crypto volume.

---

**Slide 8 — Path to scale (scenario table, label as scenarios not projections)**
Table: Scenario | Share of 2030 agent spend governed | Governed volume | Take rate | Revenue/yr
- Conservative: 0.5% of $3T → $15B governed → 10bps → $15M/yr
- Base: 2% of $4T → $80B governed → 25bps → $200M/yr
- Standard-setter: 5% of $5T → $250B governed → 40bps → $1.0B+/yr
Caption: "The ceiling is set by penetration of a trillion-scale flow, not by seat count. Two compounding moats: the trust graph (a governed-decision data asset no rail accumulates) and shared policy packs that spread team-to-team."

---

**Slide 9 — Honest gaps and the plan to close them**
Headline: "What's not true yet — stated plainly, with the fix."
Left column, "Not true yet":
- No external security audit yet; no mainnet settlement yet (testnet/simulate only) — pre-audit software.
- No hosted multi-tenant platform yet (self-host only today).
- Solo-founder stage, no customers, no revenue yet.
Right column, "The plan (next 30–60 days and beyond)":
- Open-source repo is live at github.com/revanthrajeev/spendveto — next: list in MCP tool registries and framework directories, sign up 3–5 design partners running real agent fleets, launch publicly (Show HN / dev communities).
- Funded milestones: hosted multi-tenant platform (orgs, SSO, RBAC), Postgres-backed storage at scale, mainnet settlement post-audit, SOC 2 readiness.
Caption: "Every gap above is a funded next milestone, not a hidden flaw."

---

**Slide 10 — Ask / close**
Headline: "Open source is the distribution. The hosted platform is the business."
State the ask generically (adjust the number before presenting — this deck is not accelerator-specific): seeking pre-seed capital to fund a security audit, the hosted platform build, and initial design-partner rollout. Repo: github.com/revanthrajeev/spendveto — open source, Apache-2.0, browse the code and the 264-assertion verify suite directly.
Tone note for this whole deck: confident but evidence-first — every claim should read as backed by something specific (a test count, a dollar figure with a source, a competitor's actual funding round), never a generic superlative like "revolutionary" or "game-changing." This is a technical infrastructure product; the deck should read like it was built by an engineer, not a marketer.

=== COPY TO HERE ===
