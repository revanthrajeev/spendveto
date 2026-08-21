import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getLedger } from "./ledger.js";
import { createFreeze, findActiveFreeze } from "./freezes.js";

const POLICY_PATH = fileURLToPath(new URL("../data/policy.json", import.meta.url));
const DEFAULT_ANOMALY = { burstAttempts: 10, burstWindowSeconds: 10 };

function anomalyConfig() {
  try {
    if (existsSync(POLICY_PATH)) {
      const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
      return { ...DEFAULT_ANOMALY, ...(policy.anomaly || {}) };
    }
  } catch {
    // unreadable policy file — fall through to defaults
  }
  return DEFAULT_ANOMALY;
}

// Runaway-loop detection: a wallet firing payment attempts faster than any
// legitimate agent workflow gets auto-frozen. Every attempt counts — paid,
// blocked, or failed — because a loop that keeps getting blocked is still a
// loop, and one that keeps paying is the expensive kind. Called after every
// ledger append; the freeze is then enforced on the wallet's next call.
export function maybeFreezeForBurst(address) {
  if (!address) return null;
  const { burstAttempts, burstWindowSeconds } = anomalyConfig();
  if (findActiveFreeze(address)) return null;

  const cutoff = Date.now() - burstWindowSeconds * 1000;
  const key = address.toLowerCase();
  const attempts = getLedger().filter(
    (e) => e.address?.toLowerCase() === key && new Date(e.ts).getTime() >= cutoff
  ).length;

  if (attempts >= burstAttempts) {
    const freeze = createFreeze({
      address,
      source: "anomaly",
      reason: `runaway loop suspected: ${attempts} payment attempts in ${burstWindowSeconds}s (threshold ${burstAttempts})`,
    });
    console.log(`[anomaly] froze ${address} — ${freeze.reason}`);
    return freeze;
  }
  return null;
}

// Advanced anomaly analysis (roadmap item: "richer anomaly models on top of the
// baseline burst detector"). The burst detector above is a single reflex —
// rate. This is the read-side companion: a panel of deterministic behavioural
// signals computed over the wallet's own ledger history, each returning a
// bounded severity in [0,1] with a plain-English reason. Nothing here is a
// black-box model or a network call — every signal is a pure function of the
// ledger, so it is fully reproducible and testable. The composite `level` is
// advisory (surfaced at /api/anomaly/:address and on the Console); the only
// signal wired to an automatic action is still the burst freeze above.
const RECENT = 20; // how many of the wallet's most-recent entries define "recent behaviour"

const round2 = (n) => Math.round(n * 100) / 100;

// A payment attempt's recipient, if the entry recorded one. Older entries and
// tools without a pinned payee simply don't contribute to payee-based signals.
const payeeOf = (e) => (e.payTo ? e.payTo.toLowerCase() : null);

export function analyzeAnomalies(address, ledger) {
  const key = address.toLowerCase();
  const all = (ledger || getLedger()).filter((e) => e.address?.toLowerCase() === key);
  const signals = [];
  if (all.length === 0) {
    return { address, level: "none", score: 0, sampled: 0, signals };
  }

  const recent = all.slice(-RECENT);
  const history = all.slice(0, -recent.length); // everything before the recent window
  const paid = all.filter((e) => e.status === "paid");

  // 1) Block-rate spike — a healthy agent rarely trips its own policy. A recent
  //    window that is mostly blocks is either a probing loop or a misconfigured
  //    agent hammering a wall; both deserve a look.
  const recentBlocks = recent.filter((e) => e.status === "blocked").length;
  const blockRate = recentBlocks / recent.length;
  if (recent.length >= 4 && blockRate >= 0.5) {
    signals.push({
      code: "block_rate_spike",
      severity: round2(Math.min(1, blockRate)),
      detail: `${recentBlocks} of the last ${recent.length} attempts were blocked (${Math.round(blockRate * 100)}%) — probing or misconfiguration`,
    });
  }

  // 2) Novel payee — money moving to a recipient this wallet has never paid
  //    before. Pairs with the payee allowlist: the allowlist is the hard stop,
  //    this is the soft "you just paid someone new" heads-up for payees that
  //    were allowed but unusual.
  const seenBefore = new Set(history.filter((e) => e.status === "paid").map(payeeOf).filter(Boolean));
  const novelPayees = [...new Set(recent.filter((e) => e.status === "paid").map(payeeOf).filter((p) => p && !seenBefore.has(p)))];
  if (seenBefore.size > 0 && novelPayees.length > 0) {
    signals.push({
      code: "novel_payee",
      severity: round2(Math.min(1, 0.4 + 0.2 * novelPayees.length)),
      detail: `paid ${novelPayees.length} recipient(s) never seen in this wallet's prior history`,
    });
  }

  // 3) Category drift — spend flowing into a tool category the wallet has never
  //    touched. A translation agent that suddenly buys "financial-data" is
  //    either doing something new or has been repurposed.
  const knownCats = new Set(history.map((e) => e.category).filter(Boolean));
  const newCats = [...new Set(recent.map((e) => e.category).filter((c) => c && !knownCats.has(c)))];
  if (knownCats.size > 0 && newCats.length > 0) {
    signals.push({
      code: "category_drift",
      severity: 0.35,
      detail: `new spend category: ${newCats.join(", ")} (not in this wallet's history)`,
    });
  }

  // 4) Amount outlier — a single paid amount far above the wallet's own typical
  //    spend. Uses the median of prior paid amounts as the baseline so one big
  //    legitimate purchase doesn't poison the reference the way a mean would.
  const priorPaid = paid.slice(0, -1).map((e) => Number(e.amount || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  if (priorPaid.length >= 3 && paid.length) {
    const median = priorPaid[Math.floor(priorPaid.length / 2)];
    const last = Number(paid[paid.length - 1].amount || 0);
    if (median > 0 && last >= median * 5) {
      signals.push({
        code: "amount_outlier",
        severity: round2(Math.min(1, last / (median * 10))),
        detail: `most recent paid amount $${last} is ${round2(last / median)}× this wallet's median of $${median}`,
      });
    }
  }

  // Composite advisory level — the single most severe signal drives it, so one
  // strong red flag isn't diluted by quiet signals. No signal → "none".
  const top = signals.reduce((m, s) => Math.max(m, s.severity), 0);
  const level = top >= 0.7 ? "high" : top >= 0.4 ? "elevated" : top > 0 ? "low" : "none";
  return { address, level, score: round2(top), sampled: all.length, signals };
}
