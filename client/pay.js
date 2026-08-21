import { MODE, PORT, DEFAULT_CHAIN } from "../shared-config.js";
import { getRail } from "../rails/index.js";
import { checkPolicy } from "./policy.js";

const BASE_URL = `http://localhost:${PORT}`;
const APPROVAL_POLL_MS = 800;

export function logEvent(event) {
  return fetch(`${BASE_URL}/api/ledger/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {});
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Per-wallet serialization: checkPolicy() reads recent/delegated spend over
// HTTP, and the actual debit+ledger-append happens several `await`s later —
// two concurrent calls for the SAME wallet can both read the same "spent so
// far" snapshot, both pass a cap that only has room for one, and both spend
// (the exact "20 agents each pass a budget check simultaneously" failure
// mode). withWalletLock serializes the whole decide-and-commit unit per
// address (a pending human approval on one call correctly blocks a second
// concurrent call for the same wallet from being evaluated against stale
// numbers) while leaving unrelated wallets free to run concurrently. Scope:
// per Node process — covers the proxy handling many agents, not two
// independent OS processes racing the same key.
const walletLocks = new Map(); // address (lowercased) -> tail of that wallet's queue
export function withWalletLock(address, fn) {
  const key = address.toLowerCase();
  const tail = walletLocks.get(key) || Promise.resolve();
  const run = tail.then(fn, fn);
  walletLocks.set(key, run.then(() => {}, () => {}));
  return run;
}

// Posts a pending approval and blocks until a human decides via the dashboard
// — or times out, which fails closed rather than leaving an autonomous agent
// waiting forever. Returns "approved" | "denied" | "timeout" plus the record id.
export async function waitForApproval(tool, account, timeoutMs) {
  const created = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, resource: tool.path, price: tool.price }),
  }).then((r) => r.json());

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await fetch(`${BASE_URL}/api/approvals/${created.id}`).then((r) => r.json());
    if (record.status !== "pending") return { outcome: record.status, id: created.id };
    await sleep(APPROVAL_POLL_MS);
  }
  return { outcome: "timeout", id: created.id };
}

// The full governed pipeline shared by the CLI and the MCP server:
// policy check → human approval if required → pay (either mode) → log.
// `onStatus` receives progress strings for whichever UI is driving this.
// Wrapped in withWalletLock so concurrent calls for the same wallet can never
// both pass the same cap — see the comment above the lock.
export function governedCall(tool, account, opts = {}) {
  return withWalletLock(account.address, () => governedCallUnlocked(tool, account, opts));
}

async function governedCallUnlocked(tool, account, { onStatus = () => {}, approvalTimeoutMs = 30000, chain = DEFAULT_CHAIN, query } = {}) {
  const policyCheck = await checkPolicy(account.address, tool.price, tool.id, chain, tool.category, tool.payTo);
  if (!policyCheck.allowed) {
    await logEvent({ address: account.address, resource: tool.path, price: tool.price, chain, status: "blocked", reason: policyCheck.reason });
    // The denial is structured so the calling agent can self-correct instead
    // of crashing or retry-looping: a machine code plus a concrete fix.
    return {
      ok: false,
      stage: "policy",
      reason: policyCheck.reason,
      denial: policyCheck.code ? { code: policyCheck.code, suggestion: policyCheck.suggestion } : undefined,
      policyCheck,
    };
  }
  onStatus(`Policy check passed (${policyCheck.recent.count} calls / $${policyCheck.recent.totalUSD.toFixed(4)} spent in the last hour).`);

  if (policyCheck.requiresApproval) {
    onStatus(
      `Price $${tool.price} is above the $${policyCheck.policy.requireApprovalAboveUSD} auto-approve line — requesting human sign-off on the dashboard (${BASE_URL}/).`
    );
    const { outcome } = await waitForApproval(tool, account, approvalTimeoutMs);
    if (outcome === "denied") {
      await logEvent({ address: account.address, resource: tool.path, price: tool.price, chain, status: "blocked", reason: "denied by human approver" });
      return {
        ok: false,
        stage: "approval",
        reason: "denied by human approver",
        denial: { code: "approval_denied", suggestion: "do not retry the same purchase; a human explicitly declined it — ask them what would be acceptable" },
        policyCheck,
      };
    }
    if (outcome === "timeout") {
      await logEvent({ address: account.address, resource: tool.path, price: tool.price, chain, status: "blocked", reason: "approval timed out" });
      return {
        ok: false,
        stage: "approval",
        reason: `no human decision within ${approvalTimeoutMs / 1000}s — failed closed, did not spend`,
        denial: { code: "approval_timeout", suggestion: "retry when an approver is available, or continue with a tool priced under the approval threshold" },
        policyCheck,
      };
    }
    onStatus("APPROVED — proceeding to pay.");
  }

  try {
    // The rail is resolved from the registry — governance above, rails below.
    const rail = getRail(MODE === "testnet" ? "x402-live" : "x402-simulate");
    const data = await rail.pay({ tool, account, chain, baseUrl: BASE_URL, query });
    if (MODE === "testnet") {
      await logEvent({ address: account.address, resource: tool.path, price: tool.price, chain, status: "paid" });
    }
    return { ok: true, stage: "paid", data, policyCheck };
  } catch (err) {
    if (MODE === "testnet") {
      await logEvent({ address: account.address, resource: tool.path, price: tool.price, chain, status: "failed", reason: err.message });
    }
    return { ok: false, stage: "payment", reason: err.message, policyCheck };
  }
}
