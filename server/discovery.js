// x402 V2 "Bazaar" discovery, on both sides of the gate.
//
// Bazaar is the ecosystem's answer to discoverability: facilitators expose
// GET /discovery/resources, and an agent can find and pay a service it has
// never heard of, with no pre-baked integration. That is exactly the property
// that makes it a governance problem — a prompt-injected agent can discover an
// arbitrary payable endpoint at runtime, and a payee allowlist that is only
// consulted at settlement finds out far too late to be useful.
//
// So this module does two things:
//   1. publishes SpendVeto's own catalog in Bazaar's schema, so governed tools
//      are discoverable supply rather than an island;
//   2. filters someone ELSE's Bazaar catalog through the live policy before an
//      agent ever sees it — a service the agent could never be allowed to pay
//      for should not be in the list it chooses from.

import { CHAINS, DEFAULT_CHAIN, findChain } from "../shared-config.js";

// USDC has 6 decimals on every chain in the registry; Bazaar quotes amounts in
// the asset's own base units, not dollars.
const usdToBaseUnits = (usd) => String(Math.round(Number(usd) * 1e6));

function assetFor(chainId) {
  const chain = findChain(chainId) || findChain(DEFAULT_CHAIN) || CHAINS[0];
  return { network: chain?.caip2 || null, networkId: chain?.id || DEFAULT_CHAIN, asset: chain?.usdc || null };
}

// SpendVeto's catalog, in Bazaar's resource shape.
export function toBazaarResources(tools, { baseUrl, chain } = {}) {
  const { network, networkId, asset } = assetFor(chain);
  const origin = baseUrl || "";
  return tools.map((t) => ({
    resource: `${origin}${t.path}`,
    type: "http",
    lastUpdated: t.createdAt || new Date().toISOString(),
    accepts: [
      {
        scheme: "exact",
        network, // CAIP-2, per x402 v2's network-agnostic identifiers
        networkId,
        asset,
        maxAmountRequired: usdToBaseUnits(t.price),
        payTo: t.payTo || null,
        description: t.description || t.label || t.id,
      },
    ],
    metadata: {
      name: t.label || t.id,
      description: t.description || "",
      tags: [t.category || "marketplace", "governed"].filter(Boolean),
      // Not part of Bazaar's schema — a SpendVeto-specific hint that this
      // listing sits behind a policy gate, so a buyer knows the price is the
      // floor and the call may still be paused or refused.
      "x-spendveto": { governed: true, priceUSD: String(t.price), toolId: t.id },
    },
  }));
}

const baseUnitsToUsd = (units) => Number(units) / 1e6;

// Read the dollar price out of a Bazaar listing's cheapest acceptable option,
// tolerating listings that quote several networks.
function priceOf(resource) {
  const accepts = Array.isArray(resource?.accepts) ? resource.accepts : [];
  const prices = accepts.map((a) => baseUnitsToUsd(a.maxAmountRequired)).filter((n) => Number.isFinite(n) && n >= 0);
  return prices.length ? Math.min(...prices) : null;
}

const payeesOf = (resource) =>
  (Array.isArray(resource?.accepts) ? resource.accepts : []).map((a) => a.payTo).filter(Boolean);

// A listing may name its chain either way — x402 v2 prefers CAIP-2, while
// SpendVeto's own policy allowlist is written in registry ids — so resolve both
// to the registry id and compare there.
function networksOf(resource) {
  const accepts = Array.isArray(resource?.accepts) ? resource.accepts : [];
  const raw = accepts.flatMap((a) => [a.network, a.networkId]).filter(Boolean);
  return [...new Set(raw.map((n) => CHAINS.find((c) => c.caip2 === n || c.id === n)?.id || n))];
}

// Filter a discovered catalog through the policy the agent is actually bound
// by. Purely structural — price, payee, chain, category — so it is fast enough
// to run inline on every discovery call and never sends money anywhere.
//
// This is a pre-filter, not a substitute for the gate: whichever resource the
// agent picks still goes through the full pipeline at call time. It exists to
// shrink what a compromised agent can even name.
export function governCatalog(resources, policy, { categoryOf } = {}) {
  const allowed = [];
  const filtered = [];

  for (const r of Array.isArray(resources) ? resources : []) {
    const price = priceOf(r);
    const payees = payeesOf(r);
    const networks = networksOf(r);
    const category = categoryOf ? categoryOf(r) : r?.metadata?.tags?.[0];

    let block = null;

    if (price == null) {
      block = { code: "unpriced", reason: "listing has no readable price in its accepts[] — nothing to check a cap against" };
    } else if (policy.maxPerCallUSD != null && price > Number(policy.maxPerCallUSD)) {
      block = { code: "over_per_call_cap", reason: `cheapest price $${price} exceeds maxPerCallUSD $${policy.maxPerCallUSD}` };
    } else if (Array.isArray(policy.allowedPayees) && policy.allowedPayees.length > 0) {
      const normalized = policy.allowedPayees.map((p) => String(p).toLowerCase());
      if (payees.length === 0) {
        block = { code: "payee_unknown", reason: "listing names no payTo address, so it cannot be checked against the payee allowlist" };
      } else if (!payees.some((p) => normalized.includes(String(p).toLowerCase()))) {
        block = { code: "payee_not_allowed", reason: `none of this listing's payees are on the policy's allowlist` };
      }
    }

    if (!block && Array.isArray(policy.allowedChains) && policy.allowedChains.length > 0) {
      if (networks.length > 0 && !networks.some((n) => policy.allowedChains.includes(n))) {
        block = { code: "chain_not_allowed", reason: `listing settles only on ${networks.join(", ")}; policy allows ${policy.allowedChains.join(", ")}` };
      }
    }

    if (!block && category && policy.categoryCapsUSD && policy.categoryCapsUSD[category] != null) {
      const cap = Number(policy.categoryCapsUSD[category]);
      if (price > cap) {
        block = { code: "over_category_cap", reason: `price $${price} exceeds the hourly cap for category "${category}" ($${cap})` };
      }
    }

    if (block) filtered.push({ resource: r?.resource || null, priceUSD: price, ...block });
    else allowed.push(r);
  }

  return { allowed, filtered };
}
