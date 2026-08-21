// Dispute evidence packs — the artifact the agent-chargeback problem has no
// answer for yet.
//
// When a human disputes a card charge, the merchant defends it with evidence
// the ecosystem has agreed to accept: device fingerprint, IP, browsing
// session, delivery confirmation. An agent-initiated purchase produces none of
// those. There is no device, no browsing history, and no human at a keyboard.
// So agent transactions lose by default — the merchant pays, because it cannot
// show anything a scheme recognizes as authorization. Mastercard projects
// chargebacks reaching ~324M by 2028, and Visa TAP, Mastercard Agent Pay,
// Google AP2 and Amex's agent protections all describe *authorization* without
// yet defining what an agent-side defence file looks like after the fact.
//
// SpendVeto is, almost by accident, sitting on exactly that file. Every
// governed spend already leaves a hash-chained ledger entry, an ECDSA-signed
// receipt, the hash of the policy that was in force, the human approval record
// if one was required, and the signed consent that granted the delegation the
// payer was spending under. Nothing new needs to be captured. This module only
// assembles what already exists into one bundle and signs the bundle itself.
//
// What a pack proves: that this exact spend was checked against a stated
// policy, at a stated time, under a stated grant, with a stated human
// approval, and that the record has not been edited since — because the
// surrounding hash chain still verifies.
//
// What it does NOT prove, stated in the pack itself rather than left for a
// reader to assume: that goods arrived, that the human wanted the outcome, or
// that the policy in force was a *sensible* policy. Evidence of governance is
// not evidence of satisfaction, and a pack that implied otherwise would be
// worth less than no pack at all.

import { createHash } from "node:crypto";
import { getLedger, verifyLedgerChain } from "./ledger.js";
import { listApprovals } from "./approvals.js";
import { listDelegations } from "./delegations.js";
import { consentsForDelegation } from "./consents.js";
import { normalizeReceipt } from "./receipts.js";
import { policyHash } from "../client/policy.js";
import { signDecision } from "./simulate.js";
import { trustScoreFor } from "./trust.js";

// Locate the disputed spend by its ledger entry hash — the only identifier
// that is stable AND tamper-evident. An index would renumber; a receiptId is
// absent on rails that don't issue one.
function findEntry(entryHash) {
  const ledger = getLedger();
  const index = ledger.findIndex((e) => e.entryHash === entryHash);
  return index === -1 ? null : { entry: ledger[index], index, ledger };
}

