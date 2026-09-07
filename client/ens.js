// ENS name resolution for payee allowlists. `allowedPayees` (global policy
// and per-delegation payee scope, in client/policy.js) exists so a human can
// audit exactly who an agent is permitted to pay — and a list of raw 0x
// addresses is not auditable by a human at a glance. `vitalik.eth` is;
// `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` is not. This module lets an
// allowlist entry be either, resolving `.eth` names against Ethereum mainnet
// before the payee comparison in checkPolicy ever runs.
//
// A resolution is looked up, not trusted blind: this is a governance
// allowlist, so a name that fails to resolve is DROPPED from the effective
// list rather than treated as a wildcard or retried against the raw string.
// The failure mode of "this payee just can't be paid until the name
// resolves" is the safe one for an allowlist — the failure mode of "an
// unresolvable entry accidentally matches everything" is not. Same honesty
// rule as everywhere else in this codebase: refuse rather than guess.
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { findChain } from "../shared-config.js";

let client;
function ensClient() {
  if (!client) {
    client = createPublicClient({ chain: mainnet, transport: http(findChain("ethereum").rpc) });
  }
  return client;
}

// Every other assertion in scripts/verify.mjs is local and hermetic — even
// the x402 facilitator is a mock HTTP server, never a live third-party
// endpoint — so the suite is deterministic and reproducible from a clean
// clone with no dependency on outside infrastructure staying up. A real
// Ethereum mainnet RPC call would be the first exception to that, and a real
// one: rate limits or an RPC outage would fail an assertion this repo's own
// code did nothing wrong to deserve. So the network boundary — not the
// resolution/caching/fallback logic around it — is swappable for a test.
// Production code never calls this; only scripts/verify.mjs does.
let testResolver = null;
export function __setEnsResolverForTesting(fn) {
  testResolver = fn;
}

// checkPolicy runs on every single call a governed agent makes — an
// uncached RPC round trip on that hot path would make the network, not the
// policy engine, the thing deciding how fast an agent can spend. Resolved
// names cache for 10 minutes (ENS records change rarely; ten minutes is far
// inside any human's expectation of "I updated my allowlist, why hasn't it
// taken effect yet"). Failed lookups cache for only 1 minute, deliberately
// shorter: a name added to `allowedPayees` moments after being registered
// shouldn't be treated as permanently unresolvable for the next 10 minutes.
const RESOLVED_TTL_MS = 10 * 60 * 1000;
const FAILED_TTL_MS = 60 * 1000;
const cache = new Map(); // name -> { address: string|null, expiresAt: number }

export async function resolveEnsName(name) {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.address;
  let address = null;
  try {
    address = testResolver ? await testResolver(key) : await ensClient().getEnsAddress({ name: key });
  } catch {
    // Unreachable RPC, malformed name, whatever — resolves to "no address,"
    // same as a name that was never registered. checkPolicy has no way to
    // distinguish "this name doesn't exist" from "we couldn't ask," and
    // for an allowlist the safe answer to both is the same: not allowed.
  }
  cache.set(key, { address: address ? address.toLowerCase() : null, expiresAt: Date.now() + (address ? RESOLVED_TTL_MS : FAILED_TTL_MS) });
  return address ? address.toLowerCase() : null;
}

// Expands an allowlist that may mix raw addresses and .eth names into a
// flat list of addresses only — the shape checkPolicy's payee comparison
// already expects. A plain 0x address passes through untouched (no network
// call for the common case); only names ending in .eth are ever resolved.
export async function resolvePayeeList(list) {
  if (!Array.isArray(list)) return [];
  const resolved = await Promise.all(
    list.map(async (entry) => {
      const raw = String(entry);
      if (!raw.toLowerCase().endsWith(".eth")) return raw.toLowerCase();
      return await resolveEnsName(raw);
    })
  );
  return resolved.filter((addr) => addr != null);
}
