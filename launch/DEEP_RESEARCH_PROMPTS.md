# Deep-research prompts — Gemini + GPT

Paste each prompt into the respective tool's deep-research mode. Bring both outputs back and Claude will triage them into a build plan (features get built only if they survive the honesty bar: locally runnable, verifiable in `npm run verify`).

- **Gemini Deep Research** → market, buyers, GTM, landing-page teardown (breadth + citations)
- **GPT deep research** → protocol/technical landscape, security, integration surfaces (depth)

---

## PROMPT 1 — paste into Gemini Deep Research

You are researching the market for **SpendVeto**, an open-source spend-governance layer for AI agents that pay for things with stablecoins. Today is July 2026 — prioritize sources from 2025–2026 and give a URL + date for every factual claim.

WHAT SPENDVETO IS TODAY (all shipped, all covered by an 141-assertion end-to-end test suite): a governance gate that runs BEFORE an AI agent's payment executes — policy caps (per-call/hourly/rate), human approvals that fail closed on timeout, n-level delegated budgets where every ancestor's cap binds its whole subtree, tool scoping and chain scoping on grants, a runaway-burst auto-freeze + manual kill switch, ECDSA-signed receipts, CSV audit export, webhook alerts, per-tool/per-wallet/per-chain analytics, agent trust scores (0–100 from governance history), importable policy packs, an MCP server so Claude/any MCP client is governed transparently, and an enforcement proxy where agents are keyless and POST spending intents while custody signs only after the pipeline passes. Settlement: x402 protocol (HTTP 402 + USDC), live on Base Sepolia; 7 chains registered (Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche) running the identical pipeline in simulated settlement with chain-scoped signatures and per-chain balances. Constraints: solo builder, local-first Node.js OSS (MIT), no hosted infra yet, no partnerships; goal is acceptance into YC / a16z CSX / Alliance DAO (cohorts starting ~Sept 2026) and a fundable wedge story.

RESEARCH QUESTIONS — answer all six:

