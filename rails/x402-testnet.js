import { ExactEvmScheme } from "@x402/evm";
import { ExactSvmScheme } from "@x402/svm";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { findChain } from "../shared-config.js";
import { getSvmSigner } from "../client/wallet.js";

// x402 v2 live settlement — registry-driven, not hardcoded to one chain. The
// client side signs for whichever registry chain the call asks for; whether
// settlement actually happens is decided by the REAL boundary: the server's
// 402 only advertises networks its configured facilitator supports (the gate
// asks the facilitator at boot — see server/index.js), so an unsupported
// chain fails with the protocol's own "no matching payment requirements"
// error, not an artificial block in this file. Today: the public facilitator
// settles base-sepolia; a CDP facilitator key brings its mainnet set live with
// zero code changes here.
export default {
  id: "x402-live",
  name: "x402 v2 — live settlement",
  status: "live",
  note: "real on-chain USDC settlement on every registry chain the configured facilitator supports (public facilitator: base-sepolia + solana-devnet today; CDP facilitator key unlocks EVM mainnets)",
  async pay({ tool, account, chain, baseUrl, query }) {
    const c = findChain(chain);
    if (!c?.caip2) {
      throw new Error(`chain "${chain}" is not in the registry — see shared-config.js CHAINS`);
    }
    // Governance identity (budgets, caps, ledger keying) is always
    // `account.address` — the secp256k1 wallet — regardless of which chain
    // settles. Solana needs its own ed25519 keypair purely to produce the
    // on-chain transfer signature, resolved only when this branch runs.
    const client = c.family === "svm" ? new ExactSvmScheme(await getSvmSigner()) : new ExactEvmScheme(account);
    const fetchWithPay = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: c.caip2, client }],
    });
    const url = new URL(`${baseUrl}${tool.path}`);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const response = await fetchWithPay(url);
    if (!response.ok) {
      throw new Error(`request failed: ${response.status}`);
    }
    return response.json();
  },
};
