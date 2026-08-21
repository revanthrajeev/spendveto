// The enforcement proxy — SpendVeto ON the money path, not beside it.
//
// Agents don't get wallets. They POST a spending *intent* here; the proxy
// holds the keys, runs the full governed pipeline (freeze → policy → cascade
// caps/scopes → human approval), and only then signs and pays. An agent that
// goes rogue can't skip its policy check, because it never had anything to
// sign with. This is the self-hostable version of the hosted product: the
// custody point where governed volume (and basis-point pricing) lives.
//
//   npm run proxy          # :8404 (main server must be running on :8402)
//   curl -X POST localhost:8404/proxy/call -H 'Content-Type: application/json' \
//        -d '{"tool":"review"}'          # parent wallet
//        -d '{"tool":"review","child":"intern"}'   # delegated child, by label
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODE, PORT, TOOLS, CHAINS, DEFAULT_CHAIN, findChain, findTool } from "../shared-config.js";

const SERVER_URL = process.env.SPENDVETO_SERVER_URL || `http://localhost:${PORT}`;

// Marketplace tools (registered via POST /api/catalog/tools) live in the server's dynamic
// catalog, not the static TOOLS array `findTool` searches — this proxy runs in its own process,
// so the only way to see them is the same HTTP round trip the CLI already makes in
// pay-and-call.js. Without this, the SDK (the "npm import instead of curl" surface, and the
// one every external agent actually uses) could pay static demo tools but not a single
// marketplace listing — the entire "anyone can supply a paid tool" pitch would be CLI-only.
async function findAnyTool(toolId) {
  const staticTool = findTool(toolId);
  if (staticTool) return staticTool;
  try {
    const { tools } = await fetch(`${SERVER_URL}/api/catalog`).then((r) => r.json());
    return tools.find((t) => t.id === toolId) || null;
  } catch {
    return null;
  }
}
import { account, loadChildAccount } from "../client/wallet.js";
import { governedCall, waitForApproval, logEvent, withWalletLock } from "../client/pay.js";
import { checkPolicy } from "../client/policy.js";
import { railsCatalog } from "../rails/index.js";
import { trustScoreFor } from "../server/trust.js";
import { findDelegationForChild } from "../server/delegations.js";
import { findActiveFreeze, createFreeze, unfreeze } from "../server/freezes.js";

const PROXY_PORT = process.env.SPENDVETO_PROXY_PORT || 8404;

// Agent identities (Skyfire-style "know your agent"): each agent gets a
// bearer token, optionally bound to one child wallet. OPEN MODE while no
// agents are registered (zero-setup demos keep working); the moment the
// first identity exists, /proxy/call and /proxy/llm require a token — and a
// token bound to a wallet can never spend as anyone else.
const AGENTS_PATH = fileURLToPath(new URL("../data/agents.json", import.meta.url));
function readAgents() {
  try {
    return JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  } catch {
    return [];
  }
}
function resolveAgent(req) {
  const agents = readAgents();
  if (agents.length === 0) return { open: true };
  const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const agent = agents.find((a) => a.token === token);
  return agent ? { agent } : { unauthorized: true };
}
const app = express();
app.use(express.json());
// Local-tool CORS: lets the Console (:8402) drive agent registration.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/proxy/health", (req, res) => {
  res.json({
    ok: true,
    mode: MODE,
    custody: account.address,
    tools: TOOLS.map((t) => ({ id: t.id, price: t.price })),
    rails: railsCatalog(),
    chains: CHAINS.map((c) => c.id),
  });
});

// Idempotency: an agent that retries an intent (crash, network blip, LLM
// loop) must never pay twice. Same key within the window → the stored
// response replays, byte for byte, with idempotent:true — no second payment.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const idempotencyStore = new Map(); // key -> { at, status, body }

