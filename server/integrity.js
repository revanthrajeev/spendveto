// Request integrity — binding an authorization to the request it was granted for.
//
// Every control in SpendVeto so far answers "is this spend allowed?". None of
// them answer "is this the spend I allowed?". That gap is real and specific:
// policy runs on a described request (a cart, an intent, a tool call), and
// then something else executes. Between those two moments a compromised or
// merely buggy agent can change the payload — same payer, same price, same
// approval, different merchant or different goods. Every amount-based control
// passes, because the amount never changed.
//
// Fireblocks is contributing exactly this idea to x402 as a security
// extension ("request integrity and spend governance"). This is SpendVeto's
// implementation of the buyer side of it, and it is deliberately simple: hash
// the request canonically, sign the hash with the same key that signs receipts
// and verdicts, and refuse at execution time if the payload no longer digests
// to what was authorized.
//
// What this is NOT: encryption, replay protection on its own (the binding
// carries an expiry and a single-use id, but the ledger is what proves a spend
// happened once), or a claim about the *content* being reasonable. It proves
// one thing only — that the executed request is byte-for-byte the authorized
// request — and that one thing is what nothing else here checks.

import { createHash, randomUUID } from "node:crypto";
import { signDecision } from "./simulate.js";

// Canonical digest. Key order must not change the hash, or the "same request"
// test would depend on JSON serialization order rather than on content —
// two identical carts assembled by different libraries would fail to match.
// Recursive sorted-key SHA-256, the same construction as policyHash().
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

export function requestDigest(payload) {
  return createHash("sha256").update(canonicalize(payload ?? null)).digest("hex");
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

// Bindings are held in memory and single-use: an authorization that could be
// replayed against a second execution is not a binding, it's a coupon.
const bindings = new Map();

export function clearBindings() {
  bindings.clear();
}

// Bind a verdict to a payload. Returns a signed token the caller carries to
// execution. The signature covers the digest, so the binding is verifiable by
// anyone holding the server's public key — not only by this process.
export async function bindAuthorization({ agent, payload, amountUSD, payee, ttlMs = DEFAULT_TTL_MS }) {
  const id = randomUUID();
  const digest = requestDigest(payload);
  const ts = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const signed = await signDecision({
    id: `bind:${id}:${digest}`,
    agent,
    amountUSD: Number(amountUSD) || 0,
    payee: payee || null,
    verdict: "bind",
    ts,
  });
  const record = { id, agent, digest, amountUSD: Number(amountUSD) || 0, payee: payee || null, ts, expiresAt, consumed: false, ...signed };
  bindings.set(id, record);
  return record;
}

function fail(code, reason, suggestion) {
  return { ok: false, code, reason, suggestion };
}

// Verify at execution time. Ordered so the returned code names the root cause:
// an unknown id is not a mismatch, and an expired binding is not a tamper.
export function verifyBinding({ bindingId, payload, agent }) {
  const record = bindings.get(bindingId);
  if (!record) {
    return fail("binding_unknown", `no authorization binding with id "${bindingId}"`, "bind the request before executing it — an unbound execution carries no proof it was the one authorized");
  }
  if (record.consumed) {
    return fail("binding_consumed", `binding ${bindingId} was already used to execute a request`, "bindings are single-use; request a fresh authorization for this execution");
  }
  if (Date.parse(record.expiresAt) < Date.now()) {
    return fail("binding_expired", `binding ${bindingId} expired at ${record.expiresAt}`, "re-run the authorization; a stale binding cannot vouch for a request assembled after it");
  }
  if (agent && record.agent && agent.toLowerCase() !== record.agent.toLowerCase()) {
    return fail("binding_agent_mismatch", `binding ${bindingId} was issued to ${record.agent}, not ${agent}`, "each agent must carry its own binding — one agent cannot execute under another's authorization");
  }
  const digest = requestDigest(payload);
  if (digest !== record.digest) {
    return fail(
      "request_integrity_mismatch",
      `executed request digests to ${digest.slice(0, 16)}… but the authorization was granted for ${record.digest.slice(0, 16)}…`,
      "the request changed after it was authorized — re-submit it for a fresh decision rather than executing the modified payload"
    );
  }
  record.consumed = true;
  return { ok: true, bindingId, digest, agent: record.agent, amountUSD: record.amountUSD, signer: record.signer };
}

export function getBinding(id) {
  const b = bindings.get(id);
  if (!b) return null;
  const { ...rest } = b;
  return rest;
}
