// UPI mandate governance (India), buyer side.
//
// NPCI is developing a Unified Agent Protocol to let registered AI agents pay on UPI; it builds on UPI Circle's
// delegated payments and needs RBI approval before launch (reported Sept 2026, not live). NPCI's own framing at GFF
// 2026: "decision making and execution must remain separate" and "AI may recommend, but authentication and final
// settlement must follow deterministic auditable rules". That is exactly this module's shape.
//
// What it does: given a UPI mandate an agent wants to debit, decide allow / requires_approval / deny with
// deterministic rules drawn from the RBI Digital Payments E-mandate Framework, 2026 (issued 21 Apr 2026; cards, PPIs
// and UPI): AFA on the first debit, AFA above Rs 15,000 per recurring debit (Rs 1,00,000 for insurance, mutual
// funds and credit-card bills), a pre-debit notification at least 24 h before each recurring debit (FASTag and NCMC
// exempt), and the customer's right to withdraw a mandate.
//
// What it is NOT: it does not initiate, collect, or settle anything on UPI, it is not a payment aggregator or PSP,
// and it claims no NPCI/RBI approval or certification. "Requires approval" here means a HUMAN completes the
// customer's authentication — the agent can never approve its own debit. The thresholds are re-verified against the
// framework text by the operator before production use; they are defaults, listed below, never silent.
//
// Currency is INR end to end: nothing here converts to USD, because an FX guess inside a spend gate is a bug.

export const RBI_AFA_FREE_LIMIT_INR = 15000;
export const RBI_SPECIAL_CATEGORY_LIMIT_INR = 100000;
export const RBI_SPECIAL_CATEGORIES = ["insurance", "mutual_fund", "credit_card_bill"];
export const PREDEBIT_NOTICE_MS = 24 * 60 * 60 * 1000;
export const PREDEBIT_EXEMPT_CATEGORIES = ["fastag", "ncmc"];

const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

const fail = (code, reason, suggestion) => ({ decision: "deny", code, reason, suggestion });
const needsHuman = (code, reason) => ({ decision: "requires_approval", code, reason, afa: { required: true, by: "human" } });

// The VPA is personal data (DPDP Act, 2023): decisions and logs carry a masked form, never the raw handle.
export function maskVpa(vpa) {
  if (typeof vpa !== "string" || !vpa.includes("@")) return null;
  const [name, handle] = vpa.split("@");
  return `${name.slice(0, 2)}***@${handle}`;
}

