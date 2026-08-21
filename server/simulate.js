import { randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getSimBalance, debitSimBalance, appendLedgerEntry } from "./ledger.js";
import { findActiveFreeze } from "./freezes.js";
import { maybeFreezeForBurst } from "./anomaly.js";
import { findApprovableFor, consumeApproval } from "./approvals.js";
import { checkPolicy, policyHash } from "../client/policy.js";
import { sendUsageEvent } from "./billing.js";
import { getShadowPolicy, recordShadowObservation } from "./shadow.js";
import { DEFAULT_CHAIN, findChain } from "../shared-config.js";

const NONCE_TTL_MS = 5 * 60 * 1000;
const nonces = new Map(); // nonce -> { expires, used }

const PAYOUT_ADDRESS = process.env.SERVER_PAYOUT_ADDRESS || "0x000000000000000000000000000000000000dEaD";

// Receipt signer: every settlement is ECDSA-signed by the server, so a receipt
// can be verified by anyone later — an audit trail that doesn't rely on
// trusting the ledger file. Persistent if SERVER_SIGNER_KEY is set.
const receiptSigner = privateKeyToAccount(process.env.SERVER_SIGNER_KEY || generatePrivateKey());

export function receiptMessage({ receiptId, payer, resource, price, chain }) {
  return `spendveto-receipt:${receiptId}:${payer}:${resource}:${price}:${chain}`;
}

// Signed decision traces: the same server key that signs settlement receipts
// also signs governance verdicts, so a policy decision (e.g. an AP2-style
// mandate evaluation) is portable evidence — anyone can verify later that THIS
// SpendVeto produced THIS verdict for THIS mandate, without trusting a log file.
export function decisionMessage({ id, agent, amountUSD, payee, verdict, ts }) {
  return `spendveto-decision:${id || "-"}:${agent}:${amountUSD}:${payee || "-"}:${verdict}:${ts}`;
}

export async function signDecision(fields) {
  const message = decisionMessage(fields);
  const signature = await receiptSigner.signMessage({ message });
  return { message, signature, signer: receiptSigner.address };
}

// Same key, third kind of portable evidence: a signed consent record for a
// delegation grant or revoke (server/consents.js) — Visa Trusted Agent
// Protocol's "signed consent record, independently verifiable" pattern.
export function consentMessage({ id, parentAddress, childAddress, capUSD, scope, action, ts }) {
  return `spendveto-consent:${id}:${parentAddress}:${childAddress}:${capUSD}:${scope}:${action}:${ts}`;
}

export async function signConsent(fields) {
  const message = consentMessage(fields);
  const signature = await receiptSigner.signMessage({ message });
  return { message, signature, signer: receiptSigner.address };
}

function issueChallenge(tool, reason) {
  const nonce = randomUUID();
  nonces.set(nonce, { expires: Date.now() + NONCE_TTL_MS, used: false });
  return {
    x402Version: 1,
    scheme: "exact-simulated",
    network: "base-sepolia-simulated",
    price: tool.price,
    currency: "USDC",
    resource: tool.path,
    payTo: PAYOUT_ADDRESS,
    nonce,
    ...(reason ? { reason } : {}),
  };
}

function parsePaymentHeader(header) {
  // "0xAddress:nonce-uuid[:chain-id]:0xSignature" — signature is the last
  // segment (hex, no colons); the first is the address; a UUID nonce follows;
  // an optional chain id sits between nonce and signature. Three-part headers
  // (no chain) settle on the default chain, so pre-multichain clients and the
  // raw-handshake tests keep working unchanged.
  const parts = header.split(":");
  if (parts.length < 3 || parts.length > 4) return null;
  const [address, nonce, maybeChain, maybeSig] = parts;
  const chain = parts.length === 4 ? maybeChain : DEFAULT_CHAIN;
  const signature = parts.length === 4 ? maybeSig : maybeChain;
  const chainDeclared = parts.length === 4;
  if (!address || !nonce || !chain || !signature) return null;
  return { address, nonce, chain, chainDeclared, signature };
}

