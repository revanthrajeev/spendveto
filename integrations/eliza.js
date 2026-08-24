// ElizaOS plugin for SpendVeto.
//
// ElizaOS agents already move money — Solana transfers, swaps, token
// operations — which makes them exactly the population this project exists
// for, and a place where "the agent decided to spend" is a live problem
// rather than a hypothetical one.
//
// Dependency-free on purpose, like integrations/langchain.js: nothing here
// imports @elizaos/core, so adding this file forces an ElizaOS install on
// nobody. It returns plain objects matching ElizaOS's documented Plugin /
// Action / Provider shapes, which the runtime duck-types.
//
//   import { createSpendVetoPlugin } from "@spendveto/sdk/eliza";
//   const plugin = await createSpendVetoPlugin({ agentToken: "tg_..." });
//   // then add `plugin` to your character's plugins array
//
// Two halves, and the second is the interesting one:
//
//   ACTIONS   — one per catalog tool. Every call runs the full governed
//               pipeline through the enforcement proxy (freeze → policy →
//               delegation walk → human approval) BEFORE anything is signed.
//
//   PROVIDER  — injects the wallet's live budget state into the agent's
//               context before it decides anything. This matters more than
//               the actions do: blocking a spend after the model has
//               committed to it produces a retry loop, because the model
//               never learns it was near a limit. Giving it the remaining
//               budget up front lets it choose the cheap tool, or say it
//               can't afford the expensive one, which is a better outcome
//               than a refusal it doesn't understand.

const DEFAULT_PROXY_URL = process.env.SPENDVETO_PROXY_URL || "http://localhost:8404";
const DEFAULT_SERVER_URL = process.env.SPENDVETO_SERVER_URL || "http://localhost:8402";

async function callProxy(proxyUrl, agentToken, body) {
  const res = await fetch(`${proxyUrl}/proxy/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, data };
}

// A refusal is a result, not an exception. ElizaOS handlers return an
// ActionResult, and `success: false` with a machine-readable code in `data`
// is what lets the next reasoning step self-correct instead of retrying the
// same blocked call.
function denialResult(data) {
  const code = data?.denial?.code ?? null;
  const suggestion = data?.denial?.suggestion ?? null;
  return {
    success: false,
    text:
      `SpendVeto refused this spend${code ? ` (${code})` : ""}: ${data?.reason || "blocked by policy"}.` +
      (suggestion ? ` ${suggestion}` : "") +
      " Nothing was spent.",
    error: data?.reason || "blocked by spend policy",
    data: { spendveto: { blocked: true, code, suggestion, stage: data?.stage ?? null } },
  };
}

export async function createSpendVetoPlugin({
  proxyUrl = DEFAULT_PROXY_URL,
  serverUrl = DEFAULT_SERVER_URL,
  agentToken,
  child,
  chain,
} = {}) {
  // Fetched live so a marketplace tool registered after the agent booted still
  // shows up without a redeploy.
  const { tools } = await fetch(`${serverUrl}/api/catalog`).then((r) => r.json());

  const actions = tools.map((t) => ({
    name: `SPENDVETO_${t.id.toUpperCase()}`,
    similes: [t.id.toUpperCase(), `PAID_${t.id.toUpperCase()}`],
    description: `${t.description} Costs $${t.price} USD and is governed by SpendVeto: the spend is checked against policy, delegated budget caps and payee scope before any payment is signed, and may pause for human approval or be refused outright.`,

    // ElizaOS calls validate() before the handler. Cheap local checks only —
    // the authoritative decision belongs at the gate, not here, or an agent
    // could route around it by calling the proxy directly.
    validate: async () => true,

    handler: async (_runtime, _message, _state, _options, callback) => {
      const { ok, data } = await callProxy(proxyUrl, agentToken, { tool: t.id, child, chain });

      if (!ok) {
        const result = denialResult(data);
        if (callback) await callback({ text: result.text });
        return result;
      }

      const text =
        typeof data.data?.result?.text === "string" ? data.data.result.text : JSON.stringify(data.data ?? {});
      const settlement = data.data?.settlement ?? {};
      if (callback) await callback({ text });
      return {
        success: true,
        text,
        values: { spentUSD: Number(t.price) },
        data: {
          spendveto: {
            blocked: false,
            tool: t.id,
            amountUSD: Number(t.price),
            receiptId: settlement.receiptId ?? null,
            chain: settlement.chain ?? chain ?? null,
          },
        },
      };
    },

    examples: [
      [
        { name: "{{user}}", content: { text: `Use the paid ${t.id} tool.` } },
        {
          name: "{{agent}}",
          content: { text: `Running ${t.id} ($${t.price}) through SpendVeto.`, actions: [`SPENDVETO_${t.id.toUpperCase()}`] },
        },
      ],
    ],
  }));

  // The provider is the half that changes agent behaviour rather than just
  // constraining it.
  const budgetProvider = {
    name: "SPENDVETO_BUDGET",
    description: "The agent's live spend budget: what's left this hour, what the per-call ceiling is, and whether the wallet is frozen.",
    get: async () => {
      try {
        const [policy, stats] = await Promise.all([
          fetch(`${serverUrl}/api/policy`).then((r) => r.json()),
          fetch(`${serverUrl}/api/stats`).then((r) => r.json()),
        ]);
        const p = policy.policy ?? policy;
        const spent = Number(stats?.paid?.usd ?? 0);
        const hourly = Number(p?.maxPerHourUSD ?? 0);
        const remaining = hourly > 0 ? Math.max(0, Number((hourly - spent).toFixed(6))) : null;
        const frozen = Number(stats?.frozenWallets ?? 0) > 0;

        const lines = [
          frozen
            ? "SPEND FROZEN: a wallet is frozen and nothing will settle until a human unfreezes it."
            : "Spend is currently permitted.",
          p?.maxPerCallUSD != null ? `Per-call ceiling: $${p.maxPerCallUSD}.` : null,
          remaining != null ? `Remaining this hour: $${remaining} of $${hourly}.` : null,
          p?.requireApprovalAboveUSD != null
            ? `Anything above $${p.requireApprovalAboveUSD} pauses for human approval and fails closed if nobody answers.`
            : null,
          "Choose a tool you can afford; a spend over these limits will be refused before it settles.",
        ].filter(Boolean);

        return {
          text: lines.join(" "),
          values: { spendvetoFrozen: frozen, spendvetoRemainingHourUSD: remaining, spendvetoPerCallCapUSD: p?.maxPerCallUSD ?? null },
          data: { policy: p, spent },
        };
      } catch {
        // A governance layer that can't be reached must not silently imply
        // "unlimited" — say so, so the model stays conservative.
        return {
          text: "SpendVeto budget state is unavailable right now; treat spending as restricted and prefer the cheapest option.",
          values: { spendvetoFrozen: null, spendvetoRemainingHourUSD: null },
          data: {},
        };
      }
    },
  };

  return {
    name: "spendveto",
    description:
      "Spend governance for ElizaOS agents. Every paid action runs through SpendVeto's policy pipeline — caps, budgets, delegation, payee scope and human approval — before any payment is signed, and the agent's remaining budget is injected into its context before it decides.",
    actions,
    providers: [budgetProvider],
    evaluators: [],
    services: [],
  };
}
