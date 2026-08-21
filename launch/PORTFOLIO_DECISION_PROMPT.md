# Portfolio decision — deep research prompt (2026-07-13)

Paste into GPT/Gemini/Grok deep research. Purpose: decide which ONE project
a solo founder should commit real time to next, using fresh market data
instead of internal guessing.

---

You are helping a solo, 21-year-old founder decide which ONE of several
project ideas to commit real time to next. Today is July 2026. Cite sources
for every factual claim; mark anything you cannot verify as UNVERIFIED —
do not invent funding rounds, company names, or market-size figures.

FOUNDER CONTEXT (do not re-litigate, just factor in):
Based in Mysore, India; dual-degree student (IIT Guwahati Data Science/AI +
IIM Bangalore digital business, both 2023-2027); already founded Evolune
EdgeTech (shipped 50+ consumer apps, one utility app hit 1.5M+ organic
downloads with $15K+ ad revenue and zero marketing spend — real distribution
skill, not theoretical); currently selected into Google for Startups
Immersion (powered by Antler) and completed Founders Inc's Canopy cohort.
Solo, no cofounder, no funding yet, limited weekly hours due to coursework.
Wants the fastest realistic path to real funding and revenue, is willing to
relocate (Singapore under consideration) for network access.

THE SIX CANDIDATES (ranked provisionally by internal TAM x crowding
analysis, but that ranking has NOT been checked against fresh external data
— your job is to check it):

1. SPENDVETO — B2B open-source spend-governance layer for AI agents (x402
   protocol + USDC + MCP). Fully built, 151 automated tests passing,
   real ECDSA-signed payments, human-approval workflows, budget delegation,
   kill switches. Not yet published/deployed publicly. TAM claimed ~$3-5T
   (agentic commerce/payments infrastructure, McKinsey-style estimate).
   Known competitors as of this research: Skyfire ($9.5M seed), NewCore
   ($66M seed, identity-focused not spend-specific), TealTiger/AgentGuard
   (open-source, cost tracking + crypto receipts), Microsoft's own
   open-sourced Agent Governance Toolkit (April 2026). Founder targets YC
   and a16z CSX (~Sept 2026 cohort) plus is in an Antler-affiliated program
   already (Antler is known for fast pre-seed checks to its own cohort
   founders).

2. FLASQO — B2B API/QA testing platform, "13 testing types in one unified
   platform" (smoke, regression, GraphQL, contract, chaos, full E2E browser).
   Currently in beta, unknown real usage numbers. Comps: Postman, Cypress,
   Katalon, BrowserStack.

3. AN UNBUILT "KIDS MARKET" APP — original-IP children's character universe
   + a COPPA-native (US child-privacy-compliant) companion app. Concept only,
   not built. Thesis: character IP creates a merch/community flywheel
   independent of any single app; family/kids content has real recent VC
   exits.

4. PROPVISTA — global proptech platform: blueprint-to-3D generation +
   property valuation + lead-commission marketplace + payments/auth. Partial
   build. Real estate is a massive but slow, capital-intensive, geographically
   fragmented category.

5. AN AI COMPANION APP — Flutter-based consumer companion app, partial
   build, unclear differentiation. Category dominated by Character.AI and
   platform-native competitors (Meta, Snap).

6. SCOREAI — B2C EdTech app for Indian competitive-exam students (JEE/NEET/
   UPSC-style prep, based on the deployment target). Flutter frontend + a
   genuinely complete PHP/MySQL backend already built: mock tests, question
   banks, study plans, AI doubt-solving chat, leaderboard, previous-year
   papers, Firebase Google-auth, in-app purchases already wired
   (client-side). Backend built for shared cPanel hosting, not yet deployed.
   Indian exam-prep is a proven, massive category with real unicorn exits
   (Unacademy, PhysicsWallah, Testbook, BYJU'S) — the most direct fit with
   the founder's own stated thesis ("distribution + cultural context for the
   500M Indian smartphone user Western tech overlooks") of any candidate
   here.

TASKS:

1. For EACH candidate, find real, dated (2025-2026) funding/competitive
   activity in its specific category — new entrants, notable raises, notable
   shutdowns/pivots, category heat (rising or cooling). Do not use figures
   from before 2025 unless explicitly noting they're dated context.

2. For EACH candidate, estimate realistic odds (rough, labeled as estimates,
   not false-precision) that a SOLO founder with the profile above could
   reach (a) a funded seed round and (b) $10K+ MRR within 18 months. Justify
   the number against category crowding and how much of the product already
   exists.

3. Specifically stress-test the SpendVeto ranking: is agentic-payments
   governance still a genuinely open window in July 2026, or has it become
   too crowded in just the last few months to be worth a solo founder's bet?
   Look for the most recent (last 60 days) news specifically.

4. Recommend ONE candidate to commit to, with the counter-argument against
   your own pick stated explicitly (steelman the second-best option).

5. Flag if any candidate should be eliminated outright (not "deprioritized" —
   actually not worth building given current market reality).

OUTPUT: A ranked list with one paragraph of fresh-sourced justification per
candidate, followed by a single clear final recommendation and its
counter-argument. Mark all UNVERIFIED claims explicitly. No invented sources.