1. **Competitive map (July 2026).** Who is building spend controls, wallets, or payment infrastructure FOR AI agents as the spender? Cover at least: Skyfire, Payman, Catena Labs, Nevermined, Crossmint (agent wallets), Coinbase AgentKit/CDP, Stripe (agent toolkit / Machine Payments), Circle, Cloudflare (pay-per-crawl / monetization gateway), Vercel x402 support, thirdweb, Privy, Turnkey, Lit Protocol, Safe smart accounts (+ Zodiac/roles modifiers), Ramp/Brex/Pleo agent features. For each: funding raised (round, date), live product vs announcement, pricing, and — the key column — whether they enforce **pre-payment buyer-side governance** (policies/approvals/caps before the agent's money moves) or just issue wallets / settle payments. Output as one table. Then name the 3 closest true competitors to SpendVeto and what each lacks.

2. **Buyer evidence.** What controls do companies actually demand before letting AI agents spend money autonomously? Find evidence from: enterprise AI-agent procurement/RFP requirements, security questionnaires, job postings mentioning agent-payment governance, case studies of agent-spend incidents/runaway-cost stories (APIs, cloud, LLM tokens), and finance-team commentary on agentic spend. Who is the economic buyer — CFO, platform engineering, security? What's the trigger event that makes them buy?

3. **Rails status check.** Current adoption numbers with dates for: x402 (transactions, active agents, which chains have live facilitators, v2 status), Google AP2, OpenAI's agentic commerce / ACP, Stripe Machine Payments, Visa Intelligent Commerce, Mastercard Agent Pay. Which rails are real volume today vs announcements? Where does a rail-neutral governance layer plug in for each?

4. **Feature gaps ranked.** Given SpendVeto's current feature list above, identify the 10 highest-value missing features, ranked by (impact on accelerator/fundraising demo) × (buildable by one developer locally, no partnerships, verifiable in an automated test). For each: what it is, who ships it today (if anyone), evidence someone wants it, rough build size (days). Explicitly EXCLUDE things that require hosted infrastructure, custody licensing, or bizdev. Also give a **kill list**: 5 features we might be tempted to build that the evidence says NOT to.

5. **Business model validation.** For a spend-governance layer: compare basis-points-on-governed-volume vs per-seat SaaS vs OSS-core + hosted-cloud pricing, with real comparables and their actual prices (Ramp interchange, Payman, Skyfire take rates, Stripe MPP fees, Lithic/Marqeta program fees, security-proxy pricing like Cloudflare). Which model do investors currently reward in agent-infra, with examples from 2025–26 rounds?

6. **Landing-page and positioning teardown.** Look at snowmind.xyz, reimburseai.app, skyfire.xyz, paymanai.com, catenalabs.com, and 2–3 best-in-class dev-tool/fintech landing pages of 2025–26. What proof elements, claims, structure, and design patterns convert for (a) developers and (b) investors? What should SpendVeto's hero headline literally say — propose 5 options with rationale. What's the one section our page type usually gets wrong?

OUTPUT FORMAT: executive summary (10 bullets max) → the competitor table → ranked feature table → kill list → business-model verdict (one recommendation, not a survey) → 5 hero headlines → full source list with dates. Flag every claim you could NOT verify as UNVERIFIED rather than guessing.

---

## PROMPT 2 — paste into GPT deep research

You are the technical due-diligence researcher for **SpendVeto**, an open-source spend-governance layer for AI agents (x402/USDC + MCP). Today is July 2026 — use 2025–2026 primary sources (specs, repos, changelogs, docs) and link every claim.

CURRENT SYSTEM (all working, 141-assertion e2e suite): Node.js/Express; simulate mode with real secp256k1/ECDSA (viem), nonce replay protection, chain-scoped signed payment messages (`nonce:resource:price:chain`), per-(wallet,chain) balances; live x402 v1 settlement on Base Sepolia via the public facilitator (`x402-express`/`x402-fetch`); policy engine (caps/rate/hourly, chain allowlists), approvals that fail closed, n-level delegation with tool + chain scopes binding subtrees, burst auto-freeze + kill switch (frozen wallets get 403 even with valid signatures), ECDSA-signed receipts, MCP stdio server, and an enforcement proxy holding custody keys where agents POST intents. 7 EVM chains registered with canonical USDC contracts. Solo maintainer, everything must run locally and be verifiable in automated tests — no hosted services, no partnerships.

RESEARCH TASKS — answer all five, implementation-ready:

1. **Making more chains LIVE.** Exact current state of x402: v1 → v2 migration (package names, breaking changes, timeline), and a per-chain table of every facilitator that exists today — operator, URL, supported chains/networks (Base mainnet? Solana/SVM? Polygon? Avalanche? BSC? Sei?), auth requirements (CDP API keys?), fees, testnet vs mainnet, and whether a self-hosted facilitator is practical (link the reference implementation and what running one requires). Then: for our 7 registered EVM chains, which could settle for real TODAY with zero partnerships, and what exactly would we wire (packages, config, faucets for testnets)? Include EIP-3009 support status of native USDC on each chain (vs bridged variants), since x402 exact-scheme depends on it.

2. **Multi-rail adapters.** For Google AP2, OpenAI ACP / agentic checkout, and Stripe Machine Payments: spec maturity, reference implementations, what a LOCAL open-source project can integrate against today without a partnership or account approvals, and the minimal honest "adapter" we could ship + test (e.g., AP2 mandate verification only, no settlement). Be blunt about which are paper specs.

3. **Security review of our design.** Threat-model a spend-governance proxy + client-side policy engine: TOCTOU between policy check and settlement, replay/nonce store limits, custody key handling in a Node process, delegation-graph cycle/forgery attacks, trust-score gaming, webhook spoofing, approval-endpoint auth (currently none — local tool), CORS `*` on the API, chain-confusion attacks on signed messages. For each: concrete attack, severity for (a) local dev tool (b) future hosted product, and the specific mitigation with the test we should add to the suite. Rank the top 5 fixes worth doing NOW.

4. **Framework integration surfaces.** Where exactly does a payment-governance middleware hook into: LangChain/LangGraph (which callback/interceptor APIs), CrewAI, OpenAI Agents SDK, Vercel AI SDK, Claude Code hooks (PreToolUse) and MCP middleware patterns, AutoGen? For each: the precise extension point (class/function names, links), what a minimal `spendveto-langchain` (etc.) package would look like, and which ONE integration would reach the most agent-builders in 2026 (justify with usage data).

5. **Technical diligence prep.** The 7 hardest questions an infra-focused technical partner (YC/a16z CSX/Alliance DAO) would ask this project, with strong answers grounded in the current architecture — including "why won't Coinbase/Stripe ship this as a feature?", "client-side enforcement is bypassable — why does your proxy answer that?", and "what breaks at 1,000 tx/sec?". Where the honest answer is "not built yet," say what the funded milestone is.

OUTPUT FORMAT: per-task findings with links inline → a single prioritized build order (top 10 items across tasks 1–4, each with effort estimate in days and the verify-suite assertion that would prove it) → the 7 Q&As. Mark anything you could not verify from a primary source as UNVERIFIED.
