// OpenAI Agents SDK-shaped tools for SpendVeto: each catalog entry becomes a
// { name, description, parameters, execute } object — the duck-typed shape the
// Agents SDK's `tool()` helper accepts. Like the LangChain adapter this file
// has zero framework imports, so it doesn't force the SDK on anyone; it just
// emits the contract:
//
//   import { createSpendVetoFunctionTools } from "../integrations/openai-agents.js";
//   import { tool } from "@openai/agents";
//   const raw = await createSpendVetoFunctionTools({ agentToken: "tg_..." });
//   const tools = raw.map((t) => tool({ name: t.name, description: t.description, parameters: t.parameters, execute: t.execute }));
//
// Every execute() goes through the same governed proxy path as the LangChain
// adapter (freeze check → policy caps → delegation walk → human approval),
// all BEFORE anything is signed — and a blocked call throws with the
// structured denial's code/suggestion so the agent can self-correct.
import { createSpendVetoTools } from "./langchain.js";

export async function createSpendVetoFunctionTools(opts = {}) {
  const tools = await createSpendVetoTools(opts);
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    price: t.price,
    // Catalog tools take no arguments today (the tool id IS the request); an
    // explicit empty-object schema keeps strict-mode function calling happy.
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    execute: t.func,
  }));
}

// Convenience for the common case: one governed tool by id.
export async function createSpendVetoFunctionTool(toolId, opts = {}) {
  const tools = await createSpendVetoFunctionTools(opts);
  const match = tools.find((t) => t.name === `spendveto_${toolId}`);
  if (!match) throw new Error(`no tool "${toolId}" in the SpendVeto catalog`);
  return match;
}
