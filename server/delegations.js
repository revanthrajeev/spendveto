import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Durable, unlike approvals: a budget grant must survive server restarts —
// it's a standing authorization, not a transient question.
const PATH = fileURLToPath(new URL("../data/delegations.json", import.meta.url));

function read() {
  if (!existsSync(PATH)) return [];
  try {
    return JSON.parse(readFileSync(PATH, "utf8"));
  } catch {
    return [];
  }
}

function save(list) {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(list, null, 2));
}

export function listDelegations() {
  return read();
}

export function createDelegation({ parentAddress, childAddress, capUSD, label, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds }) {
  const list = read();
  const record = {
    id: randomUUID(),
    parentAddress,
    childAddress,
    capUSD: Number(capUSD),
    label: label || null,
    // Scope, not just size: a grant may restrict WHICH tools the child can buy,
    // WHICH chains it can settle on, and WHICH recipients it may pay; like caps,
    // every ancestor's scope binds the whole subtree.
    allowedTools: Array.isArray(allowedTools) && allowedTools.length > 0 ? allowedTools : null,
    allowedChains: Array.isArray(allowedChains) && allowedChains.length > 0 ? allowedChains : null,
    allowedPayees: Array.isArray(allowedPayees) && allowedPayees.length > 0 ? allowedPayees : null,
    // Time-boxed budgets: past expiresAt the grant is as dead as a revoked
    // one, and (checked in the policy walk) an expired ancestor kills its
    // whole branch.
    expiresAt: Number(ttlSeconds) > 0 ? new Date(Date.now() + Number(ttlSeconds) * 1000).toISOString() : null,
    // Recurring allowance: when set, the cap applies to a ROLLING window of
    // this many seconds instead of lifetime spend — "$5 every week" instead
    // of "$5 ever". The window re-fills by itself as old spend ages out.
    periodSeconds: Number(periodSeconds) > 0 ? Number(periodSeconds) : null,
    createdAt: new Date().toISOString(),
    revoked: false,
  };
  list.push(record);
  save(list);
  return record;
}

export function revokeDelegation(id) {
  const list = read();
  const record = list.find((d) => d.id === id);
  if (!record || record.revoked) return null;
  record.revoked = true;
  record.revokedAt = new Date().toISOString();
  save(list);
  return record;
}

export function findDelegationForChild(address) {
  const key = address.toLowerCase();
  // Latest grant wins if a child was ever re-delegated.
  return (
    read()
      .filter((d) => d.childAddress.toLowerCase() === key)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
  );
}