app.post("/proxy/agents", (req, res) => {
  const { label, child } = req.body || {};
  if (!label || typeof label !== "string") return res.status(400).json({ ok: false, error: "label is required" });
  if (child) {
    try {
      loadChildAccount(child);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }
  const agents = readAgents();
  const record = { id: randomUUID(), label: label.slice(0, 60), child: child || null, token: `tg_${randomUUID().replaceAll("-", "")}`, createdAt: new Date().toISOString() };
  agents.push(record);
  writeFileSync(AGENTS_PATH, JSON.stringify(agents, null, 2));
  res.status(201).json(record); // token shown once at creation, like every API-key flow
});

app.get("/proxy/agents", (req, res) => {
  res.json({ agents: readAgents().map(({ token, ...a }) => ({ ...a, token: `${token.slice(0, 6)}…` })) });
});

const CHILDREN_PATH = fileURLToPath(new URL("../data/children.json", import.meta.url));
function readChildren() {
  try {
    return JSON.parse(readFileSync(CHILDREN_PATH, "utf8"));
  } catch {
    return [];
  }
}

// The "know your agent" credential (Skyfire/Visa/Mastercard call this a
// verified agent ID): one read-only view that joins everything SpendVeto
// already knows about an agent identity — its bound wallet, that wallet's
// governance trust score, its live freeze status, and the delegation scope
// (cap/tools/chains/payees) constraining it — into a single answer to "can I
// trust a call claiming to be this agent, and what is it actually allowed to
// do?" A counterparty (or this same operator, before approving a payee) can
// check this without reading four separate endpoints and cross-referencing
// by hand.
app.get("/proxy/agents/:id/credential", (req, res) => {
  const agent = readAgents().find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "no agent with that id" });

  const { token, ...identity } = agent;
  const agentFreeze = findActiveFreeze(agentFreezeKey(agent.id));
  const credential = { ...identity, agentFrozen: Boolean(agentFreeze), wallet: null };

  if (agent.child) {
    const childRecord = readChildren().find(
      (c) => c.label === agent.child || c.address?.toLowerCase() === agent.child.toLowerCase()
    );
    if (childRecord) {
      const trust = trustScoreFor(childRecord.address);
      const freeze = findActiveFreeze(childRecord.address);
      const delegation = findDelegationForChild(childRecord.address);
      credential.wallet = {
        address: childRecord.address,
        trustScore: trust.score,
        trustGrade: trust.grade,
        signals: trust.signals,
        frozen: Boolean(freeze),
        scope: delegation
          ? {
              capUSD: delegation.capUSD,
              allowedTools: delegation.allowedTools,
              allowedChains: delegation.allowedChains,
              allowedPayees: delegation.allowedPayees,
              expiresAt: delegation.expiresAt,
              revoked: delegation.revoked,
            }
          : null,
      };
    }
  }

  res.json(credential);
});

// Per-agent throttling and freezing, independent of the wallet it spends
// through. Wallet-level budget caps and freezes (client/policy.js,
// server/freezes.js) stay the source of truth for money; several agent
// identities can share one wallet (see agents.json), so a single misbehaving
// or looping agent needs to be stoppable WITHOUT freezing every other agent
// that happens to spend through the same wallet. Reuses the existing freeze
// store under a synthetic `agent:<id>` key — same persistence, same
// dashboard visibility, same alert delivery, just not a wallet address.
const AGENT_RATE_LIMIT_PER_MIN = Number(process.env.PER_AGENT_CALLS_PER_MIN) || 20;
const AGENT_AUTOFREEZE_AFTER = 3; // consecutive rate-limited windows before auto-freeze
const agentCallLog = new Map(); // agentId -> call timestamps within the last minute
const agentViolations = new Map(); // agentId -> consecutive rate-limit hits

function agentFreezeKey(agentId) {
  return `agent:${agentId}`;
}

function checkAgentThrottle(agentId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (agentCallLog.get(agentId) || []).filter((t) => t > windowStart);
  if (recent.length >= AGENT_RATE_LIMIT_PER_MIN) {
    const violations = (agentViolations.get(agentId) || 0) + 1;
    agentViolations.set(agentId, violations);
    if (violations >= AGENT_AUTOFREEZE_AFTER) {
      createFreeze({
        address: agentFreezeKey(agentId),
        reason: `auto-frozen: exceeded ${AGENT_RATE_LIMIT_PER_MIN} calls/min for ${violations} consecutive windows`,
        source: "anomaly",
      });
    }
    return { limited: true, violations };
  }
  recent.push(now);
  agentCallLog.set(agentId, recent);
  agentViolations.set(agentId, 0);
  return { limited: false };
}

// Runs after resolveAgent() on every governed proxy route. Returns a response
// object ({status, body}) if the request must be refused, or null to proceed.
function enforceAgentLimits(auth) {
  if (!auth.agent) return null; // open mode / unauthenticated — nothing to key the limit on
  const freeze = findActiveFreeze(agentFreezeKey(auth.agent.id));
  if (freeze) return { status: 403, body: { ok: false, error: `agent frozen: ${freeze.reason}`, code: "agent_frozen" } };
  const throttle = checkAgentThrottle(auth.agent.id);
  if (throttle.limited) {
    return {
      status: 429,
      body: { ok: false, error: `agent rate limit exceeded (${AGENT_RATE_LIMIT_PER_MIN} calls/min)`, code: "agent_rate_limited" },
    };
  }
  return null;
}

app.post("/proxy/agents/:id/freeze", (req, res) => {
  const agent = readAgents().find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "no agent with that id" });
  res.status(201).json(createFreeze({ address: agentFreezeKey(agent.id), reason: req.body?.reason || "manually frozen", source: "manual" }));
});

