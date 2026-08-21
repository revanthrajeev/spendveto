// Type declarations for spendveto-sdk. Hand-written to match index.js — the
// SDK is intentionally dependency-free and small, so these stay in sync by
// inspection rather than a build step.

export interface SpendVetoOptions {
  /** Enforcement proxy base URL. Default: SPENDVETO_PROXY_URL or http://localhost:8404 */
  proxyUrl?: string;
  /** Governed API/server base URL. Default: SPENDVETO_SERVER_URL or http://localhost:8402 */
  serverUrl?: string;
  /** Bearer token for a registered agent identity. Required once any identity exists on the proxy. */
  agentToken?: string;
}

export interface PayOptions {
  /** Spend as a delegated child wallet, by label or address. */
  child?: string;
  /** Settlement chain id (e.g. "base-sepolia", "polygon"). */
  chain?: string;
  /** Preview only — run the full pipeline with zero side effects. */
  dryRun?: boolean;
  /** Idempotency key: a retry with the same key never pays twice. */
  idempotencyKey?: string;
  /**
   * Per-call input, forwarded as query params on the tool's own request. This is the one
   * channel a paid GET-behind-x402 call has for per-call data — e.g. a marketplace tool
   * whose upstreamUrl proxies to a real API: `tg.pay("basis-match", { query: { opinion } })`.
   * String values only; anything else is dropped rather than silently stringified.
   */
  query?: Record<string, string>;
}

export interface Settlement {
  amount: string;
  currency: string;
  chain: string;
  receiptId: string;
  signedBy: string;
  signature: string;
  [k: string]: unknown;
}

export interface PayResult {
  ok: true;
  stage: "paid";
  data: unknown;
  settlement?: Settlement;
  [k: string]: unknown;
}

export type DryRunDecision = "would_pay" | "would_pause_for_approval" | "would_block";

export interface DryRunResult {
  dryRun: true;
  decision: DryRunDecision;
  reason?: string;
  denial?: { code?: string; suggestion?: string };
  [k: string]: unknown;
}

export interface ChatOptions {
  maxTokens?: number;
  child?: string;
  approvalTimeoutMs?: number;
}

export interface ChatResult {
  ok: true;
  text: string;
  costUSD?: number;
  [k: string]: unknown;
}

export interface AgentRecord {
  id: string;
  label: string;
  child: string | null;
  token: string;
  createdAt: string;
}

/** Thrown on any refusal (policy block, human denial, approval timeout). */
export class SpendVetoDenialError extends Error {
  name: "SpendVetoDenialError";
  code?: string;
  suggestion?: string;
  stage?: string;
  constructor(args: { reason?: string; code?: string; suggestion?: string; stage?: string });
}

export class SpendVeto {
  constructor(options?: SpendVetoOptions);
  proxyUrl: string;
  serverUrl: string;
  agentToken?: string;
  /** Pay for a catalog tool through the governed pipeline. Throws SpendVetoDenialError on refusal. */
  pay(toolId: string, opts?: PayOptions): Promise<PayResult>;
  /** Preview a spend with zero side effects. */
  dryRun(toolId: string, opts?: PayOptions): Promise<DryRunResult>;
  /** Governed LLM/API spend: estimate → full pipeline (fails closed) → meter actual cost. */
  chat(prompt: string, opts?: ChatOptions): Promise<ChatResult>;
  /** The live tool catalog. */
  catalog(): Promise<{ tools: Array<{ id: string; price: string; [k: string]: unknown }> }>;
  /** Mint a bearer token for a new agent identity. Token is returned once. */
  registerAgent(label: string, opts?: { child?: string }): Promise<AgentRecord>;
  /** Proxy health + custody address + advertised rails/chains. */
  health(): Promise<{ ok: boolean; mode: string; custody: string; [k: string]: unknown }>;
}

export default SpendVeto;
