// ACP (Agentic Commerce Protocol) checkout governance.
//
// ACP — Apache-2.0, co-maintained by OpenAI and Stripe — standardizes how an
// agent runs checkout against a merchant it does not own. Its Delegated
// Payments Spec issues a Shared Payment Token (SPT): a scoped, bearer
// credential that lets an agent initiate a payment without ever seeing the
// buyer's card. The SPT is minted for a purpose — an amount ceiling, a
// merchant, a window — and then the agent goes off and assembles a checkout
// session on its own.
//
// That gap between "what the token was minted for" and "what the agent
// actually put in the cart" is the buyer-side hole, and it is the same shape
// as the AP2 intent→cart drift this codebase already governs (server/ap2.js):
// the merchant validates the token, not the shopping. A bearer credential
// scoped to $200 at one merchant will happily clear $200 of the wrong goods.
//
// So this module asks the one question the protocol does not: is this session
// still the purchase the token was issued for? Deterministic and local — no
// LLM judges the drift, and nothing here mints, validates, or settles an SPT.
// SpendVeto is the buyer's gate in front of ACP, never an ACP processor.

const round = (n) => Math.round(n * 1e6) / 1e6;

function fail(code, reason, suggestion) {
  return { ok: false, code, reason, suggestion };
}

// Ordered cheapest-and-most-fundamental first, so the code names the root
// problem rather than a downstream symptom of it.
export function checkSessionAgainstToken(token, session) {
  if (!token || typeof token !== "object") return fail("spt_missing", "no shared payment token supplied", "send the SPT the session intends to charge — a session with no token authorizes nothing");
  if (!session || typeof session !== "object") return fail("session_missing", "no checkout session supplied", "send the checkout session the agent assembled");

  if (token.expiresAt && Date.parse(token.expiresAt) < Date.now()) {
    return fail("spt_expired", `shared payment token expired at ${token.expiresAt}`, "mint a fresh SPT; an expired token carries no authority no matter what the session says");
  }
  if (session.tokenId && token.id && session.tokenId !== token.id) {
    return fail("spt_session_mismatch", `session claims token "${session.tokenId}" but the token supplied is "${token.id}"`, "send the session together with the SPT it was actually assembled against");
  }

  const items = Array.isArray(session.items) ? session.items : [];
  if (items.length === 0) return fail("session_empty", "checkout session has no line items", "assemble the session before asking for a verdict");

  // ACP sessions declare their own totals. A declared total that its own line
  // items don't justify is not evidence of anything, so check the arithmetic
  // before checking the amount against any ceiling — otherwise the ceiling
  // check is measuring a number the agent simply asserted.
  const computed = round(items.reduce((s, it) => s + Number(it.amountUSD || 0) * (Number(it.qty) || 1), 0));
  const declared = round(Number(session.totalUSD));
  if (!(declared > 0)) return fail("session_total_invalid", "session totalUSD must be a positive number", "set totalUSD to the sum of the session's line items");
  if (Math.abs(computed - declared) > 1e-6) {
    return fail("session_total_mismatch", `session declares $${declared} but its line items sum to $${computed}`, "recompute totalUSD from the session's own items — a declared total that doesn't match the items is not authorizable");
  }

  const ceiling = Number(token.maxAmountUSD);
  if (ceiling > 0 && computed > ceiling) {
    return fail("session_exceeds_spt", `session total $${computed} exceeds the token's authorized maximum $${ceiling}`, `reduce the session to $${ceiling} or less, or mint an SPT that covers this amount`);
  }

  // An SPT is minted for one merchant. A session that spends it somewhere else
  // is the exact failure a bearer credential cannot catch on its own.
  if (token.merchant) {
    const strays = [...new Set(items.map((it) => it.merchant).filter((m) => m && m !== token.merchant))];
    if (strays.length > 0) {
      return fail("spt_merchant_drift", `session charges merchant(s) ${strays.map((m) => `"${m}"`).join(", ")} against a token minted for "${token.merchant}"`, `keep the session to "${token.merchant}", or mint a separate SPT per merchant`);
    }
    if (session.merchant && session.merchant !== token.merchant) {
      return fail("spt_merchant_drift", `session merchant "${session.merchant}" is not the token's merchant "${token.merchant}"`, `run this session against an SPT minted for "${session.merchant}"`);
    }
  }

  if (Array.isArray(token.allowedCategories) && token.allowedCategories.length > 0) {
    const stray = items.find((it) => it.category && !token.allowedCategories.includes(it.category));
    if (stray) {
      return fail("spt_category_drift", `line item "${stray.sku || stray.category}" is in category "${stray.category}", which the token did not authorize (allowed: ${token.allowedCategories.join(", ")})`, `drop the out-of-scope item, or mint an SPT covering "${stray.category}"`);
    }
  }

  // Currency drift: a ceiling denominated in one currency says nothing about a
  // charge in another, so a mismatch fails rather than being silently compared.
  const tokenCcy = (token.currency || "USD").toUpperCase();
  const sessionCcy = (session.currency || "USD").toUpperCase();
  if (tokenCcy !== sessionCcy) {
    return fail("spt_currency_mismatch", `session is denominated in ${sessionCcy} but the token authorizes ${tokenCcy}`, `charge in ${tokenCcy}, or mint an SPT denominated in ${sessionCcy} — SpendVeto will not compare across currencies it wasn't given a rate for`);
  }

  return { ok: true, totalUSD: computed, itemCount: items.length, merchant: token.merchant || session.merchant || null, currency: tokenCcy };
}