app.post("/proxy/agents/:id/unfreeze", (req, res) => {
  const agent = readAgents().find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "no agent with that id" });
  const freeze = findActiveFreeze(agentFreezeKey(agent.id));
  if (!freeze) return res.status(409).json({ ok: false, error: "agent is not frozen" });
  res.json(unfreeze(freeze.id));
});

app.post("/proxy/call", async (req, res) => {
  const auth = resolveAgent(req);
  if (auth.unauthorized) return res.status(401).json({ ok: false, error: "agent identities are registered on this proxy — send Authorization: Bearer <agent token>" });
  const limited = enforceAgentLimits(auth);
  if (limited) return res.status(limited.status).json(limited.body);
  const { tool: toolId, chain: chainId, dryRun, query } = req.body || {};
  // A wallet-bound agent token always spends as its own wallet.
  const child = auth.agent?.child ?? req.body?.child;
  const idemKey = req.get("Idempotency-Key") || req.body?.idempotencyKey;
  // The stored entry is scoped to the WHOLE intent (key + tool + child +
  // chain), so reusing a key with a different intent can never replay the
  // other intent's result — poisoning-proof, each combination stands alone.
  const idemScope = idemKey
    ? createHash("sha256").update([idemKey, toolId, child || "", chainId || ""].join("|")).digest("hex")
    : null;
  if (idemScope) {
    const hit = idempotencyStore.get(idemScope);
    if (hit && Date.now() - hit.at < IDEMPOTENCY_TTL_MS) {
      return res.status(hit.status).json({ ...hit.body, idempotent: true });
    }
  }
  const remember = (status, body) => {
    if (idemScope && !req.body?.dryRun) idempotencyStore.set(idemScope, { at: Date.now(), status, body });
    return body;
  };
  const tool = await findAnyTool(toolId);
  if (!tool) {
    return res.status(404).json({ ok: false, error: `unknown tool "${toolId}" — see GET ${SERVER_URL}/api/catalog for static + marketplace listings` });
  }
  const chain = chainId || DEFAULT_CHAIN;
  if (!findChain(chain)) {
    return res.status(400).json({ ok: false, error: `unknown chain "${chain}" — registered: ${CHAINS.map((c) => c.id).join(", ")}` });
  }

  let payer = account;
  if (child) {
    try {
      payer = loadChildAccount(child);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // Dry run: evaluate the full policy pipeline for this intent and report the
  // verdict — no payment, no approval request, no ledger entry. Lets an agent
  // (or an orchestrator) plan around governance instead of discovering it.
  if (dryRun) {
    const verdict = await checkPolicy(payer.address, tool.price, tool.id, chain);
    return res.json({
      ok: true,
      dryRun: true,
      payer: payer.address,
      tool: tool.id,
      price: tool.price,
      chain,
      decision: verdict.allowed ? (verdict.requiresApproval ? "would_pause_for_approval" : "would_pay") : "would_block",
      ...(verdict.allowed ? {} : { denial: { code: verdict.code, reason: verdict.reason, suggestion: verdict.suggestion } }),
    });
  }

  // Only plain string values ever reach the outbound URL as query params — an object/array
  // here would otherwise serialize as "[object Object]" against a real upstream.
  const safeQuery =
    query && typeof query === "object"
      ? Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === "string").slice(0, 20))
      : undefined;

  const statusLog = [];
  const result = await governedCall(tool, payer, {
    approvalTimeoutMs: Number(process.env.APPROVAL_TIMEOUT_MS) || 30000,
    onStatus: (line) => statusLog.push(line),
    chain,
    query: safeQuery,
  });

  if (!result.ok) {
    // 403: the governance layer refused — nothing was signed, nothing moved.
    // The structured denial (code + suggestion) rides along so the calling
    // agent can self-correct instead of retry-looping.
    return res.status(403).json(remember(403, { ok: false, stage: result.stage, reason: result.reason, denial: result.denial ?? null, statusLog }));
  }
  res.json(remember(200, { ok: true, payer: payer.address, data: result.data, statusLog }));
});