// The approval that authorized this spend, if the policy required one. Matched
// the same way the gate matches it (payer + resource + price) and constrained
// to approvals decided before the spend settled — an approval granted after
// the fact is not what authorized it, and quietly including it would turn the
// pack into an argument rather than a record.
function approvalFor(entry) {
  const settledAt = Date.parse(entry.ts);
  const candidates = listApprovals().filter(
    (a) =>
      a.address?.toLowerCase() === entry.address?.toLowerCase() &&
      a.resource === entry.resource &&
      Number(a.price) === Number(entry.amount) &&
      a.status === "approved" &&
      a.decidedAt &&
      Date.parse(a.decidedAt) <= settledAt
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
  const a = candidates[0];
  return { id: a.id, decidedAt: a.decidedAt, approvals: a.approvals, status: a.status };
}

// The grant the payer was spending under, plus the signed consent records for
// it. A delegated agent's authority is the whole point of the defence: it
// shows the spend was inside a scope a human signed, not improvised.
function delegationFor(entry) {
  const payer = entry.address?.toLowerCase();
  const d = listDelegations().find((x) => x.childAddress?.toLowerCase() === payer);
  if (!d) return { delegation: null, consents: [] };
  return {
    delegation: {
      id: d.id,
      parentAddress: d.parentAddress,
      childAddress: d.childAddress,
      capUSD: d.capUSD,
      label: d.label ?? null,
      allowedTools: d.allowedTools ?? null,
      allowedChains: d.allowedChains ?? null,
      allowedPayees: d.allowedPayees ?? null,
      revokedAt: d.revokedAt ?? null,
    },
    consents: consentsForDelegation(d.id).map((c) => ({
      action: c.action,
      ts: c.ts,
      message: c.message,
      signature: c.signature,
      signer: c.signer,
    })),
  };
}

function digestOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function buildEvidencePack(entryHash) {
  const found = findEntry(entryHash);
  if (!found) {
    return {
      ok: false,
      code: "entry_not_found",
      reason: `no ledger entry with hash ${entryHash}`,
      suggestion: "use the entryHash from GET /api/ledger — receiptId and index are not stable identifiers for a dispute",
    };
  }
  const { entry, index, ledger } = found;

  // Chain position is the anti-backdating argument: the disputed entry is
  // pinned between two hashes, so it cannot have been inserted later without
  // breaking every entry after it.
  const chain = verifyLedgerChain();
  const position = {
    index,
    ledgerLength: ledger.length,
    prevHash: entry.prevHash ?? null,
    entryHash: entry.entryHash,
    nextHash: ledger[index + 1]?.entryHash ?? null,
    chainValid: chain.valid,
    chainBrokenAt: chain.brokenAt,
  };

  const { delegation, consents } = delegationFor(entry);
  const approval = approvalFor(entry);
  const currentPolicyHash = policyHash();
  const atSpendPolicyHash = entry.policyHash ?? null;

  const bundle = {
    schema: "spendveto.dispute-evidence.v1",
    generatedAt: new Date().toISOString(),
    disputed: {
      entryHash: entry.entryHash,
      ts: entry.ts,
      payer: entry.address,
      payee: entry.payTo ?? null,
      resource: entry.resource,
      amountUSD: Number(entry.amount),
      chain: entry.chain ?? null,
      category: entry.category ?? null,
      status: entry.status,
      reason: entry.reason ?? null,
    },
    receipt: normalizeReceipt(entry),
    position,
    policy: {
      hashAtSpend: atSpendPolicyHash,
      hashNow: currentPolicyHash,
      // Disclosed, never hidden: if policy changed since the spend, the
      // defence is about the policy that was actually in force, and a reader
      // is entitled to know they are not the same document.
      unchangedSinceSpend: atSpendPolicyHash != null && atSpendPolicyHash === currentPolicyHash,
    },
    humanApproval: approval,
    delegation,
    consents,
    counterparty: entry.payTo ? { payee: entry.payTo, payerTrustScore: trustScoreFor(entry.address) } : null,
    // Said out loud, inside the artifact, so it travels with it.
    doesNotEstablish: [
      "that goods or services were delivered",
      "that the human was satisfied with the outcome",
      "that the policy in force was appropriate — only that it was in force and was applied",
      "identity of the human behind the delegation beyond the signed consent records included here",
    ],
  };

  // Sign the bundle itself, so a pack that is edited in transit stops
  // verifying — the same key that signs receipts, verdicts and consents.
  const bundleHash = digestOf(bundle);
  const signed = await signDecision({
    id: `dispute:${entry.entryHash.slice(0, 16)}:${bundleHash.slice(0, 16)}`,
    agent: entry.address,
    amountUSD: Number(entry.amount),
    payee: entry.payTo ?? null,
    verdict: "evidence",
    ts: bundle.generatedAt,
  });

  return { ok: true, ...bundle, bundleHash, attestation: signed };
}

// Re-verify a pack someone hands back: does its content still digest to the
// hash the attestation was issued over?
export function checkEvidencePack(pack) {
  if (!pack || typeof pack !== "object") return { ok: false, code: "pack_missing", reason: "no evidence pack supplied" };
  const { ok: _ok, bundleHash, attestation, ...bundle } = pack;
  if (!bundleHash || !attestation) return { ok: false, code: "pack_unsigned", reason: "pack carries no bundleHash/attestation to check" };
  const recomputed = digestOf(bundle);
  if (recomputed !== bundleHash) {
    return { ok: false, code: "pack_tampered", reason: `pack content digests to ${recomputed.slice(0, 16)}… but claims ${String(bundleHash).slice(0, 16)}…`, recomputed };
  }
  return { ok: true, bundleHash: recomputed, signer: attestation.signer, message: attestation.message, signature: attestation.signature };
}
