# 90-second demo script (v0.7)

For a screen recording (Loom / mp4 for the accelerator application) or a live pitch. Two terminals + one browser window on http://localhost:8402 (the Console). It all runs on canned Claude responses if no ANTHROPIC_API_KEY is set, so nothing stalls on the network.

## Setup (before recording)

```bash
cd ~/Desktop/spendveto
rm -f data/ledger.json data/balances.json data/delegations.json data/children.json data/freezes.json
npm run server    # terminal 1
npm run proxy     # terminal 2 (leave it running, you'll curl it later)
```

Open the Console on **Overview**. Practice once.

---

**0:00 — the hook (Console · Overview)**

> "AI agents can pay for things now — x402 cleared 169 million payments in its first year. This is the layer that decides whether your agent is *allowed* to pay. Everything you'll see is real: real signatures, real settlement, 271 end-to-end tests."

**0:10 — a governed payment**

```bash
npm run call
```

> "The agent asks for a paid tool. Policy check against live spend history → pays $0.01 in USDC → cryptographically signed receipt." *(Console: stats tick, entry lands in Recent activity.)*

**0:20 — human in the loop, fails closed**

```bash
npm run call -- summarize
```

*(Console: red badge appears on Approvals — click it, hit **Approve**.)*

> "Above the threshold, the agent pauses for a human. No answer in 30 seconds? It fails closed — silence never spends money. The alert webhook carries one-click approve/deny links, so this works straight from Slack."

**0:35 — budgets with scopes and expiry (Console · Budgets)**

*(Fill the form: cap 0.02, label "intern", chain scope `base-sepolia`, TTL 600 → **Create wallet + grant**.)*

```bash
npm run call -- review --child=intern --chain=polygon
```

> "One click created a wallet with a capped, chain-scoped, self-expiring budget. It tries to spend on Polygon — blocked, outside its chain scope. And read the block: it tells the agent exactly how to fix itself. Blocked agents self-correct instead of retry-looping."

**0:50 — the kill switch**

```bash
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do npm run call --silent -- translate & done; wait
```

*(Console: the wallet flips to FROZEN; Analytics → Freeze log shows "runaway loop suspected".)*

> "A runaway loop gets frozen mid-burst — not on next month's invoice. Even a correctly signed payment from a frozen wallet is refused." *(Unfreeze it from the Console for the next take.)*

**1:05 — keyless agents (terminal 2)**

```bash
curl -s -X POST localhost:8404/proxy/call -H 'Content-Type: application/json' \
  -d '{"tool":"review","idempotencyKey":"demo-1"}' | head -c 300
```

*(Run it twice.)*

> "Or agents hold no keys at all: they POST intents, custody signs only after the whole pipeline passes. Same idempotency key twice — same receipt, one payment. An agent cannot double-spend."

**1:20 — close (Console · Chains, then Trust)**

> "Chain-scoped signatures across seven chains, live on Base Sepolia via x402 — with Google AP2, OpenAI ACP, Stripe MPP, and Safe{Wallet}'s AllowanceModule as adapter slots behind the same pay() contract. Every wallet's history compresses into a trust score: the ledger becomes an agent credit file. Open source, Apache-2.0. `npm run verify` — 271 assertions, no mocks. The rails move the money. SpendVeto decides whether it should move."

---

**30-second cut**: hook → summarize approval (approve in Console) → chain-scope block with the `Fix:` line → burst freeze → close on the verify line.
