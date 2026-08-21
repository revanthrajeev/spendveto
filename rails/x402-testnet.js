import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { findChain } from "../shared-config.js";

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
  note: "real on-chain USDC settlement on every registry chain the configured facilitator supports (public facilitator: base-sepolia today; CDP facilitator key unlocks its mainnet set)",
  async pay({ tool, account, chain, baseUrl, query }) {
    const c = findChain(chain);
    if (!c?.caip2) {
      throw new Error(`chain "${chain}" is not in the registry — see shared-config.js CHAINS`);
    }
    const fetchWithPay = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: c.caip2, client: new ExactEvmScheme(account) }],
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
