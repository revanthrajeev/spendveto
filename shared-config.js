// Config agreed by both server and client so no extra round trip is needed
// to discover a tool's price before deciding whether policy allows a call.
export const NETWORK = "base-sepolia";
export const PORT = process.env.PORT || 8402;
export const MODE = process.env.SPENDVETO_MODE === "testnet" ? "testnet" : "simulate";

// The governance layer is chain-agnostic and chain-AWARE: every payment
// carries its chain in the signed message, settles against that chain's own
// balance, and is governed by chain allowlists (policy-level and per-grant).
// On-chain settlement is live on Base Sepolia via x402 today; every other
// registered chain works end-to-end in simulate mode (per-chain ledger +
// real signatures), with its canonical USDC contract wired for the adapter.
export const CHAINS = [
  { id: "base-sepolia", caip2: "eip155:84532", name: "Base Sepolia", chainIdHex: "0x14a34", status: "live", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", rpc: "https://sepolia.base.org", note: "x402 settlement via the public facilitator" },
  // status "ready" = full x402 v2 wiring in place (CAIP-2 id, canonical USDC,
  // scheme registration, multi-accepts 402s) — the chain goes LIVE the moment
  // the configured facilitator's /supported names it (CDP key for mainnets)
  // and a funded wallet exists. No code changes required; simulate mode
  // settles every one of these locally today.
  { id: "base", caip2: "eip155:8453", name: "Base", chainIdHex: "0x2105", status: "ready", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpc: "https://mainnet.base.org", note: "mainnet settlement — facilitator key + funded wallet flips it live" },
  { id: "ethereum", caip2: "eip155:1", name: "Ethereum", chainIdHex: "0x1", status: "ready", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpc: "https://eth.llamarpc.com", note: "" },
  { id: "polygon", caip2: "eip155:137", name: "Polygon", chainIdHex: "0x89", status: "ready", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpc: "https://polygon-rpc.com", note: "" },
  { id: "arbitrum", caip2: "eip155:42161", name: "Arbitrum", chainIdHex: "0xa4b1", status: "ready", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: "https://arb1.arbitrum.io/rpc", note: "" },
  { id: "optimism", caip2: "eip155:10", name: "Optimism", chainIdHex: "0xa", status: "ready", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpc: "https://mainnet.optimism.io", note: "" },
  { id: "avalanche", caip2: "eip155:43114", name: "Avalanche", chainIdHex: "0xa86a", status: "ready", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpc: "https://api.avax.network/ext/bc/C/rpc", note: "" },
  // Solana is a different signature family (ed25519, base58 addresses) from
  // every chain above (secp256k1, 0x addresses) — simulate mode's signing
  // path is EVM-specific (see server/simulate.js), so this chain is real x402
  // testnet settlement only, not a simulate-mode target. family lets callers
  // that need to branch on signature scheme (rails/x402-testnet.js,
  // server/index.js facilitator registration) do so without string-matching ids.
  { id: "solana-devnet", caip2: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", name: "Solana Devnet", family: "svm", status: "live", usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", rpc: "https://api.devnet.solana.com", note: "x402 settlement via the public facilitator — real second signature scheme, not just a second EVM chain" },
  // Four more signature families the public facilitator settles today (checked
  // live against its /supported endpoint) — each with its own account model,
  // so each needs its own client signer (see client/wallet.js) and its own
  // branch in rails/x402-testnet.js and server/index.js's scheme registration.
  { id: "aptos-testnet", caip2: "aptos:2", name: "Aptos Testnet", family: "aptos", status: "live", usdc: "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832", rpc: "https://api.testnet.aptoslabs.com/v1", note: "x402 settlement via the public facilitator — Move account model, third signature family" },
  { id: "stellar-testnet", caip2: "stellar:testnet", name: "Stellar Testnet", family: "stellar", status: "live", usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", rpc: "https://horizon-testnet.stellar.org", note: "x402 settlement via the public facilitator — fees sponsored by the facilitator itself" },
  { id: "hedera-testnet", caip2: "hedera:testnet", name: "Hedera Testnet", family: "hedera", status: "live", usdc: "0.0.429274", rpc: "https://testnet.mirrornode.hedera.com/api/v1", note: "x402 settlement via the public facilitator — account-id addressing (0.0.x), not a keypair-derived address; needs a real registered testnet account, an ephemeral keypair alone can't settle" },
  { id: "xrpl", caip2: "xrpl:1", name: "XRPL", family: "xrpl", status: "live", usdc: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", stablecoin: "RLUSD", rpc: "https://s1.ripple.com:51234", note: "x402 settlement via the public facilitator — MAINNET, not a testnet: the only chain on this list settling real money today. Settles in RLUSD, not USDC — XRPL has no canonical USDC deployment" },
];

export const DEFAULT_CHAIN = "base-sepolia";

// x402 v2 facilitator. Default: the x402.org testnet facilitator (no auth).
// Point SPENDVETO_FACILITATOR_URL at Coinbase CDP's facilitator (with your CDP
// API key configured per their docs) to unlock the mainnet chains it serves.
export const FACILITATOR_URL = process.env.SPENDVETO_FACILITATOR_URL || "https://x402.org/facilitator";

export function findChain(id) {
  return CHAINS.find((c) => c.id === id);
}

// The catalog: more than one price is what makes "governance" a real decision
// instead of a single yes/no gate. Each id is also the Claude task it runs
// server-side (see server/agent.js).
export const TOOLS = [
  {
    id: "review",
    category: "engineering",
    path: "/api/agent/review",
    price: "0.01",
    label: "Code review",
    description: "Reviews a short code snippet for bugs.",
  },
  {
    id: "summarize",
    category: "content",
    path: "/api/agent/summarize",
    price: "0.02",
    label: "Summarize",
    description: "Summarizes a passage in one sentence.",
  },
  {
    id: "translate",
    category: "content",
    path: "/api/agent/translate",
    price: "0.005",
    label: "Translate",
    description: "Translates a short phrase to French.",
  },
];

export function findTool(idOrPath) {
  return TOOLS.find((t) => t.id === idOrPath || t.path === idOrPath);
}
