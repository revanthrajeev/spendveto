import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Shadow mode (board-review P1): run a CANDIDATE policy alongside the live one
// without enforcing it. Every real decision at the gate is also evaluated
// against the shadow policy — holding delegations, freezes, and spend history
// constant — and any divergence is recorded. A team edits their policy in
// shadow, watches "this stricter policy would have blocked $X across N calls
// that currently go through" against real traffic, and promotes it only once
// the impact is understood. This is the safe way to change a policy that sits
// in front of real money — the diff is measured, not guessed.

const SHADOW_POLICY_PATH = fileURLToPath(new URL("../data/shadow-policy.json", import.meta.url));
const SHADOW_LOG_PATH = fileURLToPath(new URL("../data/shadow-log.json", import.meta.url));
const MAX_OBSERVATIONS = 5000; // keep the log bounded; a shadow experiment is a window, not forever

function ensureDir(p) {
  mkdirSync(dirname(p), { recursive: true });
}

export function getShadowPolicy() {
  if (!existsSync(SHADOW_POLICY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SHADOW_POLICY_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function setShadowPolicy(policy) {
  ensureDir(SHADOW_POLICY_PATH);
  writeFileSync(SHADOW_POLICY_PATH, JSON.stringify(policy, null, 2));
  // A fresh candidate starts a fresh experiment — old observations don't apply.
  writeFileSync(SHADOW_LOG_PATH, JSON.stringify([], null, 2));
  return policy;
}

export function clearShadowPolicy() {
  for (const p of [SHADOW_POLICY_PATH, SHADOW_LOG_PATH]) {
    if (existsSync(p)) unlinkSync(p);
  }
}

function readLog() {
  if (!existsSync(SHADOW_LOG_PATH)) return [];
  try {
    return JSON.parse(readFileSync(SHADOW_LOG_PATH, "utf8"));
  } catch {
    return [];
  }
}

// Record one observation: what the live policy decided vs. what the shadow
// policy would have. Only called when a shadow policy is active.
export function recordShadowObservation({ address, resource, price, liveAllowed, shadowAllowed, shadowReason }) {
  const log = readLog();
  log.push({
    ts: new Date().toISOString(),
    address,
    resource,
    price: Number(price) || 0,
    liveAllowed: !!liveAllowed,
    shadowAllowed: !!shadowAllowed,
    diverged: !!liveAllowed !== !!shadowAllowed,
    shadowReason: shadowReason || null,
  });
  ensureDir(SHADOW_LOG_PATH);
  writeFileSync(SHADOW_LOG_PATH, JSON.stringify(log.slice(-MAX_OBSERVATIONS), null, 2));
}

// The report a team reads before promoting a candidate policy: how much spend
// the shadow policy would have additionally blocked (the usual reason to
// tighten), and how much it would have newly allowed (the risk of loosening).
export function shadowReport() {
  const policy = getShadowPolicy();
  if (!policy) return { active: false };
  const log = readLog();
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const wouldBlock = log.filter((o) => o.liveAllowed && !o.shadowAllowed);
  const wouldAllow = log.filter((o) => !o.liveAllowed && o.shadowAllowed);
  return {
    active: true,
    policy,
    observations: log.length,
    diverged: log.filter((o) => o.diverged).length,
    wouldBlockThatLiveAllowed: { count: wouldBlock.length, usd: round(wouldBlock.reduce((s, o) => s + o.price, 0)) },
    wouldAllowThatLiveBlocked: { count: wouldAllow.length, usd: round(wouldAllow.reduce((s, o) => s + o.price, 0)) },
    sample: log.slice(-10),
  };
}
