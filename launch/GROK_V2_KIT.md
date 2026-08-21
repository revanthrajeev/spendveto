# Grok implementation kit — triaged (2026-07-11)

Working notes for the v2-migration round. Grok-sourced; spot-check every pin before use.

## Usable now (after spot-checks)
- **CAIP-2 ids** (standard, correct): base-sepolia eip155:84532 · base 8453 · ethereum 1 · polygon 137 · arbitrum 42161 · optimism 10 · avalanche 43114.
- **EIP-3009 table**: all 7 native-USDC addresses match ours exactly (independent cross-check of shared-config.js ✓) and all support transferWithAuthorization per Circle stablecoin-evm — the exact-scheme path is open on every registered chain.
- **v2 shape**: @x402/* scoped packages; accepts-array config {scheme:"exact", price, network: CAIP-2, payTo}; PAYMENT-* headers; explicit HTTPFacilitatorClient + x402ResourceServer + registerExactEvmScheme (server & client); CDP facilitator url api.cdp.coinbase.com/platform/v2/x402, self-serve API key, settles Base/Base-Sepolia/Polygon/Arbitrum/Optimism today per Grok (Ethereum/Avalanche partial).
- **Breaking-changes checklist**: package renames, config, headers, CAIP-2 strings.

## NOT usable as-is (Grok punted — rebuild these ourselves)
- "@x402/*@2.18.0" version pin: **UNVERIFIED** — resolve from npm at build time.
- Security tests: skeletons (`assert.ok(true)`) — the five scenarios stand (TOCTOU race, cross-chain nonce replay, delegation cycle, HMAC tamper, **idempotency poisoning: same key + different tool body must NOT replay the other tool's result** — likely a real bug in our current key-only store), implementations are ours to write.
- LangGraph wrapper: mutates tool.func, empty pytest — direction ok (wrap → POST /proxy/call → surface denial.code/suggestion on 403), rewrite properly against current langchain_core.tools API.
- AP2/ACP stubs: fixtures are empty comments — pull real mandate/checkout field names from ap2-protocol.org spec + agenticcommerce.dev before wiring into the rails/ slots.

## The v2-migration round, when triggered ("start the v2 migration")
1. npm view @x402/core versions → pin real latest; install scoped packages alongside v1.
2. Testnet mode → v2 middleware w/ CDP facilitator (needs user's CDP API key in .env.local) on base-sepolia first; keep simulate mode untouched.
3. CAIP-2 ids added to CHAINS registry (chainCaip2 field); rails/x402-testnet.js → @x402/fetch client.
4. Fix idempotency store: key → hash(key + tool + child + chain); add poisoning assertion.
5. +security assertions (≤10) → suite ~120-124; counts bump everywhere.
