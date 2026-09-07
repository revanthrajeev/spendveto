# ETHOnline 2026 — track fit and submission plan

**Event:** [ETHGlobal ETHOnline 2026](https://ethglobal.com/events/ethonline2026/home), 4–16 September 2026, fully online.
**Submission deadline:** Sunday **13 September 2026, 12:00 pm EDT**.
**Prize tracks read from** [ethglobal.com/events/ethonline2026/prizes](https://ethglobal.com/events/ethonline2026/prizes) on 4 September 2026.

> **Read the event rules yourself before submitting.** This document maps *product fit*, not eligibility. Several sponsors run explicit **continuity tracks** for extending existing open-source repos, which is the relevant shape here — SpendVeto is a public Apache-2.0 repo with months of history, not a hackathon-weekend build, and a track that rewards new-from-scratch work is the wrong one to enter it in.

## The honest position

SpendVeto is the buyer-side spend-governance layer for agents paying over x402: policy caps, human approvals, nested delegated budgets, a kill switch, and a tamper-evident ledger, all enforced **before** anything settles. Fourteen chains across seven signature families are registered; five settle live on-chain today through the public x402 facilitator. `npm run verify` runs 298 end-to-end assertions from a clean clone.

What that means for a hackathon: the strongest tracks are the ones asking for *governed agent payments on a specific chain*, and the weakest are the ones asking for a new app in a domain this repo has no business claiming.

## Track fit, ranked

| Track | Prize | Fit | What already exists | What is missing |
|---|---|---|---|---|
| **Hedera — AI & Agentic Payments** | $6,000 | **Strongest** | `hedera-testnet` is a registered chain with `status: "live"` — the public facilitator settles `hedera:testnet` (verified against its `/supported`), and this server *is* an x402-gated service, with its own account-id addressing branch through `client/wallet.js` and `rails/x402-testnet.js` | A funded Hedera testnet account and `SERVER_PAYOUT_ADDRESS_HEDERA` set, then a **real paid request** recorded end to end. The wiring is done; the demo evidence is not |
| **World — AgentKit Continuity** | $3,500 | **Strong** | `server/worldid.js` (control #33): `policy.requireWorldIdForApproval` makes an approval require a verified World ID proof — a real Cloud Verify API call, refusing honestly when unconfigured rather than accepting an unverified click. "Distinguishing bots from human-backed agents" is exactly what that gate is for | A configured `WORLD_APP_ID` and a recorded approval flow. Possibly deepen: bind the verified nullifier into the signed consent record, so *which* human approved travels with the evidence |
| **Arc — Best Agentic Economy / Launch on Arc** | $1,667 / $3,500 | **Medium** | `arc-testnet` (`eip155:5042002`, chain id verified live against its RPC) is registry-wired with Circle's native-USDC ERC-20 interface, so policy, chain allowlists, delegated chain scope and per-chain balances all govern Arc payments today | Arc is not on the public x402 facilitator, so `settlement` reports `ready`, not `live`. Going live needs a facilitator that names `eip155:5042002` — or a direct settlement path, which is a bigger build than it looks |
| **Ledger — AI Agents x Ledger (continuity)** | $1,500 | Medium | The signing seam is already isolated (`client/wallet.js` returns a signer per family) — a hardware signer slots in there, not through the whole codebase | The Ledger Agent Stack / Key Ring integration itself. Real work, but bounded, and it strengthens the product independently of the prize |
| **ENS — ENSv2 Integration (continuity)** | $500 | **Done** | `client/ens.js` resolves `.eth` names in both the global payee allowlist and per-delegation payee scope (`client/policy.js`), against a real Ethereum mainnet RPC, cached (10 min success / 1 min failure) so it never adds a round trip to the hot path on a cache hit, and fails **closed** — a name that doesn't resolve is dropped from the allowlist, never treated as a wildcard. 3 new verify assertions (resolve+gate, cache-hit, fail-closed), network boundary swapped for a deterministic fake in the automated suite so it stays hermetic like every other assertion here | Nothing outstanding for the prize's stated scope. Could extend to ENSv2's hierarchical registry/subname permissions specifically if the judges want more than name resolution, but the core "an allowlist a human can audit" value is shipped |
| **Chainlink — Chainlink-Powered Upgrade** | $500 | Weak-medium | Everything here is denominated in USD against stablecoins, so a price feed has a real job only where a non-USD asset enters | Don't force it. A feed used to convert a chain's native token for gas accounting would be honest; a feed bolted on to claim the track would not |
| **The Graph — AI Tooling Continuity** | $5,000 | Weak | The ledger is local JSON by design (self-hosted, your infra, your region) | A subgraph over on-chain settlements would be real, but only once mainnet settlement exists — indexing five testnets proves nothing |
| **Privy — Best B2B Financial Product** | $2,500 | Weak | Spend controls for business wallets is the product | It would mean adopting Privy's wallet infrastructure, which cuts against the self-hosted, no-custody position. Wrong trade for a $2,500 track |
| **Bazantic** | $3,000 | Attempted, dropped | `server/discovery.js` already publishes the catalog in x402 Bazaar's schema — Bazantic's own requirement is "register a gateway + write a Recipe," which is closer to packaging than new work | Registration itself is blocked: `@bazantic/cli`'s `baz login` device-code flow fails on their platform's side ("Something went wrong signing you in") — reproduced across a fresh code, a fresh session, and an incognito window, so this isn't local browser interference. Dropped rather than risk the submission on a third-party outage this close to the deadline. The reusable byproduct — `GET /openapi.json`, generating a standard OpenAPI document from the live catalog — shipped anyway since it's correct independent of Bazantic |
| **1inch / Uniswap** | — | Not a fit | — | These are DeFi-position and API-gateway tracks. Nothing here belongs in them |

## Recommended submission

**All three, up to the platform's max of 3 partners: Hedera, World, ENS.** Bazantic was the fourth candidate but was dropped after its login flow proved broken on their end, not ours (see its row above) — ENS took its place, and unlike Bazantic it needed no third-party account or platform at all, just code and a public RPC.

The Hedera track asks for exactly the thing this repo does and most projects cannot do: an x402-gated service on Hedera with **real paid requests** flowing through it. The chain is already registered, already live on the facilitator, already has its own signature-family branch, and the governance layer in front of it is the differentiator — anyone can take a payment, the demo here is a payment that gets *refused* on policy and one that settles, both on Hedera, both in the ledger, both provable.

### Status as of 2026-09-08 — both live-evidence tracks done

1. ~~**Fund a Hedera testnet account**~~ **Done.** Two distinct testnet accounts (payer `0.0.10410031`, payout `0.0.10410033`), USDC token `0.0.429274` associated and funded via Circle's faucet.
2. ~~**Run `SPENDVETO_MODE=testnet`**~~ **Done.** `hedera-testnet` reports `settlement: "live"` on `/api/chains`.
3. ~~**Record the two-payment demo**~~ **Done, and it's a stronger demo than planned.** Rather than two isolated calls, the Hedera settlement and the World ID approval are **one coherent flow**: an approval-gated payment paused on `requireApprovalAboveUSD`, refused when approved without a World ID proof (`world_id_proof_malformed`, 403), approved with a real device-scanned proof (real Cloud Verify API round trip, 200), which then unblocked the paused client and settled **$0.01 on Hedera testnet**, on-chain — tx `0.0.9185802-1788804271-756194533` (`SUCCESS`, viewable on HashScan). A separate pure-policy refusal (over `maxPerCallUSD`, never reaching the facilitator) is also recorded for the Hedera-only half of the story if the two need to be shown independently.
4. ~~**Configure World ID**~~ **Done — and it required more than config.** The app auto-provisioned into **World ID 4.0** (RP-based protocol, not the old v2 `app_id` API this repo's code was originally written against). `server/worldid.js` was rewritten against `@worldcoin/idkit-server`; a real signed `rp_context` handshake, a version-pinned CDN-loaded `idkit-core` widget (`launch/worldid-demo.html`), and a real QR-code device scan all round-tripped successfully. This also surfaced and fixed a genuine dormant bug (env vars read at ES-module top-level, before `dotenv.config()` had run) and a test-isolation gap in `scripts/verify.mjs`. See `CHANGELOG.md` v0.22.1.
5. **Write the submission** against what is actually true on the day — no claim that isn't an assertion in `npm run verify`, the same rule as everywhere else in this repo. The Hedera and World form fields drafted earlier in this process are now backed by real transaction/verification evidence, not just working code.

### What not to claim

- Not "live on 14 chains" — five settle live by default. The other nine are registry-wired, and `/api/chains` says so per chain.
- Not "Arc integration live" — Arc is governed and settlement-ready, not settling.
- Not "Algorand support" in any sense that implies signing. The facilitator settles Algorand; this instance cannot, because no client scheme package is published, and the registry note says exactly that.
- Not "audited" or "production-ready". No external security audit, no SOC 2, no paying customers. That's in `CONTROLS.md` and it stays there.
