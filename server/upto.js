// x402 `upto` scheme governance — reserve the ceiling, settle the actual.
//
// Every control in this codebase so far governs a KNOWN price: the agent asks
// for a $0.02 tool, policy decides on $0.02, the ledger records $0.02. The
// x402 v2 `upto` scheme (live on the public facilitator for base-sepolia as of
// this writing, alongside `exact` and `batch-settlement`) breaks that
// assumption on purpose. It exists for usage-based billing inside a single
// request: the buyer signs an authorization for a MAXIMUM, and the SELLER
// decides afterwards what to actually charge, up to that maximum.
//
// That is a new buyer-side hole, and it is the exact shape this product is
// for. Three things go wrong if a governance layer treats an `upto`
// authorization like an `exact` payment:
//
//   1. The wrong number gets governed. An `upto` authorization quoting "about
//      $2" but permitting $50 is a $50 decision, not a $2 one — $50 is what
//      the buyer is exposed to the moment the signature exists. Policy here
//      always decides on the ceiling.
//   2. The budget leaks. Between signing and settlement nothing has settled,
//      so a naive hourly-budget check sees $0 spent and will happily let an
//      agent sign ten $50 authorizations under a $60/hour cap. So an open
//      authorization HOLDS its ceiling against the budget — card pre-auth
//      semantics — and settlement releases the unused headroom
//      (see openHoldUSD, consumed by client/policy.js).
//   3. Nobody checks the seller's arithmetic. The spec says the settled amount
//      MUST be ≤ the authorized maximum and each authorization MUST settle at
//      most once. That is a rule about what the SELLER may do, enforced by the
//      facilitator — and the buyer is the party who loses if it isn't. So the
//      buyer's own gate re-checks it here: over-settlement and replay are
//      refused with named codes, and a settlement after the deadline is
//      refused rather than quietly booked.
//
// What this module is NOT: it does not mint, sign, or settle an x402
// authorization, and it is not a facilitator. It is the buyer's ledger of
// what has been authorized but not yet spent — the number no rail reports and
// every budget depends on.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const UPTO_PATH = `${DATA_DIR}/upto.json`;

const round = (n) => Math.round(n * 1e6) / 1e6;
const fail = (code, reason, suggestion) => ({ ok: false, code, reason, suggestion });

