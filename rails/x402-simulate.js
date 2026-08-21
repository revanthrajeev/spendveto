// x402, simulated settlement: the zero-setup rail. Real keypairs, real ECDSA
// over a server-issued nonce, chain-scoped signatures, replay protection —
// only the settlement itself is local (per-chain balances in data/).
export default {
  id: "x402-simulate",
  name: "x402 — simulated settlement",
  status: "live",
  note: "real ECDSA + replay protection; settles locally on all 7 registered chains",
  async pay({ tool, account, chain, baseUrl, query }) {
    const url = new URL(`${baseUrl}${tool.path}`);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const first = await fetch(url);
    if (first.status !== 402) {
      throw new Error(`expected 402 challenge, got ${first.status}`);
    }
    const challenge = await first.json();
    // The chain rides inside the signed message, so this authorization can
    // only ever settle against that chain's balance.
    const message = `${challenge.nonce}:${challenge.resource}:${challenge.price}:${chain}`;
    const signature = await account.signMessage({ message });
    const header = `${account.address}:${challenge.nonce}:${chain}:${signature}`;
    const second = await fetch(url, { headers: { "X-SIM-PAYMENT": header } });
    if (!second.ok) {
      const body = await second.json().catch(() => ({}));
      throw new Error(`payment rejected: ${body.reason || second.status}`);
    }
    return second.json();
  },
};
