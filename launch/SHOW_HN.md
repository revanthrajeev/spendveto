# Show HN draft

> Post this only after the repo is public on GitHub. HN convention: plain first-person text,
> no marketing voice, respond to every comment in the first two hours. Best windows:
> Tue–Thu, 8–10am US Eastern.

## Title (pick one, 80-char limit)

1. `Show HN: SpendVeto – spend policies, approvals and a kill switch for AI agents that pay`
2. `Show HN: I gave my AI agent a wallet, then built the thing that says no`
3. `Show HN: Open-source spend governance for x402/MCP agents (budgets, approvals, kill switch)`

## Body

I've been experimenting with agents that pay for things over x402 (Coinbase's
HTTP-402-plus-USDC protocol — it's cleared ~169M payments in its first year). The rails
are getting good fast. What scared me was the other side: an agent with a wallet and
no governor is a corporate card with no limit, issued to software that runs at machine
speed and doesn't get tired of retrying.

So I built SpendVeto, the buyer-side governance layer: policies enforced *before* any
payment happens.

What it does today:

- **Policy engine** — per-call caps, hourly budgets, rate limits, checked against a live
  ledger before the agent signs anything.
- **Human-in-the-loop** — spends above a threshold pause and show up on a dashboard with
  Approve/Deny buttons. No decision in 30s → fails closed, spends nothing.
- **Budget delegation** — a parent wallet grants a capped sub-budget to a child agent,
  the child to a grandchild; every level's cap governs its whole subtree ("IAM for money").
- **Runaway detection + kill switch** — a wallet firing attempts faster than the burst
  threshold gets auto-frozen; you can also freeze any wallet from the dashboard. Frozen
  wallets are refused even with a valid payment signature.
- **MCP middleware** — the part I find most fun: register SpendVeto as an MCP server and
  Claude sees paid tools as ordinary tools, but every call silently runs
  policy → approval → payment first. The model literally cannot opt out of governance.
  Watching Claude ask permission before spending my money is the demo that sold me on
  finishing this.
- **Enforcement proxy** — agents can run fully keyless: they POST spending *intents*,
  custody signs only after the pipeline passes. Intents take idempotency keys, so a
  crash-looping agent can't double-pay; refusals come back as structured denials
  (machine code + a concrete fix) the model can act on instead of retry-looping.
- **Multichain governance** — the chain lives *inside* the signed authorization (a
  Polygon-signed payment is rejected on Arbitrum), balances are per-chain, and both
  policies and delegated grants can pin which chains an agent may settle on. Grants can
  also carry a TTL and expire on their own, and any intent can be dry-run through the
  whole pipeline with zero side effects.

Four things I added after a competitor scan this month, because nobody else had them:

- **Request integrity** — every other control answers "is this spend allowed?". This one
  answers "is this the spend I *allowed*?" The authorization is bound to a canonical
  digest of the exact request, so a payload swapped between the decision and the
  execution is refused — even though payer, price and approval all still match. Fireblocks
  is contributing the same idea to x402 as a security extension; this is the buyer side of it.
- **Token scope, not token validity** — an ACP shared payment token or an AP2 intent is
  minted for an amount, a merchant, a window. The merchant validates the token; nobody
  validates the shopping. A token scoped to $200 at one merchant will happily clear $200
  of the wrong goods.
- **Dispute evidence packs** — an agent purchase produces no device fingerprint, no IP,
  no browsing session, so agent transactions lose chargebacks by default and the merchant
  pays. Visa TAP, Mastercard Agent Pay and AP2 all define *authorization*; none define the
  after-the-fact defence file. Every governed spend assembles into a signed bundle: the
  ledger entry pinned between its neighbouring hashes, the policy version in force with
  drift disclosed, the human approval, the signed consents. Each pack also states what it
  does *not* establish — it never implies delivery or satisfaction.
- **OpenTelemetry spans** — the refusal shows up inside the agent trace that caused it,
  not in a second system you correlate by timestamp at 3am. Blocked is status OK, not
  ERROR: the gate did its job, and colouring refusals red trains a team to ignore the
  colour that matters.

It runs in a zero-setup simulate mode (real secp256k1 keys, real ECDSA verify, replay
protection — settlement is just a local ledger) or against the real x402 facilitator on
Base Sepolia. `npm run verify` runs 291 end-to-end assertions covering all of the above,
including a real JSON-RPC session against the MCP server and a synthetic runaway agent
getting frozen mid-burst.

The bet: seller-side agent payments are commoditizing fast (Cloudflare, Stripe, and half
a dozen startups all help tools charge). Almost nobody is building for the side that
*holds the wallet*. Every newly paid tool makes that gap more expensive.

Code: https://github.com/revanthrajeev/spendveto (Apache-2.0)
Site + a playground that runs the real policy logic client-side: https://spendveto.com

I'd love to hear how people running agent fleets actually think about spend control —
and what would make you trust an agent with real money.

## First comment (post immediately, pre-empts the obvious questions)

A few honest caveats up front: storage is JSON files (this is a prototype — hosted
Postgres is next); it runs the x402 v2 packages (CAIP-2 ids, the current standard); enforcement is server-authoritative — the payment
gate re-runs the full policy pipeline and consumes single-use approvals itself, so an
agent holding its own key and running a hand-rolled client that skips the library still
can't overspend (there's an assertion for exactly that). If you'd rather agents never
hold keys at all, the enforcement proxy takes custody and signs only after the pipeline
passes. No external security audit yet — testnet and simulate by default for every chain.
XRPL mainnet settlement is wired but disabled unless an operator explicitly opts in,
entirely at their own risk — the site says so. The hosted multi-tenant platform is
the funded milestone. Happy to go deep on any of this.
