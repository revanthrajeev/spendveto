import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

// Each tool is a real, distinct Claude task with its own canned fallback —
// same permanent-free-when-no-key pattern as the original single-tool build.
const TASKS = {
  review: {
    prompt:
      "You are a terse code-review agent. Review this snippet for bugs in 3 sentences or fewer:\n\n" +
      "function sumArray(arr) {\n  let total = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}",
    canned:
      "Off-by-one bug: the loop condition is `i <= arr.length`, so on the last iteration " +
      "`arr[arr.length]` is read, which is `undefined`, and `total += undefined` makes the " +
      "whole result `NaN`. Fix: use `i < arr.length`.",
  },
  summarize: {
    prompt:
      "Summarize this passage in exactly one sentence:\n\n" +
      "The x402 protocol resurrects the long-unused HTTP 402 Payment Required status code, letting a server " +
      "ask a client for a stablecoin micropayment before serving a request. For autonomous AI agents, this " +
      "means paying for a tool call can happen without a human ever entering a card number — the agent's " +
      "wallet signs a payment, the server verifies it, and the request completes in the same round trip.",
    canned:
      "x402 repurposes the HTTP 402 status code so a server can request a stablecoin micropayment before " +
      "serving a request, letting AI agents pay for tool calls with no human card entry, all in one round trip.",
  },
  translate: {
    prompt: "Translate this phrase to French, respond with only the translation:\n\nThe agent paid for its own tool call.",
    canned: "L'agent a payé pour son propre appel d'outil.",
  },
};

export async function runTool(toolId) {
  const task = TASKS[toolId];
  if (!task) throw new Error(`unknown tool: ${toolId}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: `(no ANTHROPIC_API_KEY configured — canned response)\n\n${task.canned}`, real: false, model: null };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: task.prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return { text: textBlock ? textBlock.text : "", real: true, model: MODEL };
}
