// LangChain-shaped tools for SpendVeto: each catalog entry becomes a
// { name, description, func } object — the same duck-typed shape LangChain's
// `tool()` (from "@langchain/core/tools") accepts, and that most agent
// frameworks besides LangChain accept unmodified too. No hard dependency on
// @langchain/core here — this file has zero imports beyond the project's own
// config, so it doesn't force a LangChain install on anyone who isn't using
// LangChain.
//
// Calls go through the enforcement proxy (/proxy/call), the same governed
// path a keyless agent would use: freeze check, policy caps, delegation
// walk, human approval if the price crosses the threshold — all of it runs
// BEFORE anything is signed. A blocked call throws with the structured
// denial's code/suggestion in the message, so an agent's next reasoning step
// can see why and self-correct instead of retry-looping.
//
//   import { createSpendVetoTools } from "../integrations/langchain.js";
//   import { tool } from "@langchain/core/tools";
//   const raw = await createSpendVetoTools({ agentToken: "tg_..." });
//   const tools = raw.map((t) => tool(t.func, { name: t.name, description: t.description }));

const DEFAULT_PROXY_URL = process.env.SPENDVETO_PROXY_URL || "http://localhost:8404";
const DEFAULT_SERVER_URL = process.env.SPENDVETO_SERVER_URL || "http://localhost:8402";

async function callProxy(proxyUrl, agentToken, body) {
  const res = await fetch(`${proxyUrl}/proxy/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const suggestion = data.denial?.suggestion ? ` Fix: ${data.denial.suggestion}` : "";
    const err = new Error(`spendveto blocked this spend${data.denial?.code ? ` [${data.denial.code}]` : ""}: ${data.reason}.${suggestion}`);
    err.code = data.denial?.code;
    err.suggestion = data.denial?.suggestion;
    throw err;
  }
  return data;
}

// One tool per catalog entry (static + marketplace), fetched live so newly
// registered marketplace tools show up without redeploying the agent.
export async function createSpendVetoTools({ proxyUrl = DEFAULT_PROXY_URL, serverUrl = DEFAULT_SERVER_URL, agentToken, child, chain } = {}) {
  const { tools } = await fetch(`${serverUrl}/api/catalog`).then((r) => r.json());
  return tools.map((t) => ({
    name: `spendveto_${t.id}`,
    description: `${t.description} Costs $${t.price} USD, governed by SpendVeto spend policy — may pause for human approval or be refused outright.`,
    price: t.price,
    func: async () => {
      const result = await callProxy(proxyUrl, agentToken, { tool: t.id, child, chain });
      return typeof result.data?.result?.text === "string" ? result.data.result.text : JSON.stringify(result.data);
    },
  }));
}

// Convenience for the common case: one governed tool by id instead of the
// whole catalog.
export async function createSpendVetoTool(toolId, opts = {}) {
  const tools = await createSpendVetoTools(opts);
  const match = tools.find((t) => t.name === `spendveto_${toolId}`);
  if (!match) throw new Error(`no tool "${toolId}" in the SpendVeto catalog`);
  return match;
}
