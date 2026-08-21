// A thin, dependency-free client for the SpendVeto enforcement proxy — the
// "npm import instead of curl" surface a July 2026 GPT deep-research pass
// independently flagged as missing. Agents never hold a wallet: they call
// these methods, and the proxy runs the full governance pipeline (freeze ->
// policy -> delegation caps -> human approval) before signing anything.
//
//   import { SpendVeto } from "spendveto-sdk";
//   const tg = new SpendVeto({ agentToken: "tg_..." });
//   const result = await tg.pay("review");            // throws SpendVetoDenialError if refused
//   const preview = await tg.dryRun("review");         // zero side effects
//   const reply = await tg.chat("summarize this...");  // governed LLM/API spend

export class SpendVetoDenialError extends Error {
  constructor({ reason, code, suggestion, stage }) {
    super(`spendveto ${stage || "policy"} denial${code ? ` [${code}]` : ""}: ${reason}`);
    this.name = "SpendVetoDenialError";
    this.code = code;
    this.suggestion = suggestion;
    this.stage = stage;
  }
}

export class SpendVeto {
  constructor({ proxyUrl, serverUrl, agentToken } = {}) {
    this.proxyUrl = proxyUrl || process.env.SPENDVETO_PROXY_URL || "http://localhost:8404";
    this.serverUrl = serverUrl || process.env.SPENDVETO_SERVER_URL || "http://localhost:8402";
    this.agentToken = agentToken;
  }

  _headers(extra = {}) {
    return { "Content-Type": "application/json", ...(this.agentToken ? { Authorization: `Bearer ${this.agentToken}` } : {}), ...extra };
  }

  // Pay for a catalog tool through the governed pipeline. Resolves with the
  // tool's result on success; throws SpendVetoDenialError on any refusal
  // (policy block, human denial, approval timeout) instead of silently
  // no-oping, so callers can't mistake a blocked spend for a successful one.
  async pay(toolId, { child, chain, dryRun, idempotencyKey, query } = {}) {
    const res = await fetch(`${this.proxyUrl}/proxy/call`, {
      method: "POST",
      headers: this._headers(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      body: JSON.stringify({ tool: toolId, child, chain, dryRun, query }),
    });
    const data = await res.json();
    if (dryRun) return data;
    if (!res.ok || !data.ok) throw new SpendVetoDenialError({ reason: data.reason, code: data.denial?.code, suggestion: data.denial?.suggestion, stage: data.stage });
    return data;
  }

  // Preview a spend with zero side effects (no payment, no ledger entry) —
  // lets an agent plan around governance instead of discovering it.
  dryRun(toolId, opts = {}) {
    return this.pay(toolId, { ...opts, dryRun: true });
  }

  // Governed LLM/API spend: estimate up front, run the full pipeline against
  // the estimate (fails closed — upstream is never called if refused), then
  // meter the ACTUAL cost into the same ledger the crypto rail uses.
  async chat(prompt, { maxTokens = 512, child, approvalTimeoutMs } = {}) {
    const res = await fetch(`${this.proxyUrl}/proxy/llm`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ prompt, maxTokens, child, approvalTimeoutMs }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new SpendVetoDenialError({ reason: data.reason, code: data.denial?.code, suggestion: data.denial?.suggestion, stage: data.stage });
    return data;
  }

  async catalog() {
    return fetch(`${this.serverUrl}/api/catalog`).then((r) => r.json());
  }

  // Mints a bearer token for a new agent identity, optionally bound to one
  // child wallet (a bound token can never spend as anyone else). The token
  // is returned once, like any API-key flow — store it yourself.
  async registerAgent(label, { child } = {}) {
    const res = await fetch(`${this.proxyUrl}/proxy/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, child }),
    });
    if (!res.ok) throw new Error(`could not register agent "${label}": HTTP ${res.status}`);
    return res.json();
  }

  async health() {
    return fetch(`${this.proxyUrl}/proxy/health`).then((r) => r.json());
  }
}

export default SpendVeto;