// Pure and deterministic: no clock reads except through `now`, no I/O. policy = the `upi` section of the policy
// file ({ maxPerTxnINR, maxPerDayINR, allowedPayeeVpas, allowedCategories }); spentTodayINR is the evaluator's own tally.
export function evaluateUpiMandate(mandate, { policy = {}, spentTodayINR = 0, now = Date.now() } = {}) {
  if (!mandate || typeof mandate !== "object") return fail("mandate_missing", "no UPI mandate supplied", "send the mandate the agent wants to debit");
  const amount = Number(mandate.amountINR);
  if (!(amount > 0) || Math.round(amount * 100) / 100 !== amount) {
    return fail("amount_invalid", "amountINR must be a positive rupee amount with at most 2 decimals (paise)", "send the debit amount in INR, e.g. 499.00");
  }
  if (!VPA.test(mandate.payeeVpa || "")) return fail("payee_vpa_invalid", "payeeVpa must look like name@handle", "send the merchant's UPI VPA, e.g. netflix@okhdfc");

  // The customer's withdrawal right is absolute: a revoked or lapsed mandate carries no authority, whatever the amount.
  if (mandate.revoked) return fail("mandate_revoked", "the customer has withdrawn this mandate", "stop — a withdrawn mandate cannot be debited; ask the customer to register a new one");
  if (mandate.expiresAt && Date.parse(mandate.expiresAt) < now) return fail("mandate_expired", `mandate expired at ${mandate.expiresAt}`, "ask the customer to renew the mandate");

  const category = mandate.category || null;
  if (Array.isArray(policy.allowedPayeeVpas) && policy.allowedPayeeVpas.length && !policy.allowedPayeeVpas.map((v) => v.toLowerCase()).includes(mandate.payeeVpa.toLowerCase())) {
    return fail("payee_not_allowed", "this payee VPA is not on the allowlist", "debit only allowlisted merchants, or add this payee to policy.upi.allowedPayeeVpas");
  }
  if (Array.isArray(policy.allowedCategories) && policy.allowedCategories.length && !policy.allowedCategories.includes(category)) {
    return fail("category_not_allowed", `category "${category}" is outside the allowed categories`, "debit only inside allowed categories");
  }

  const recurring = mandate.recurring !== false;
  if (recurring && !PREDEBIT_EXEMPT_CATEGORIES.includes(category)) {
    const debitAt = mandate.debitAt ? Date.parse(mandate.debitAt) : now;
    if (!mandate.notifiedAt) return fail("predebit_notice_missing", "no pre-debit notification on record for this recurring debit", "notify the customer at least 24 hours before the debit date (RBI e-mandate framework)");
    if (debitAt - Date.parse(mandate.notifiedAt) < PREDEBIT_NOTICE_MS) return fail("predebit_notice_late", "the customer was notified less than 24 hours before this debit", "reschedule the debit to at least 24 hours after the notification");
  }

  if (Number(policy.maxPerTxnINR) > 0 && amount > Number(policy.maxPerTxnINR)) {
    return fail("txn_cap", `Rs ${amount} exceeds the per-debit cap of Rs ${policy.maxPerTxnINR}`, "debit a smaller amount or raise policy.upi.maxPerTxnINR");
  }
  if (Number(policy.maxPerDayINR) > 0 && spentTodayINR + amount > Number(policy.maxPerDayINR)) {
    return fail("day_cap", `Rs ${amount} would take today's total to Rs ${spentTodayINR + amount}, over the Rs ${policy.maxPerDayINR} daily cap`, "wait for the daily window or raise policy.upi.maxPerDayINR");
  }

  // Authentication: always a human. Non-recurring agent-initiated payments have no standing authority (UPI Circle
  // delegation for agents is not finalised), so each one needs the customer's own authentication.
  if (!recurring) return needsHuman("afa_one_time", "a one-time UPI payment needs the customer's own authentication; an agent cannot supply it");
  if (mandate.firstDebit) return needsHuman("afa_first_debit", "the first debit of a mandate always needs additional factor authentication (RBI e-mandate framework)");
  const limit = RBI_SPECIAL_CATEGORIES.includes(category) ? RBI_SPECIAL_CATEGORY_LIMIT_INR : RBI_AFA_FREE_LIMIT_INR;
  if (amount > limit) return needsHuman("afa_above_limit", `Rs ${amount} is above the Rs ${limit} AFA-free limit for this category`);

  return { decision: "allow", reason: "within the RBI AFA-free limit, notified, and inside operator policy" };
}

export const UPI_REGULATORY_BASIS = [
  "RBI Digital Payments E-mandate Framework, 2026 (issued 21 Apr 2026): AFA at registration and first debit; AFA-free recurring debits up to Rs 15,000 (Rs 1,00,000 for insurance, mutual funds, credit-card bills); pre-debit notification >= 24 h; customer withdrawal right",
  "NPCI (GFF 2026): decision-making and execution stay separate; AI may recommend, authentication and settlement follow deterministic auditable rules",
];

export const UPI_DISCLAIMER =
  "Evaluator only: SpendVeto does not initiate, collect or settle UPI payments, is not a payment aggregator/PSP, and claims no NPCI or RBI approval. NPCI's Unified Agent Protocol is not live; thresholds are the RBI framework's published defaults, to be re-verified by the operator.";
