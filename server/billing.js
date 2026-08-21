import { readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const POLICY_PATH = fileURLToPath(new URL("../data/policy.json", import.meta.url));

function billingConfig() {
  try {
    if (existsSync(POLICY_PATH)) {
      const p = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
      return { url: p.billingWebhookUrl || null, secret: p.billingSigningSecret || null };
    }
  } catch {
    // unreadable policy — no billing sink
  }
  return { url: null, secret: null };
}

// Governed-billing sink: SpendVeto is the enforcement layer, not an invoicing
// engine — metering/billing platforms (Lago, Orb, Metronome) already do
// invoices well, but they act POST-usage; they can't stop a call. So the
// division of labor is: SpendVeto decides pre-payment, and after a settlement
// actually happens it pushes one normalized usage event to whatever billing
// endpoint the operator configured (policy.billingWebhookUrl). Same
// fire-and-forget + optional-HMAC contract as alerts: settlement never waits
// on, or fails because of, the billing pipeline.
export function sendUsageEvent(entry) {
  const { url, secret } = billingConfig();
  if (!url) return;
  const body = JSON.stringify({
    event: "spendveto.usage.v1",
    transaction_id: entry.receiptId,
    external_subscription_id: entry.address,
    code: entry.toolId || entry.resource,
    timestamp: entry.ts || new Date().toISOString(),
    properties: {
      amount_usd: Number(entry.amount),
      chain: entry.chain,
      ...(entry.category ? { category: entry.category } : {}),
      ...(entry.payTo ? { payee: entry.payTo } : {}),
    },
  });
  const headers = { "Content-Type": "application/json" };
  if (secret) {
    headers["X-SpendVeto-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }
  fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(2000) }).catch(() => {});
}
