// One receipt shape regardless of which rail produced the ledger entry.
// Today the ledger already mixes shapes that a client has to know about by
// hand: an x402 simulate/live crypto settlement carries a receiptId +
// policyHash; a metered LLM/API-spend entry (rails/index.js "api" category)
// carries neither; a future google-ap2/openai-acp/stripe-mpp adapter would
// add a third shape again the moment it stops being a roadmap slot. This is
// the projection every rail's entries already fit through without changing
// what's actually stored — the x402 Foundation's own pitch (one payment
// method, many rails) only holds up if the RECEIPT also looks the same no
// matter which rail settled it.
export function normalizeReceipt(entry) {
  const rail = entry.chain === "api" ? "api-spend" : entry.mode === "testnet" ? "x402-live" : "x402-simulate";
  return {
    rail,
    receiptId: entry.receiptId || null,
    payer: entry.address,
    payee: entry.payTo || null,
    amountUSD: Number(entry.amount),
    network: entry.chain || null,
    category: entry.category || null,
    status: entry.status,
    reason: entry.reason || null,
    ts: entry.ts,
    // Only present when the underlying rail actually produced portable proof
    // (a signed receipt + the policy version it was checked against) — never
    // invented for rails/entries that don't have one.
    proof: entry.receiptId ? { policyHash: entry.policyHash || null } : null,
  };
}
