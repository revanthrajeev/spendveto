import { getLedger } from "./ledger.js";

// Structured decision events — the ledger, re-shaped into the normalized,
// SIEM-ready record enterprise security teams actually ingest. The ledger is
// the tamper-evident source of truth (hash-chained, exact field layout); this
// module is the *evidence surface* over it: one stable schema
// ("spendveto.decision.v1") with the fields a Splunk/Datadog/Elastic pipeline
// or an auditor's query needs — who spent, what was decided, under which
// policy version, with the chain-of-custody hashes carried along. Read-only:
// nothing here can alter what it reports on.
export function decisionEvents({ since, until, status, address, limit } = {}) {
  const sinceMs = since ? Date.parse(since) : null;
  const untilMs = until ? Date.parse(until) : null;
  const addrKey = address ? address.toLowerCase() : null;

  let entries = getLedger().filter((e) => {
    const t = Date.parse(e.ts);
    if (sinceMs != null && !(t >= sinceMs)) return false;
    if (untilMs != null && !(t <= untilMs)) return false;
    if (status && e.status !== status) return false;
    if (addrKey && e.address?.toLowerCase() !== addrKey) return false;
    return true;
  });
  if (limit) entries = entries.slice(-Number(limit));

  return entries.map((e) => ({
    schema: "spendveto.decision.v1",
    ts: e.ts,
    agent: e.address || null,
    decision: e.status, // paid | blocked | failed
    resource: e.resource || null,
    amountUSD: e.amount != null ? Number(e.amount) : null,
    chain: e.chain || null,
    category: e.category || null,
    payee: e.payTo || null,
    reason: e.reason || null,
    receiptId: e.receiptId || null,
    policyHash: e.policyHash || null,
    mode: e.mode || null,
    entryHash: e.entryHash || null,
    prevHash: e.prevHash || null,
  }));
}

// JSON Lines — the lingua franca of log shippers: one event per line, so the
// export streams straight into `splunk add oneshot`, a Datadog log pipeline,
// or `jq` without any envelope parsing.
export function toJSONL(events) {
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
}
