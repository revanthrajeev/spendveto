// One API, any rail. Every payment rail plugs in behind the same contract:
// { id, name, status, note, pay({ tool, account, chain, baseUrl }) → data }.
// The governance pipeline (policy → approval → pay) never cares which rail
// settles — that is the whole positioning, and this file is where it is true.
// Roadmap slots are declared but refuse honestly: no adapter pretends.
import x402Simulate from "./x402-simulate.js";
import x402Live from "./x402-testnet.js";
import safeAllowance from "./safe-allowance.js";

const roadmapRail = (id, name, note) => ({
  id,
  name,
  status: "roadmap",
  note,
  async pay() {
    throw new Error(
      `the "${id}" rail adapter is not implemented yet — it is a funded-roadmap slot behind the same pay() contract; x402 settles today (simulate + Base Sepolia)`
    );
  },
});

export const RAILS = [
  x402Simulate,
  x402Live,
  roadmapRail("google-ap2", "Google AP2", "mandate-based agent payments — adapter slot"),
  roadmapRail("openai-acp", "OpenAI ACP", "agentic checkout — adapter slot"),
  roadmapRail("stripe-mpp", "Stripe Machine Payments", "fiat machine payments — adapter slot"),
  safeAllowance,
];

export function getRail(id) {
  return RAILS.find((r) => r.id === id);
}

// Metadata-only view for APIs/UIs — never leaks the pay functions.
export function railsCatalog() {
  return RAILS.map(({ id, name, status, note }) => ({ id, name, status, note }));
}
