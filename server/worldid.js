// World ID gating for human-in-the-loop approvals (control #33): the approval
// queue (server/approvals.js) trusts that whoever clicks Approve/Deny on the
// dashboard is a real, distinct human — but a dashboard session alone proves
// nothing about who (or what) is on the other end of that click. This module
// lets a policy require a verified World ID proof-of-personhood alongside the
// decision, so "approved" means "a real, unique human approved this," not
// just "someone with dashboard access clicked a button."
//
// Protocol: World ID 4.0 (the RP-based `/api/v4/verify/:rpId` flow, not the
// retired v2 app_id-keyed API). 4.0 adds one requirement 2.0 didn't have: an
// RP signature. The widget refuses to even open a proof request unless the
// backend first hands it a signed { nonce, created_at, expires_at, signature }
// bundle proving the request really came from this server and not something
// impersonating it — see `rpContextFor`, called from GET /api/worldid/rp-context.
// The signing key never leaves this process.
//
// Same honesty rule as rails/index.js's roadmap rails: without real
// credentials configured, this refuses outright — it never fakes a "verified"
// result. A declared slot that refuses honestly, not a stub that pretends.
import { signRequest } from "@worldcoin/idkit-server";

// Read lazily, not at module top level: with ES modules, an imported
// module's top-level code runs during the import phase — before the
// IMPORTING file's own later statements, including its `dotenv.config()`
// call. A top-level `const X = process.env.X` here would capture
// `undefined` even when .env.local genuinely has the value, because dotenv
// hasn't populated process.env yet at the moment this module's body runs.
// (This was a real, previously dormant bug in this exact module — nobody had
// configured WORLD_APP_ID for an actual run before, so it never surfaced.)
export const WORLD_ACTION = () => process.env.WORLD_ACTION || "spendveto-approval";

export function worldIdConfigured() {
  return Boolean(process.env.WORLD_RP_ID && process.env.WORLD_RP_SIGNING_KEY);
}

// The signed bundle the client-side widget (IDKit) needs before it can even
// open a proof request. TTL default (300s) matches the SDK's own default —
// long enough for a human to open World App and scan, short enough that a
// leaked rp_context can't be replayed hours later.
export function rpContextFor(action = WORLD_ACTION()) {
  if (!worldIdConfigured()) return null;
  const sig = signRequest({ signingKeyHex: process.env.WORLD_RP_SIGNING_KEY, action });
  return { rp_id: process.env.WORLD_RP_ID, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig };
}

// Verifies a completed IDKit proof against World's real v4 Verify API.
// `result` is forwarded essentially as-is (whatever IDKit's
// request.pollUntilCompletion() handed the client) — this module doesn't
// reshape it, because the Developer Portal is the authority on the protocol's
// exact wire shape (protocol_version 3.0 vs 4.0 payloads differ) and
// reconstructing that shape by hand here would be exactly the kind of
// "declared control that's actually a stub" this codebase refuses to ship.
// Returns { verified: true, nullifier } on success, or
// { verified: false, reason } on any failure — including "not configured,"
// which is itself an honest, structured refusal rather than a thrown error.
export async function verifyWorldIdProof(result) {
  if (!worldIdConfigured()) {
    return { verified: false, reason: "world_id_not_configured" };
  }
  if (!result || typeof result !== "object") {
    return { verified: false, reason: "world_id_proof_malformed" };
  }
  try {
    const res = await fetch(`https://developer.worldcoin.org/api/v4/verify/${process.env.WORLD_RP_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      return { verified: false, reason: body.code || `world_id_api_${res.status}`, detail: body };
    }
    return { verified: true, nullifier: body.nullifier || body.session_id || null, action: body.action, detail: body };
  } catch (err) {
    return { verified: false, reason: "world_id_api_unreachable" };
  }
}
