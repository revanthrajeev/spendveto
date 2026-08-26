// World ID gating for human-in-the-loop approvals (control #33): the approval
// queue (server/approvals.js) trusts that whoever clicks Approve/Deny on the
// dashboard is a real, distinct human — but a dashboard session alone proves
// nothing about who (or what) is on the other end of that click. This module
// lets a policy require a verified World ID proof-of-personhood alongside the
// decision, so "approved" means "a real, unique human approved this," not
// just "someone with dashboard access clicked a button."
//
// Same honesty rule as rails/index.js's roadmap rails: without real World ID
// app credentials configured, this refuses outright — it never fakes a
// "verified" result. A declared slot that refuses honestly, not a stub that
// pretends.
const WORLD_APP_ID = process.env.WORLD_APP_ID;
const WORLD_ACTION = process.env.WORLD_ACTION || "spendveto-approval";

export function worldIdConfigured() {
  return Boolean(WORLD_APP_ID);
}

// Verifies a World ID proof against World's real Cloud Verify API. Returns
// { verified: true, nullifier_hash } on success, or
// { verified: false, reason } on any failure — including "not configured,"
// which is itself an honest, structured refusal rather than a thrown error.
export async function verifyWorldIdProof(proof) {
  if (!WORLD_APP_ID) {
    return { verified: false, reason: "world_id_not_configured" };
  }
  if (!proof || !proof.merkle_root || !proof.nullifier_hash || !proof.proof) {
    return { verified: false, reason: "world_id_proof_malformed" };
  }
  try {
    const res = await fetch(`https://developer.worldcoin.org/api/v2/verify/${WORLD_APP_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nullifier_hash: proof.nullifier_hash,
        merkle_root: proof.merkle_root,
        proof: proof.proof,
        verification_level: proof.verification_level || "orb",
        action: WORLD_ACTION,
        signal: proof.signal || "",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { verified: false, reason: body.code || `world_id_api_${res.status}` };
    }
    const body = await res.json();
    return { verified: true, nullifier_hash: proof.nullifier_hash, detail: body };
  } catch (err) {
    return { verified: false, reason: "world_id_api_unreachable" };
  }
}
