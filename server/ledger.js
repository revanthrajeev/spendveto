import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const LEDGER_PATH = `${DATA_DIR}/ledger.json`;
const BALANCES_PATH = `${DATA_DIR}/balances.json`;
const STARTING_SIM_BALANCE = 5.0;

// Hash-chained audit ledger (issue #11). Each entry carries the hash of the
// entry before it, so the ledger is tamper-evident: editing, deleting, or
// reordering any historical row breaks every hash after it, and
// verifyLedgerChain() reports exactly where. This turns the ledger from "a
// JSON file an admin can quietly edit" into an append-only audit record —
// the property an enterprise buyer's compliance team actually asks for.
// It is NOT a blockchain and makes no distributed-consensus claim; it's a
// standard hash chain (the same construction as a Git commit history).
const GENESIS_HASH = "0".repeat(64);

// The fields that are bound into the hash. Deliberately excludes prevHash and
// entryHash themselves; everything else about the entry is covered.
function entryDigest(entry, prevHash) {
  const { entryHash, prevHash: _p, ...bound } = entry;
  const canonical = JSON.stringify(bound, Object.keys(bound).sort());
  return createHash("sha256").update(prevHash + canonical).digest("hex");
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(path, fallback) {
  ensureDataDir();
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  ensureDataDir();
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function getLedger() {
  return readJson(LEDGER_PATH, []);
}

export function appendLedgerEntry(entry) {
  const ledger = getLedger();
  const prevHash = ledger.length ? ledger[ledger.length - 1].entryHash || GENESIS_HASH : GENESIS_HASH;
  const record = { ts: new Date().toISOString(), ...entry, prevHash };
  record.entryHash = entryDigest(record, prevHash);
  ledger.push(record);
  writeJson(LEDGER_PATH, ledger);
  return ledger;
}

// Walk the chain and confirm every entry's hash still matches its content and
// its link to the entry before it. Returns { valid, length, brokenAt } —
// brokenAt is the index of the first tampered/broken entry, or null if intact.
export function verifyLedgerChain() {
  const ledger = getLedger();
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    // Pre-#11 entries (written before hash-chaining existed) have no entryHash;
    // treat the first hashed entry as the start of the verifiable chain rather
    // than failing a ledger that legitimately predates the feature.
    if (e.entryHash == null) {
      prevHash = GENESIS_HASH;
      continue;
    }
    if (e.prevHash !== prevHash || entryDigest(e, e.prevHash) !== e.entryHash) {
      return { valid: false, length: ledger.length, brokenAt: i };
    }
    prevHash = e.entryHash;
  }
  return { valid: true, length: ledger.length, brokenAt: null };
}

export function getBalances() {
  return readJson(BALANCES_PATH, {});
}

function saveBalances(balances) {
  writeJson(BALANCES_PATH, balances);
}

// Balances are per address AND per chain — paying on Polygon debits the
// Polygon balance, never the Base one. Each (address, chain) pair is seeded
// on first sight, modelling a wallet the user pre-funded on that chain.
// Older single-number balances migrate to { "base-sepolia": n } on read.
function chainBalancesOf(balances, key) {
  if (typeof balances[key] === "number") balances[key] = { "base-sepolia": balances[key] };
  if (!balances[key]) balances[key] = {};
  return balances[key];
}

export function getSimBalance(address, chain = "base-sepolia") {
  const balances = getBalances();
  const perChain = chainBalancesOf(balances, address.toLowerCase());
  if (!(chain in perChain)) {
    perChain[chain] = STARTING_SIM_BALANCE;
    saveBalances(balances);
  }
  return perChain[chain];
}

export function debitSimBalance(address, amountUSD, chain = "base-sepolia") {
  const balances = getBalances();
  const perChain = chainBalancesOf(balances, address.toLowerCase());
  if (!(chain in perChain)) perChain[chain] = STARTING_SIM_BALANCE;
  perChain[chain] = Math.round((perChain[chain] - amountUSD) * 1e6) / 1e6;
  saveBalances(balances);
  return perChain[chain];
}

export function creditSimBalance(address, amountUSD, chain = "base-sepolia") {
  const balances = getBalances();
  const perChain = chainBalancesOf(balances, address.toLowerCase());
  if (!(chain in perChain)) perChain[chain] = STARTING_SIM_BALANCE;
  perChain[chain] = Math.round((perChain[chain] + amountUSD) * 1e6) / 1e6;
  saveBalances(balances);
  return perChain[chain];
}

export function recentPaidSpend(address, sinceMs) {
  const cutoff = Date.now() - sinceMs;
  const key = address.toLowerCase();
  const entries = getLedger().filter(
    (e) => e.status === "paid" && e.address?.toLowerCase() === key && new Date(e.ts).getTime() >= cutoff
  );
  const totalUSD = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  return { totalUSD, count: entries.length };
}
