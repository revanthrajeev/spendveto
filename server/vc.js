// Wraps an already ECDSA-signed SpendVeto decision (server/simulate.js
// signDecision) in a W3C Verifiable-Credential-SHAPED envelope, so an AP2
// verdict can be handed to any VC-aware verifier rather than only a client
// that already knows SpendVeto's own message format.
//
// Honesty note (same spirit as CONTROLS.md): this is NOT a registered DID
// method or a standard JSON-LD proof suite — `did:ethr` here is just an
// address prefix and the proof `type` is our own label, not a suite anyone
// else's verifier auto-recognizes. What IS real and independently checkable:
// `proof.message` + `proof.proofValue` reproduce exactly the same
// `personal_sign` payload/signature `POST /api/ap2/evaluate` already returns
// unwrapped, verifiable with `verifyMessage` (viem) or any ECDSA library —
// the VC layer is packaging, not a new trust claim.
export function toVerifiableCredential({ mandate, decision, reason, code, ts, message, signature, signer }) {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://spendveto.com/contexts/spend-verdict/v1"],
    type: ["VerifiableCredential", "SpendVetoSpendVerdictCredential"],
    issuer: `did:ethr:${signer}`,
    issuanceDate: ts,
    credentialSubject: {
      id: `did:ethr:${mandate.agent}`,
      mandate,
      decision,
      reason,
      ...(code ? { code } : {}),
    },
    proof: {
      type: "SpendVetoEcdsaPersonalSign2026", // our own label — see honesty note above
      created: ts,
      verificationMethod: `did:ethr:${signer}#controller`,
      proofPurpose: "assertionMethod",
      message,
      proofValue: signature,
    },
  };
}
