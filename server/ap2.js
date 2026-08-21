// AP2 mandate-chain governance.
//
// AP2 v0.2.0 models a purchase as a chain, not one flat charge: an Intent
// Mandate (what the human authorized, signed up front — the only authority
// that exists in "human not present" flows), then a Cart Mandate (what the
// agent actually assembled). SpendVeto's older /api/ap2/evaluate judged a
// single amount, which cannot see the failure mode the chain exists to catch:
// an agent whose cart quietly drifts away from the intent it was granted —
// a different merchant, an out-of-scope category, a total that doesn't match
// the items it claims to be for.
//
// Everything here is deterministic and local; no LLM judges the drift.

const round = (n) => Math.round(n * 1e6) / 1e6;

function fail(code, reason, suggestion) {
  return { ok: false, code, reason, suggestion };
}

// Does this cart still represent the intent the human signed?
// Ordered cheapest-and-most-fundamental first, so the returned code names the
// root problem rather than a downstream symptom of it.
export function checkCartAgainstIntent(intent, cart) {
  if (!intent || typeof intent !== "object") return fail("intent_missing", "no intent mandate supplied", "send the signed intent mandate the human authorized alongside the cart");
  if (!cart || typeof cart !== "object") return fail("cart_missing", "no cart mandate supplied", "send the cart mandate the agent assembled");

  if (intent.expiresAt && Date.parse(intent.expiresAt) < Date.now()) {
    return fail("intent_expired", `intent mandate expired at ${intent.expiresAt}`, "ask the human to authorize a fresh intent mandate; an expired one grants no authority");
  }
  if (cart.intentId && intent.id && cart.intentId !== intent.id) {
    return fail("cart_intent_mismatch", `cart claims intent "${cart.intentId}" but the intent supplied is "${intent.id}"`, "send the cart together with the intent mandate it was actually derived from");
  }

  const items = Array.isArray(cart.items) ? cart.items : [];
  if (items.length === 0) return fail("cart_empty", "cart mandate has no items", "assemble the cart before asking for a verdict");

  // The agent declares a total AND the items behind it. If they disagree, the
  // declared total is not evidence of anything — check the arithmetic before
  // checking the amount against any cap, or the cap check is meaningless.
  const computed = round(items.reduce((s, it) => s + Number(it.amountUSD || 0) * (Number(it.qty) || 1), 0));
  const declared = round(Number(cart.totalUSD));
  if (!(declared > 0)) return fail("cart_total_invalid", "cart totalUSD must be a positive number", "set totalUSD to the sum of the cart's items");
  if (Math.abs(computed - declared) > 1e-6) {
    return fail("cart_total_mismatch", `cart declares $${declared} but its items sum to $${computed}`, "recompute totalUSD from the cart's own items — a declared total that doesn't match the items is not authorizable");
  }

  const maxAmount = Number(intent.maxAmountUSD);
  if (maxAmount > 0 && computed > maxAmount) {
    return fail("cart_exceeds_intent", `cart total $${computed} exceeds the intent's authorized maximum $${maxAmount}`, `reduce the cart to $${maxAmount} or less, or ask the human to authorize a new intent with a higher maximum`);
  }

  const merchants = [...new Set(items.map((it) => it.merchant).filter(Boolean))];

  if (Array.isArray(intent.allowedMerchants) && intent.allowedMerchants.length > 0) {
    const stray = merchants.find((m) => !intent.allowedMerchants.includes(m));
    if (stray) {
      return fail("merchant_drift", `cart includes merchant "${stray}", which the intent did not authorize (allowed: ${intent.allowedMerchants.join(", ")})`, `drop the items from "${stray}", or ask the human for an intent that authorizes it`);
    }
  }

  if (Array.isArray(intent.allowedCategories) && intent.allowedCategories.length > 0) {
    const strayItem = items.find((it) => it.category && !intent.allowedCategories.includes(it.category));
    if (strayItem) {
      return fail("category_drift", `cart item "${strayItem.sku || strayItem.category}" is in category "${strayItem.category}", which the intent did not authorize (allowed: ${intent.allowedCategories.join(", ")})`, `drop the out-of-scope item, or ask the human for an intent covering "${strayItem.category}"`);
    }
  }

  // Multi-merchant spray: one authorization fanned out across many sellers is
  // a documented agent-compromise signature, so the intent may cap how wide a
  // single cart is allowed to spread even when every merchant is allowlisted.
  const maxMerchants = Number(intent.maxMerchants);
  if (maxMerchants > 0 && merchants.length > maxMerchants) {
    return fail("multi_merchant_spray", `cart spans ${merchants.length} merchants but the intent authorizes at most ${maxMerchants}`, `split this into separate carts, or ask the human for an intent with a higher maxMerchants`);
  }

  return { ok: true, totalUSD: computed, merchants, itemCount: items.length };
}

// Human-not-present reconciliation.
//
// In an HNP flow there is, by definition, nobody to page — so a
// "requires_approval" verdict is not a pause, it's an unanswerable question.
// AP2's answer is that the signed intent mandate IS the human's advance
// authorization, standing in for the live approval it makes impossible. So:
// within the intent's authorized maximum the pre-authorization holds and the
// call proceeds; above it there is no authority and nothing to ask, so it
// fails closed. Never silently converts an over-intent spend into an allow.
export function reconcileHumanNotPresent({ verdict, intent, totalUSD }) {
  if (!verdict.allowed || !verdict.requiresApproval) return { verdict, preAuthorized: false };
  if (intent?.humanPresent !== false) return { verdict, preAuthorized: false };

  const maxAmount = Number(intent.maxAmountUSD);
  if (maxAmount > 0 && totalUSD <= maxAmount) {
    return {
      verdict: { ...verdict, requiresApproval: false },
      preAuthorized: true,
      note: `human-not-present: $${totalUSD} is covered by the intent mandate's pre-authorized maximum $${maxAmount}, which stands in for the live approval this flow cannot obtain`,
    };
  }
  return {
    verdict: {
      allowed: false,
      code: "hnp_no_authority",
      reason: `human-not-present flow needs approval for $${totalUSD}, but the intent mandate pre-authorizes only $${maxAmount || 0} and no human can be asked`,
      suggestion: "reduce the cart within the intent's authorized maximum, or have a human sign a new intent mandate covering this amount",
      policy: verdict.policy,
    },
    preAuthorized: false,
  };
}
