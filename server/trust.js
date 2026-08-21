import { getLedger } from "./ledger.js";
import { listFreezes } from "./freezes.js";
import { listDelegations } from "./delegations.js";

// Cross-organization trust graph (roadmap item: "scale the local 0–100 wallet
// governance score into a cross-organizational agent credit bureau and trust
// graph"). The per-wallet score already exists; this module turns the flat
// per-wallet number into (1) a graph — wallets are nodes, delegations are
// directed edges, and each delegation root is an "org" whose blended
// reputation aggregates its whole sub-tree — and (2) a counterparty bureau:
// reputation attached to a *recipient* address, aggregated across every wallet
// that has ever paid it. Everything here is a pure read over the ledger,
// freeze log, and delegation records — no external data, fully reproducible.

const grade = (score) => (score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F");

// The canonical per-wallet score. Kept here (not inline in index.js) so the
// graph, the bureau, and the /api/trust/:address endpoint all agree on one
// definition. Paid history earns trust; blocks, failures, and freezes burn it.
export function trustScoreFor(address, ledger, freezes) {
  const key = address.toLowerCase();
  const entries = (ledger || getLedger()).filter((e) => e.address?.toLowerCase() === key);
  const fz = (freezes || listFreezes()).filter((f) => f.address.toLowerCase() === key);
  const paid = entries.filter((e) => e.status === "paid").length;
  const blocked = entries.filter((e) => e.status === "blocked").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const frozenNow = fz.some((f) => !f.unfrozen);
  let score = 50 + Math.min(paid * 5, 40) - Math.min(blocked * 10, 40) - Math.min(failed * 5, 40) - (frozenNow ? 30 : 0) - Math.min(fz.length * 10, 20);
  score = Math.max(0, Math.min(100, score));
  return { address, score, grade: grade(score), signals: { paid, blocked, failed, freezes: fz.length, frozenNow } };
}

// The whole forest: every wallet that appears in the ledger or the delegation
// tree becomes a scored node; every active delegation becomes an edge. The
// roots (nodes with no parent delegation pointing at them) are the "orgs" —
// each carries a blended score over its entire descendant sub-tree, weighted by
// each member's paid volume so a big spender moves the org number more than a
// wallet that has done nothing. This is the seed of a cross-org credit graph:
// one number that answers "how well-governed is this whole agent fleet?".
export function trustGraph() {
  const ledger = getLedger();
  const freezes = listFreezes();
  const delegations = listDelegations().filter((d) => !d.revoked);

  const addrs = new Set();
  for (const e of ledger) if (e.address) addrs.add(e.address.toLowerCase());
  for (const d of delegations) {
    if (d.parentAddress) addrs.add(d.parentAddress.toLowerCase());
    if (d.childAddress) addrs.add(d.childAddress.toLowerCase());
  }

  const nodes = [...addrs].map((a) => {
    const t = trustScoreFor(a, ledger, freezes);
    return { address: a, score: t.score, grade: t.grade, ...t.signals };
  });
  const nodeByAddr = new Map(nodes.map((n) => [n.address, n]));

  const edges = delegations.map((d) => ({
    from: d.parentAddress?.toLowerCase(),
    to: d.childAddress?.toLowerCase(),
    capUSD: d.capUSD,
    label: d.label || null,
    id: d.id,
  }));

  // children = anything that is the `to` of an edge; a root has no incoming edge.
  const children = new Set(edges.map((e) => e.to).filter(Boolean));
  const childrenOf = new Map();
  for (const e of edges) {
    if (!e.from || !e.to) continue;
    if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
    childrenOf.get(e.from).push(e.to);
  }

  // Blended, paid-volume-weighted score over a root's whole descendant tree.
  const orgs = nodes
    .filter((n) => !children.has(n.address))
    .map((root) => {
      const members = new Set();
      const stack = [root.address];
      while (stack.length) {
        const cur = stack.pop();
        if (members.has(cur)) continue; // cycle guard
        members.add(cur);
        for (const c of childrenOf.get(cur) || []) stack.push(c);
      }
      let weightSum = 0;
      let weighted = 0;
      for (const m of members) {
        const node = nodeByAddr.get(m);
        const w = 1 + (node?.paid || 0); // +1 so a zero-volume member still counts a little
        weightSum += w;
        weighted += w * (node?.score ?? 50);
      }
      const aggregateScore = weightSum ? Math.round(weighted / weightSum) : 50;
      return {
        rootAddress: root.address,
        memberCount: members.size,
        members: [...members],
        aggregateScore,
        aggregateGrade: grade(aggregateScore),
      };
    });

  return { nodes, edges, orgs, generatedAt: new Date().toISOString() };
}

// Counterparty bureau: reputation of a *recipient* address, aggregated across
// every wallet that has ever tried to pay it. A recipient paid repeatedly by
// many well-governed wallets is a very different risk than one that only ever
// receives blocked attempts. This is the "credit report on the merchant" side
// of the graph — the natural cross-org signal, since payees are shared across
// organizations even when wallets are not.
export function payeeReputation(payTo) {
  const key = payTo.toLowerCase();
  const ledger = getLedger();
  const freezes = listFreezes();
  const touching = ledger.filter((e) => e.payTo && e.payTo.toLowerCase() === key);

  const paid = touching.filter((e) => e.status === "paid");
  const blocked = touching.filter((e) => e.status === "blocked");
  const payers = [...new Set(touching.map((e) => e.address?.toLowerCase()).filter(Boolean))];
  const totalUSD = Math.round(paid.reduce((s, e) => s + Number(e.amount || 0), 0) * 1e6) / 1e6;

  // A payee inherits reputation from the average governance score of the
  // wallets that pay it — money from A-graded wallets is a stronger signal
  // than money from wallets that are constantly blocked or frozen.
  const payerScores = payers.map((p) => trustScoreFor(p, ledger, freezes).score);
  const avgPayerScore = payerScores.length ? Math.round(payerScores.reduce((a, b) => a + b, 0) / payerScores.length) : null;

  const ts = touching.map((e) => e.ts).sort();
  return {
    payTo,
    seen: touching.length > 0,
    distinctPayers: payers.length,
    payers,
    paidCount: paid.length,
    blockedCount: blocked.length,
    totalUSD,
    avgPayerScore,
    payerGrade: avgPayerScore == null ? null : grade(avgPayerScore),
    firstSeen: ts[0] || null,
    lastSeen: ts[ts.length - 1] || null,
  };
}