function readAll() {
  if (!existsSync(UPTO_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(UPTO_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(UPTO_PATH, JSON.stringify(rows, null, 2));
}

// An authorization past its deadline holds nothing: the signature can no
// longer settle, so pinning budget behind it would be a leak in the other
// direction — an agent starved by ceilings that expired hours ago. Sweeping is
// lazy (on every read) rather than a timer, so a server that was down over the
// deadline still reports the right number the moment it comes back.
function sweep(rows) {
  const now = Date.now();
  let changed = false;
  for (const row of rows) {
    if (row.status === "open" && row.deadline && Date.parse(row.deadline) <= now) {
      row.status = "expired";
      row.expiredAt = new Date(now).toISOString();
      changed = true;
    }
  }
  return changed;
}

export function getAuthorizations() {
  const rows = readAll();
  if (sweep(rows)) writeAll(rows);
  return rows;
}

// The number client/policy.js adds to settled spend before deciding: every
// ceiling this wallet has signed for and not yet resolved.
export function openHoldUSD(address) {
  if (!address) return 0;
  const target = String(address).toLowerCase();
  return round(
    getAuthorizations()
      .filter((r) => r.status === "open" && String(r.address).toLowerCase() === target)
      .reduce((sum, r) => sum + Number(r.maxUSD || 0), 0)
  );
}

export function findAuthorization(id) {
  return getAuthorizations().find((r) => r.id === id) || null;
}

// Record an authorization the buyer is about to sign for. Callers run
// checkPolicy against maxUSD FIRST (see server/index.js) — this function is
// the bookkeeping half, and deliberately does not re-decide policy.
export function authorize({ address, maxUSD, payee, toolId, chain, category, validAfter, deadline, quotedUSD }) {
  if (!address) return fail("upto_address_missing", "no buyer address supplied", "send the wallet that will sign the authorization");
  const max = Number(maxUSD);
  if (!(max > 0)) return fail("upto_max_invalid", "maxUSD must be a positive number", "send the ceiling the authorization permits — an authorization with no ceiling authorizes everything");

  // The spec requires explicit validity bounds precisely because an unbounded
  // authorization is an unbounded liability; refusing here is refusing to hold
  // budget behind something that can never resolve on its own.
  const now = Date.now();
  const startsAt = validAfter ? Date.parse(validAfter) : now;
  const endsAt = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(endsAt)) {
    return fail("upto_window_invalid", "deadline is required and must be an ISO timestamp", "give the authorization an explicit deadline — the scheme requires one, and an authorization that never expires holds budget forever");
  }
  if (!Number.isFinite(startsAt) || endsAt <= startsAt) {
    return fail("upto_window_invalid", `deadline ${deadline} is not after validAfter ${validAfter || "now"}`, "set a deadline later than validAfter");
  }
  if (endsAt <= now) {
    return fail("upto_window_invalid", `deadline ${deadline} is already in the past`, "sign a fresh authorization with a future deadline");
  }

  const quoted = Number(quotedUSD);
  const row = {
    id: `upto_${randomUUID()}`,
    address,
    maxUSD: round(max),
    // The quote is kept only as evidence of the gap between what the seller
    // advertised and what it made the buyer authorize; nothing decides on it.
    quotedUSD: Number.isFinite(quoted) && quoted > 0 ? round(quoted) : null,
    payee: payee || null,
    toolId: toolId || null,
    chain: chain || null,
    category: category || null,
    validAfter: new Date(startsAt).toISOString(),
    deadline: new Date(endsAt).toISOString(),
    status: "open",
    settledUSD: null,
    settledAt: null,
    releasedUSD: null,
    createdAt: new Date(now).toISOString(),
  };
  const rows = getAuthorizations();
  rows.push(row);
  writeAll(rows);
  return { ok: true, authorization: row };
}

// Settlement: the seller reports what it actually charged. Everything the
// scheme says the seller MUST do is re-checked here, on the buyer's side,
// because the buyer is the party who pays for it being wrong.
export function settleAuthorization(id, actualUSD) {
  const rows = getAuthorizations();
  const row = rows.find((r) => r.id === id);
  if (!row) return fail("upto_unknown", `no authorization with id "${id}"`, "settle against an id returned by /api/upto/authorize");

  if (row.status === "settled") {
    // "Each authorization MUST be settled at most once" — a second settlement
    // is a replay, and the buyer's ledger is where it gets caught.
    return fail("upto_already_settled", `authorization ${id} already settled $${row.settledUSD} at ${row.settledAt}`, "do not retry; sign a fresh authorization for a new charge — an authorization is consumed by its first settlement, whatever the amount");
  }
  if (row.status === "expired") {
    return fail("upto_expired", `authorization ${id} expired at ${row.deadline} without settling`, "sign a fresh authorization; the buyer released this ceiling back to the budget when the deadline passed");
  }
  if (row.status !== "open") {
    return fail("upto_not_open", `authorization ${id} is ${row.status}`, "sign a fresh authorization");
  }

  const actual = Number(actualUSD);
  // Zero is explicitly legal in the scheme (no usage, no charge) — and it
  // still consumes the authorization, which is the point of recording it.
  if (!Number.isFinite(actual) || actual < 0) {
    return fail("upto_amount_invalid", "settled amount must be a number ≥ 0", "send the amount actually consumed; 0 is valid when no usage occurred");
  }
  if (round(actual) > round(row.maxUSD)) {
    return fail("upto_over_settlement", `seller tried to settle $${round(actual)} against an authorization permitting at most $${row.maxUSD}`, "refuse this settlement and raise it with the seller — the scheme forbids settling above the authorized maximum, and the signature does not cover the excess");
  }

  row.status = "settled";
  row.settledUSD = round(actual);
  row.settledAt = new Date().toISOString();
  row.releasedUSD = round(row.maxUSD - actual);
  writeAll(rows);
  return { ok: true, authorization: row, settledUSD: row.settledUSD, releasedUSD: row.releasedUSD };
}

// Cancelling an authorization the buyer decided not to use. Releases the hold
// immediately instead of waiting for the deadline — the agent-side equivalent
// of voiding a pre-auth.
export function voidAuthorization(id, reason) {
  const rows = getAuthorizations();
  const row = rows.find((r) => r.id === id);
  if (!row) return fail("upto_unknown", `no authorization with id "${id}"`, "void an id returned by /api/upto/authorize");
  if (row.status === "settled") return fail("upto_already_settled", `authorization ${id} already settled $${row.settledUSD}`, "a settled authorization cannot be voided — it is spent");
  if (row.status !== "open") return fail("upto_not_open", `authorization ${id} is ${row.status}`, "nothing to void");
  row.status = "voided";
  row.voidedAt = new Date().toISOString();
  row.voidReason = reason || null;
  row.releasedUSD = round(row.maxUSD);
  writeAll(rows);
  return { ok: true, authorization: row, releasedUSD: row.releasedUSD };
}

// Exposure summary for the console: what a wallet has signed away but not yet
// spent, and how much of every resolved ceiling the seller actually took.
// "Utilisation" is the honest measure of whether a seller's ceilings are
// sized to its charges or padded — a seller that always settles near its
// maximum is quoting a price it does not mean.
export function uptoSummary(address) {
  const rows = getAuthorizations().filter((r) => !address || String(r.address).toLowerCase() === String(address).toLowerCase());
  const open = rows.filter((r) => r.status === "open");
  const settled = rows.filter((r) => r.status === "settled");
  const authorizedOnSettled = settled.reduce((s, r) => s + Number(r.maxUSD || 0), 0);
  const settledTotal = settled.reduce((s, r) => s + Number(r.settledUSD || 0), 0);
  return {
    address: address || null,
    openCount: open.length,
    heldUSD: round(open.reduce((s, r) => s + Number(r.maxUSD || 0), 0)),
    settledCount: settled.length,
    settledUSD: round(settledTotal),
    releasedUSD: round(settled.reduce((s, r) => s + Number(r.releasedUSD || 0), 0)),
    expiredCount: rows.filter((r) => r.status === "expired").length,
    voidedCount: rows.filter((r) => r.status === "voided").length,
    // null rather than 0 when nothing has settled: no data is not 0% usage.
    utilisation: authorizedOnSettled > 0 ? round(settledTotal / authorizedOnSettled) : null,
  };
}