// ------------------------------------------------------------------
// The API-spend rail: governing the money agents ALREADY burn (LLM
// tokens, metered APIs) with the same pipeline that governs USDC.
// Auth/capture shape: estimate the worst-case cost up front, run the
// FULL governance pipeline against the estimate (freeze → policy →
// budgets → human approval, fails closed), execute only if it passes,
// then meter the ACTUAL cost into the same ledger the crypto rail uses
// — same budgets, same kill switch, same trust scores.
//
// Rates come from env (LLM_RATE_IN_PER_M / LLM_RATE_OUT_PER_M, USD per
// million tokens — set them from your provider's current price sheet).
// Without ANTHROPIC_API_KEY the completion is simulated (canned text,
// deterministic token count) — real governance, simulated upstream,
// exactly like simulate-mode settlement.
const RATE_IN = Number(process.env.LLM_RATE_IN_PER_M || 1.0);
const RATE_OUT = Number(process.env.LLM_RATE_OUT_PER_M || 1.0);
const perTokenUSD = (tokens, rate) => (tokens / 1e6) * rate;

app.post("/proxy/llm", async (req, res) => {
  const auth = resolveAgent(req);
  if (auth.unauthorized) return res.status(401).json({ ok: false, error: "agent identities are registered on this proxy — send Authorization: Bearer <agent token>" });
  const limited = enforceAgentLimits(auth);
  if (limited) return res.status(limited.status).json(limited.body);
  const { prompt, maxTokens = 512, approvalTimeoutMs } = req.body || {};
  const child = auth.agent?.child ?? req.body?.child;
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ ok: false, error: "prompt (string) is required" });

  let payer = account;
  if (child) {
    try {
      payer = loadChildAccount(child);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  const promptTokensEst = Math.ceil(prompt.length / 4);
  const estimateUSD = Number((perTokenUSD(promptTokensEst, RATE_IN) + perTokenUSD(Number(maxTokens), RATE_OUT)).toFixed(6));

  // Same per-wallet serialization as governedCall — this route governs and
  // meters spend inline instead of going through governedCall, so it needs
  // its own lock to close the identical check-then-spend race.
  const outcome = await withWalletLock(payer.address, async () => {
    const verdict = await checkPolicy(payer.address, estimateUSD, "llm.chat", undefined, "api");
    if (!verdict.allowed) {
      await logEvent({ address: payer.address, resource: "llm.chat", price: estimateUSD, chain: "api", category: "api", status: "blocked", reason: verdict.reason });
      return { status: 403, body: { ok: false, stage: "policy", reason: verdict.reason, denial: verdict.code ? { code: verdict.code, suggestion: verdict.suggestion } : null, estimateUSD } };
    }
    if (verdict.requiresApproval) {
      const { outcome: decision } = await waitForApproval({ path: "llm.chat", price: String(estimateUSD) }, payer, Number(approvalTimeoutMs) || Number(process.env.APPROVAL_TIMEOUT_MS) || 30000);
      if (decision !== "approved") {
        const reason = decision === "denied" ? "denied by human approver" : "approval timed out";
        await logEvent({ address: payer.address, resource: "llm.chat", price: estimateUSD, chain: "api", status: "blocked", reason });
        return { status: 403, body: { ok: false, stage: "approval", reason: `${reason} — failed closed, upstream was never called`, estimateUSD } };
      }
    }

    // Execute upstream only after the pipeline passed.
    let text;
    let usage;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: process.env.LLM_MODEL || "claude-haiku-4-5-20251001", max_tokens: Number(maxTokens), messages: [{ role: "user", content: prompt }] }),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error?.message || `upstream ${r.status}`);
        text = body.content?.[0]?.text ?? "";
        usage = { inputTokens: body.usage?.input_tokens ?? promptTokensEst, outputTokens: body.usage?.output_tokens ?? 0, real: true };
      } catch (err) {
        await logEvent({ address: payer.address, resource: "llm.chat", price: estimateUSD, chain: "api", status: "failed", reason: err.message });
        return { status: 502, body: { ok: false, stage: "upstream", reason: err.message } };
      }
    } else {
      const outputTokens = Math.min(Number(maxTokens), 200);
      text = "(no ANTHROPIC_API_KEY configured — simulated completion; governance and metering above were real)";
      usage = { inputTokens: promptTokensEst, outputTokens, real: false };
    }

    const actualUSD = Number((perTokenUSD(usage.inputTokens, RATE_IN) + perTokenUSD(usage.outputTokens, RATE_OUT)).toFixed(6));
    await logEvent({ address: payer.address, resource: "llm.chat", price: actualUSD, chain: "api", category: "api", status: "paid" });
    return { status: 200, body: { ok: true, payer: payer.address, text, usage, estimateUSD, actualUSD, rail: usage.real ? "anthropic-api" : "llm-simulate" } };
  });
  res.status(outcome.status).json(outcome.body);
});

app.listen(PROXY_PORT, () => {
  console.log(`SpendVeto enforcement proxy — mode: ${MODE}`);
  console.log(`Custody wallet: ${account.address} (agents never see this key)`);
  console.log(`POST http://localhost:${PROXY_PORT}/proxy/call  {"tool":"review","child":"optional label"}`);
});
