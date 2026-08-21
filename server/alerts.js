import { readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const POLICY_PATH = fileURLToPath(new URL("../data/policy.json", import.meta.url));

function alertConfig() {
  try {
    if (existsSync(POLICY_PATH)) {
      const p = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
      return { url: p.alertWebhookUrl || null, secret: p.alertSigningSecret || null };
    }
  } catch {
    // unreadable policy — no alerts
  }
  return { url: null, secret: null };
}

// Real-time alerts to wherever the team lives (Slack/Discord incoming webhook,
// or any HTTP endpoint). Fire-and-forget: governance decisions never wait on,
// or fail because of, the notification channel. If alertSigningSecret is set
// in the policy, every delivery carries an HMAC signature header so the
// receiver can verify the alert really came from this SpendVeto — spoofed
// "everything is fine" (or fake freeze) webhooks fail verification.
export function sendAlert(type, payload) {
  const { url, secret } = alertConfig();
  if (!url) return;
  const body = JSON.stringify({ type, ts: new Date().toISOString(), ...payload });
  const headers = { "Content-Type": "application/json" };
  if (secret) {
    headers["X-SpendVeto-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }
  fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(2000) }).catch(() => {});
}
