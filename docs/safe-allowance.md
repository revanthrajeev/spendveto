# Safe{Wallet} AllowanceModule — architecture note (roadmap)

Status: **partially implemented, not yet chain-verified**. `rails/safe-allowance.js`
contains a real (non-stub) implementation of the off-chain half of this
adapter — the EIP-712-style `transferHash()`/`domainSeparator()` computation
against AllowanceModule's canonical typehashes, covered by a verify assertion
that checks it produces a deterministic 32-byte digest. It has **not** been
exercised against a live contract (no funded Safe, no deployed module
instance to test signatures/reverts against), so the rail's public status
stays `"roadmap"` and `pay()` refuses honestly when unconfigured — see
"Where it stops" below for exactly what's real vs. what's still a design.

## The gap it would close

Today, SpendVeto's policy engine is the sole enforcer of caps, scopes, and
freezes — it's application code, backed by the 153-assertion suite but not by
an externally audited contract. That's an honest, defensible position for a
prototype, but it means the strongest claim we can make is "we tested this
thoroughly," not "this is enforced by code neither of us wrote or can quietly
change."

[Reimburse.AI](https://github.com/Reimburse-AI/Reimburse-AI) uses Safe{Wallet}'s
`AllowanceModule` for exactly this reason: a Safe multisig holds the treasury,
and the AllowanceModule — a small, audited, widely-used contract — enforces
per-spender period allowances and restricts transfers to a whitelist of
delegates. The enforcement lives on-chain, in a contract the company doesn't
control day-to-day. That's a materially different trust story than "our
backend checked policy before signing."

## What an adapter would need to do

1. **Treasury = a Safe.** The org's funds sit in a Safe multisig instead of
   (or in addition to) a single wallet SpendVeto's proxy custodies.
2. **Delegates = agents.** Each agent (or child/delegated wallet in SpendVeto's
   existing hierarchy) is added as an AllowanceModule delegate with a
   `resetTimeMin` + `amount` allowance — the on-chain analog of SpendVeto's
   `maxPerHourUSD` / TTL grants.
3. **`pay()` calls `executeAllowanceTransfer`.** Instead of SpendVeto's own
   client signing an x402 payment authorization, the rail adapter calls the
   AllowanceModule's transfer function, which reverts on-chain if the
   delegate is over its allowance — the cap is enforced by the contract, not
   by whether our policy check ran first.
4. **SpendVeto keeps the parts AllowanceModule doesn't have.** AllowanceModule
   has no concept of: nested/cascading budgets across a delegation tree, tool
   scoping, human-approval gates above a threshold, burst-rate auto-freeze, or
   MCP middleware. Those stay exactly as they are — this rail would sit
   *underneath* the existing governance pipeline as a stronger settlement
   layer, not replace it.

## Why this is a roadmap slot, not a stub

Per this repo's one rule (`CLAUDE.md`): no adapter pretends. Building this for
real requires:
- Choosing and pinning an AllowanceModule contract version/address per chain,
- A funded Safe to test against (can't be simulate-mode fake money — the
  whole point is on-chain enforcement),
- Mapping SpendVeto's n-level delegation hierarchy onto AllowanceModule's
  flatter one-hop delegate model (likely: only *root* wallets become Safe
  delegates; sub-delegation stays enforced by SpendVeto's app-layer policy,
  same as today).

Until that's built and covered by real assertions, `getRail("safe-allowance")`
refuses honestly instead of faking a pass-through — see `rails/index.js` and
`scripts/verify.mjs`.

## Where it stops today

`rails/safe-allowance.js` implements, for real:
- `domainSeparator()` and `transferHash()` — the exact EIP-712-style digest
  a registered AllowanceModule delegate must sign, built from the canonical
  `DOMAIN_SEPARATOR_TYPEHASH` / `ALLOWANCE_TRANSFER_TYPEHASH` constants and
  `viem`'s `encodeAbiParameters`.
- The `executeAllowanceTransfer` / `getTokenAllowance` ABI fragments.
- A config gate: `pay()` throws a clear "not configured" error unless
  `SAFE_ADDRESS` and `SAFE_ALLOWANCE_MODULE_ADDRESS` are set — verified by
  `scripts/verify.mjs`.

It deliberately stops before: an RPC client reading the delegate's live
allowance/nonce via `getTokenAllowance`, signing `transferHash()` with the
agent's key, and submitting `executeAllowanceTransfer`. Wiring that up
without a funded Safe + registered delegate to test against would mean
shipping an on-chain payment path that has never actually moved a token —
exactly the "stub that pretends" CLAUDE.md's one rule forbids. That's the
next concrete step once there's real testnet infra to point it at.

## Current blocker (checked live, not assumed)

`npm run deploy-safe-allowance` deploys the Safe + enables AllowanceModule
against the same `CLIENT_PRIVATE_KEY` wallet `npm run gen-wallets` already
created (`0x1F4513dA2F9eEFe70541A0357c0d6446661C00Cf`). Running it right now
prints:

```
Base Sepolia ETH balance: 0 wei
BLOCKED: this wallet has 0 ETH on Base Sepolia — cannot pay gas for Safe deployment.
```

This was confirmed against the live Base Sepolia RPC, not assumed. Funding
it requires a faucet with human/captcha verification
(https://www.coinbase.com/faucets/base-sepolia-faucet or
https://faucet.circle.com) — that step needs a person, not an agent. Once
the wallet holds testnet ETH:

```
npm run deploy-safe-allowance
```

deploys the Safe and stops right after, printing the deploy receipt so the
new Safe address can be confirmed against a block explorer before anything
else writes to it (deliberately conservative — see the script's comments).
The remaining steps (enable AllowanceModule, register the delegate,
call `setAllowance`, then wire `SAFE_ADDRESS`/`SAFE_ALLOWANCE_MODULE_ADDRESS`
into `.env.local` and finish `rails/safe-allowance.js`'s `pay()`) are the
next concrete work once that address is confirmed.