// Express handler factory for the simulated x402 flow, one per catalog tool:
// real ECDSA signature over a server-issued nonce, verified with viem;
// settlement against an off-chain per-address balance instead of an on-chain
// USDC transfer.
export function createSimulateGate(tool) {
  return async function simulatePaymentGate(req, res, next) {
    const header = req.get("X-SIM-PAYMENT");

    if (!header) {
      return res.status(402).json(issueChallenge(tool));
    }

    const parsed = parsePaymentHeader(header);
    if (!parsed) {
      return res.status(402).json(issueChallenge(tool, "malformed_payment_header"));
    }

    const { address, nonce, chain, chainDeclared, signature } = parsed;

    // The chain must be one we've registered — an unknown chain is refused
    // before any signature work.
    if (!findChain(chain)) {
      return res.status(402).json(issueChallenge(tool, `unknown_chain:${chain}`));
    }

    // Defense in depth: the freeze is primarily enforced in the client's own
    // policy check, but a client that skips its policy engine still gets
    // refused here. 403, not 402 — a fresh challenge would invite a retry.
    const frozen = findActiveFreeze(address);
    if (frozen) {
      appendLedgerEntry({ address, resource: tool.path, amount: tool.price, chain, status: "failed", mode: "simulate", reason: `wallet frozen: ${frozen.reason}` });
      return res.status(403).json({ error: "wallet_frozen", reason: frozen.reason });
    }

    const entry = nonces.get(nonce);
    if (!entry || entry.used || entry.expires < Date.now()) {
      return res.status(402).json(issueChallenge(tool, "nonce_invalid_or_expired"));
    }

    // The chain is inside the signed message when declared, so a relay can't
    // move a payment authorization from one chain's balance to another's.
    const message = chainDeclared
      ? `${nonce}:${tool.path}:${tool.price}:${chain}`
      : `${nonce}:${tool.path}:${tool.price}`;
    let signatureValid = false;
    try {
      signatureValid = await verifyMessage({ address, message, signature });
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      return res.status(402).json(issueChallenge(tool, "invalid_signature"));
    }
    entry.used = true;

    // Server-authoritative enforcement (issue #8). Until now the gate only
    // checked freeze + nonce + signature + balance, so a key-holding agent
    // running a hand-rolled client that skipped its own policy check could
    // push a validly-signed over-budget (or above-approval-threshold) payment
    // straight through. The gate now runs the SAME governance pipeline the
    // client library runs — server-side, where the agent can't skip it — so
    // budgets, delegation caps, scopes, chain rules, and the approval
    // requirement are enforced by the party holding the money, not the party
    // spending it. checkPolicy reads the server's own ledger/freezes/
    // delegations (over localhost today; issue #9 moves it behind a Store),
    // so it is the single source of truth shared with the client's preflight.
    let policyVerdict;
    try {
      // Payee = the tool's declared recipient if it has one (external/
      // marketplace vendors), else undefined (first-party catalog tools, which
      // the payee allowlist deliberately doesn't restrict — tool scope does).
      policyVerdict = await checkPolicy(address, tool.price, tool.id, chain, tool.category, tool.payTo);
    } catch {
      policyVerdict = { allowed: true }; // policy backend unreachable: fall back to the pre-#8 gate behaviour rather than hard-failing settlement
    }

    // Shadow mode: if a candidate policy is active, evaluate this same call
    // against it (same delegations/freezes/spend history, different policy) and
    // record what it WOULD have decided — without enforcing it. This is what
    // lets a team measure a policy change against live traffic before promoting
    // it. Never affects the live decision below.
    const shadowPolicy = getShadowPolicy();
    if (shadowPolicy) {
      try {
        const shadowVerdict = await checkPolicy(address, tool.price, tool.id, chain, tool.category, tool.payTo, shadowPolicy);
        recordShadowObservation({
          address,
          resource: tool.path,
          price: tool.price,
          liveAllowed: policyVerdict.allowed,
          shadowAllowed: shadowVerdict.allowed,
          shadowReason: shadowVerdict.reason,
        });
      } catch {
        // shadow evaluation is best-effort; never let it disturb settlement
      }
    }
    if (!policyVerdict.allowed) {
      appendLedgerEntry({ address, resource: tool.path, amount: tool.price, chain, ...(tool.category ? { category: tool.category } : {}), ...(tool.payTo ? { payTo: tool.payTo } : {}), status: "blocked", mode: "simulate", reason: `gate policy: ${policyVerdict.reason}`, policyHash: policyHash() });
      return res.status(402).json(issueChallenge(tool, policyVerdict.code || "policy_denied"));
    }
    // An above-threshold spend must be backed by a real, approved,
    // not-yet-consumed approval record — settling one requires proof a human
    // signed off, and that approval is single-use (see consumeApproval).
    if (policyVerdict.requiresApproval) {
      const approval = findApprovableFor(address, tool.path, tool.price);
      if (!approval) {
        appendLedgerEntry({ address, resource: tool.path, amount: tool.price, chain, ...(tool.category ? { category: tool.category } : {}), status: "blocked", mode: "simulate", reason: "gate policy: spend requires human approval — no approved authorization on record", policyHash: policyHash() });
        return res.status(402).json(issueChallenge(tool, "approval_required"));
      }
      consumeApproval(approval.id);
    }

    const balance = getSimBalance(address, chain);
    if (balance < Number(tool.price)) {
      appendLedgerEntry({
        address,
        resource: tool.path,
        amount: tool.price,
        chain,
        status: "failed",
        mode: "simulate",
        reason: `insufficient simulated balance on ${chain} ($${balance.toFixed(2)} < $${tool.price})`,
      });
      maybeFreezeForBurst(address);
      return res.status(402).json(issueChallenge(tool, "insufficient_balance"));
    }

    const remainingBalance = debitSimBalance(address, Number(tool.price), chain);
    const receiptId = randomUUID();
    const paidEntry = { address, resource: tool.path, amount: tool.price, chain, ...(tool.category ? { category: tool.category } : {}), ...(tool.payTo ? { payTo: tool.payTo } : {}), status: "paid", mode: "simulate", receiptId, policyHash: policyHash() };
    appendLedgerEntry(paidEntry);
    sendUsageEvent({ ...paidEntry, toolId: tool.id });
    maybeFreezeForBurst(address);
    const receiptSignature = await receiptSigner.signMessage({
      message: receiptMessage({ receiptId, payer: address, resource: tool.path, price: tool.price, chain }),
    });
    res.locals.settlement = {
      amount: tool.price,
      currency: "USDC",
      chain,
      remainingBalance,
      mode: "simulate",
      receiptId,
      signedBy: receiptSigner.address,
      signature: receiptSignature,
    };
    res.set("X-PAYMENT-RESPONSE", JSON.stringify(res.locals.settlement));
    next();
  };
}
