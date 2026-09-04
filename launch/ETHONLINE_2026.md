# ETHOnline 2026 — track fit and submission plan

**Event:** [ETHGlobal ETHOnline 2026](https://ethglobal.com/events/ethonline2026/home), 4–16 September 2026, fully online.
**Submission deadline:** Sunday **13 September 2026, 12:00 pm EDT**.
**Prize tracks read from** [ethglobal.com/events/ethonline2026/prizes](https://ethglobal.com/events/ethonline2026/prizes) on 4 September 2026.

> **Read the event rules yourself before submitting.** This document maps *product fit*, not eligibility. Several sponsors run explicit **continuity tracks** for extending existing open-source repos, which is the relevant shape here — SpendVeto is a public Apache-2.0 repo with months of history, not a hackathon-weekend build, and a track that rewards new-from-scratch work is the wrong one to enter it in.

## The honest position

SpendVeto is the buyer-side spend-governance layer for agents paying over x402: policy caps, human approvals, nested delegated budgets, a kill switch, and a tamper-evident ledger, all enforced **before** anything settles. Fourteen chains across seven signature families are registered; five settle live on-chain today through the public x402 facilitator. `npm run verify` runs 291 end-to-end assertions from a clean clone.

What that means for a hackathon: the strongest tracks are the ones asking for *governed agent payments on a specific chain*, and the weakest are the ones asking for a new app in a domain this repo has no business claiming.

## Track fit, ranked

| Track | Prize | Fit | What already exists | What is missing |
|---|---|---|---|---|
| **Hedera — AI & Agentic Payments** | $6,000 | **Strongest** | `hedera-testnet` is a registered chain with `status: "live"` — the public facilitator settles `hedera:testnet` (verified against its `/supported`), and this server *is* an x402-gated service, with its own account-id addressing branch through `client/wallet.js` and `rails/x402-testnet.js` | A funded Hedera testnet account and `SERVER_PAYOUT_ADDRESS_HEDERA` set, then a **real paid request** recorded end to end. The wiring is done; the demo evidence is not |
| **World — AgentKit Continuity** | $3,500 | **Strong** | `server/worldid.js` (control #33): `policy.requireWorldIdForApproval` makes an approval require a verified World ID proof — a real Cloud Verify API call, refusing honestly when unconfigured rather than accepting an unverified click. "Distinguishing bots from human-backed agents" is exactly what that gate is for | A configured `WORLD_APP_ID` and a recorded approval flow. Possibly deepen: bind the verified nullifier into the signed consent record, so *which* human approved travels with the evidence |
| **Arc — Best Agentic Economy / Launch on Arc** | $1,667 / $3,500 | **Medium** | `arc-testnet` (`eip155:5042002`, chain id verified live against its RPC) is registry-wired with Circle's native-USDC ERC-20 interface, so policy, chain allowlists, delegated chain scope and per-chain balances all govern Arc payments today | Arc is not on the public x402 facilitator, so `settlement` reports `ready`, not `live`. Going live needs a facilitator that names `eip155:5042002` — or a direct settlement path, which is a bigger build than it looks |
| **Ledger — AI Agents x Ledger (continuity)** | $1,500 | Medium | The signing seam is already isolated (`client/wallet.js` returns a signer per family) — a hardware signer slots in there, not through the whole codebase | The Ledger Agent Stack / Key Ring integration itself. Real work, but bounded, and it strengthens the product independently of the prize |
| **ENS — ENSv2 Integration (continuity)** | $500 | Medium | `allowedPayees` already pins which addresses an agent may pay at all | Resolving `.eth` names in payee allowlists and delegation payee scope. Genuinely useful: an allowlist written in names a human can audit is better than one written in hex |
| **Chainlink — Chainlink-Powered Upgrade** | $500 | Weak-medium | Everything here is denominated in USD against stablecoins, so a price feed has a real job only where a non-USD asset enters | Don't force it. A feed used to convert a chain's native token for gas accounting would be honest; a feed bolted on to claim the track would not |
| **The Graph — AI Tooling Continuity** | $5,000 | Weak | The ledger is local JSON by design (self-hosted, your infra, your region) | A subgraph over on-chain settlements would be real, but only once mainnet settlement exists — indexing five testnets proves nothing |
| **Privy — Best B2B Financial Product** | $2,500 | Weak | Spend controls for business wallets is the product | It would mean adopting Privy's wallet infrastructure, which cuts against the self-hosted, no-custody position. Wrong trade for a $2,500 track |
| **Bazantic / 1inch / Uniswap** | — | Not a fit | — | These are DeFi-position and API-gateway tracks. Nothing here belongs in them |

## Recommended submission

**Hedera — AI & Agentic Payments**, with **World — AgentKit Continuity** as a second submission if the rules allow more than one.

The Hedera track asks for exactly the thing this repo does and most projects cannot do: an x402-gated service on Hedera with **real paid requests** flowing through it. The chain is already registered, already live on the facilitator, already has its own signature-family branch, and the governance layer in front of it is the differentiator — anyone can take a payment, the demo here is a payment that gets *refused* on policy and one that settles, both on Hedera, both in the ledger, both provable.

### What to do before 13 September

1. **Fund a Hedera testnet account** and set `SERVER_PAYOUT_ADDRESS_HEDERA` in `.env.local`. Registry note on `hedera-testnet` is explicit that account-id addressing needs a real registered account — an ephemeral keypair cannot settle.
2. **Run `SPENDVETO_MODE=testnet`** and confirm `hedera-testnet` appears in `liveSettlementChains` on `/api/chains`.
3. **Record the two-payment demo**: one governed payment that settles on Hedera, one that the policy refuses before it settles, both visible in the ledger with their policy hash. `npm run demo -- --native` records the film; `launch/DEMO_SCRIPT.md` has the script.
4. **Configure World ID** (`WORLD_APP_ID`) and record one approval carrying a verified proof, if entering that track too.
5. **Write the submission** against what is actually true on the day — no claim that isn't an assertion in `npm run verify`, the same rule as everywhere else in this repo.

### What not to claim

- Not "live on 14 chains" — five settle live by default. The other nine are registry-wired, and `/api/chains` says so per chain.
- Not "Arc integration live" — Arc is governed and settlement-ready, not settling.
- Not "Algorand support" in any sense that implies signing. The facilitator settles Algorand; this instance cannot, because no client scheme package is published, and the registry note says exactly that.
- Not "audited" or "production-ready". No external security audit, no SOC 2, no paying customers. That's in `CONTROLS.md` and it stays there.
