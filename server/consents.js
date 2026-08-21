import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { signConsent } from "./simulate.js";
import { sendAlert } from "./alerts.js";

// Visa's Trusted Agent Protocol separates a Verified Agent ID from a signed
// CONSENT record the consumer (here: the delegating parent wallet) can point
// to independently — proof that this exact grant, with this exact scope, was
// actually authorized, and later that it was actually revoked. SpendVeto
// already has the grant (a delegation) and the revoke action; what was
// missing was a portable, independently-verifiable signature over each of
// those two events, not just a JSON row an admin could quietly edit.
//
// Signed with the same server key that signs settlement receipts and AP2
// verdicts (server/simulate.js) — one key, three kinds of portable evidence.

const PATH = fileURLToPath(new URL("../data/consents.json", import.meta.url));

function read() {
  if (!existsSync(PATH)) return [];
  try {
    return JSON.parse(readFileSync(PATH, "utf8"));
  } catch {
    return [];
  }
}

function save(list) {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(list, null, 2));
}

function scopeSummary(delegation) {
  return JSON.stringify({
    tools: delegation.allowedTools || null,
    chains: delegation.allowedChains || null,
    payees: delegation.allowedPayees || null,
  });
}

// action: "grant" | "revoke". Recorded and signed the moment it happens —
// never backdated, never reconstructed after the fact.
export async function recordConsent(delegation, action) {
  const ts = new Date().toISOString();
  const scope = scopeSummary(delegation);
  const signed = await signConsent({
    id: delegation.id,
    parentAddress: delegation.parentAddress,
    childAddress: delegation.childAddress,
    capUSD: delegation.capUSD,
    scope,
    action,
    ts,
  });
  const record = {
    id: randomUUID(),
    delegationId: delegation.id,
    parentAddress: delegation.parentAddress,
    childAddress: delegation.childAddress,
    capUSD: delegation.capUSD,
    scope,
    action,
    ts,
    ...signed, // message, signature, signer
  };
  const list = read();
  list.push(record);
  save(list);
  if (action === "revoke") {
    sendAlert("consent_revoked", { delegationId: delegation.id, childAddress: delegation.childAddress, parentAddress: delegation.parentAddress });
  }
  return record;
}

export function listConsents() {
  return read();
}

export function consentsForDelegation(delegationId) {
  return read()
    .filter((c) => c.delegationId === delegationId)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
}
