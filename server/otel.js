// OpenTelemetry export of governance decisions.
//
// SpendVeto already emits two observability surfaces: Prometheus counters at
// /metrics (how much, how often) and spendveto.decision.v1 JSONL at
// /api/events (what was decided, for a SIEM). Neither is what an agent
// platform team actually runs in 2026. Their agents are already traced —
// prompts, tool calls, sub-agents, retrievals — and the buying requirement
// that keeps appearing in agent-governance evaluations is OpenTelemetry-native
// visibility: the spend decision has to show up as a *span inside the trace
// that caused it*, not in a separate system an on-call engineer has to
// correlate by timestamp at 3am.
//
// So this is the third projection over the same ledger: OTLP-shaped spans.
// Deliberately dependency-free — OTLP/HTTP is JSON over POST, and pulling the
// full OpenTelemetry SDK into a governance gate would add a supply-chain
// surface to the one component whose job is refusing to trust things. If a
// caller passes a W3C traceparent, the decision span adopts that trace and
// parent, which is the entire point: the refusal appears under the agent run
// that tried to spend.
//
// Not claimed: metrics or logs signals, span links, baggage propagation, or a
// running collector. This produces spans in OTLP JSON and posts them to a
// configured endpoint. That is the whole surface.

import { createHash } from "node:crypto";
import { decisionEvents } from "./events.js";

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

// W3C Trace Context. Returns null rather than throwing on a malformed header:
// a bad traceparent must never be the reason a payment decision fails.
export function parseTraceparent(header) {
  const m = TRACEPARENT_RE.exec(String(header || "").trim());
  if (!m) return null;
  const [, traceId, parentId, flags] = m;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return null;
  return { traceId, parentId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

// Deterministic ids derived from the entry hash, so re-exporting the same
// ledger produces the same span ids instead of duplicating spans in the
// backend on every scrape.
function idsFor(entryHash, ts, index) {
  const seed = createHash("sha256").update(`${entryHash || ""}:${ts}:${index}`).digest("hex");
  return { traceId: seed.slice(0, 32), spanId: seed.slice(32, 48) };
}

const toNano = (ts) => String(Date.parse(ts) * 1e6);

const attr = (key, value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return { key, value: Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value } };
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
};

// A blocked spend is not an error in the tracing sense — the gate did its job.
// Marking refusals as ERROR would light up every dashboard for working
// software and train the team to ignore the colour that matters.
// STATUS_CODE_OK = 1, STATUS_CODE_ERROR = 2.
function statusFor(decision) {
  if (decision === "failed") return { code: 2, message: "settlement failed" };
  return { code: 1 };
}

export function decisionSpans({ traceparent, ...filter } = {}) {
  const parent = parseTraceparent(traceparent);
  return decisionEvents(filter).map((e, i) => {
    const ids = idsFor(e.entryHash, e.ts, i);
    const start = toNano(e.ts);
    const attrs = [
      attr("spendveto.decision", e.decision),
      attr("spendveto.agent", e.agent),
      attr("spendveto.resource", e.resource),
      attr("spendveto.amount_usd", e.amountUSD),
      attr("spendveto.chain", e.chain),
      attr("spendveto.category", e.category),
      attr("spendveto.payee", e.payee),
      attr("spendveto.reason", e.reason),
      attr("spendveto.policy_hash", e.policyHash),
      attr("spendveto.receipt_id", e.receiptId),
      attr("spendveto.entry_hash", e.entryHash),
      attr("spendveto.mode", e.mode),
    ].filter(Boolean);
    return {
      traceId: parent ? parent.traceId : ids.traceId,
      spanId: ids.spanId,
      ...(parent ? { parentSpanId: parent.parentId } : {}),
      name: `spendveto.decision ${e.decision}`,
      // SPAN_KIND_INTERNAL — the gate is not the client or the server of the
      // payment, it is the decision in between.
      kind: 1,
      startTimeUnixNano: start,
      endTimeUnixNano: start,
      attributes: attrs,
      status: statusFor(e.decision),
    };
  });
}

// The OTLP/HTTP JSON envelope, exactly as a collector expects to receive it.
export function toOtlpPayload(spans, { serviceName = "spendveto" } = {}) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [attr("service.name", serviceName), attr("service.namespace", "agent-spend-governance")].filter(Boolean),
        },
        scopeSpans: [{ scope: { name: "spendveto/gate", version: "1" }, spans }],
      },
    ],
  };
}

// Fire-and-forget, like the alert and billing sinks: an unreachable collector
// must never become the reason a spend decision is delayed or lost.
export async function exportSpans(payload, endpoint = process.env.SPENDVETO_OTLP_ENDPOINT) {
  if (!endpoint) return { exported: false, reason: "no SPENDVETO_OTLP_ENDPOINT configured" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { exported: res.ok, status: res.status };
  } catch (err) {
    return { exported: false, reason: err.message };
  }
}
