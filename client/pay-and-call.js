import { MODE, PORT, TOOLS, CHAINS, DEFAULT_CHAIN, findChain, findTool } from "../shared-config.js";
import { account as parentAccount, walletIsEphemeral, loadChildAccount } from "./wallet.js";
import { governedCall } from "./pay.js";
import { checkPolicy } from "./policy.js";

const args = process.argv.slice(2);
// --child spends as the most recent child wallet; --child="intern" (label or
// address) picks a specific one from data/children.json.
const childArg = args.find((a) => a === "--child" || a.startsWith("--child="));
const childSelector = childArg?.includes("=") ? childArg.split("=").slice(1).join("=").replace(/^"|"$/g, "") : null;
// --chain=polygon settles on that chain's balance (default: base-sepolia).
const chainArg = args.find((a) => a.startsWith("--chain="));
const chain = chainArg ? chainArg.split("=")[1] : DEFAULT_CHAIN;
if (!findChain(chain)) {
  console.error(`Unknown chain "${chain}". Registered: ${CHAINS.map((c) => c.id).join(", ")}`);
  process.exit(1);
}
// --dry-run evaluates the full policy pipeline and reports the decision
// without paying, logging, or requesting approval — zero side effects.
const dryRun = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("--"));
// Any other --key=value becomes a query param on the tool's own request — the one channel a
// paid GET-behind-x402 call has for per-call input (e.g. `--opinion="rates fall this year"`
// against a marketplace tool whose upstreamUrl forwards it). Reserved flags above are excluded
// so `--chain=polygon` doesn't leak into the upstream call as a literal ?chain=polygon.
const RESERVED = new Set(["child", "chain"]);
const query = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--") && a.includes("="))
    .map((a) => {
      const eq = a.indexOf("=");
      return [a.slice(2, eq), a.slice(eq + 1).replace(/^"|"$/g, "")];
    })
    .filter(([k]) => k && !RESERVED.has(k)),
);

const toolId = positional[0] || "review";
let tool = findTool(toolId);
if (!tool) {
  // Marketplace tools live in the server's catalog, not the static config.
  try {
    const { tools } = await fetch(`http://localhost:${PORT}/api/catalog`).then((r) => r.json());
    tool = tools.find((t) => t.id === toolId) || null;
  } catch {}
  if (!tool) {
    console.error(`Unknown tool "${toolId}". Available: ${TOOLS.map((t) => t.id).join(", ")} (+ any registered marketplace tools — see /api/catalog)`);
    process.exit(1);
  }
}

let account = parentAccount;
let walletNote = walletIsEphemeral ? "  (ephemeral — generated this run)" : "";
if (childArg) {
  try {
    account = loadChildAccount(childSelector);
    walletNote = `  (delegated child wallet${childSelector ? ` "${childSelector}"` : ""})`;
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

async function main() {
  console.log(`SpendVeto client — mode: ${MODE}`);
  console.log(`Wallet: ${account.address}${walletNote}`);
  console.log(`Chain: ${chain}${chain === DEFAULT_CHAIN ? "" : "  (per-chain balance, chain-scoped signature)"}`);
  console.log(`Tool: ${tool.id} — ${tool.description}`);

  if (dryRun) {
    const verdict = await checkPolicy(account.address, tool.price, tool.id, chain, tool.category, tool.payTo);
    if (verdict.allowed) {
      console.log(`\nDRY RUN — would ${verdict.requiresApproval ? "PAUSE for human approval, then pay" : "PAY immediately"} ($${tool.price} on ${chain}). Nothing was spent or logged.`);
    } else {
      console.log(`\nDRY RUN — would be BLOCKED [${verdict.code}]: ${verdict.reason}`);
      if (verdict.suggestion) console.log(`Fix: ${verdict.suggestion}`);
      console.log("Nothing was spent or logged.");
      process.exitCode = 1;
    }
    return;
  }

  const qs = Object.keys(query).length ? `?${new URLSearchParams(query)}` : "";
  console.log(`Calling GET http://localhost:${PORT}${tool.path}${qs}  (agreed price: $${tool.price})\n`);

  const result = await governedCall(tool, account, {
    onStatus: (line) => console.log(line),
    approvalTimeoutMs: Number(process.env.APPROVAL_TIMEOUT_MS) || 30000,
    chain,
    query,
  });

  if (!result.ok) {
    if (result.stage === "policy") console.log(`BLOCKED by policy: ${result.reason}`);
    else if (result.stage === "approval") console.log(`\n${result.reason.includes("denied") ? "DENIED by approver." : `No approval — ${result.reason} (failing closed).`}`);
    if (result.denial?.suggestion) console.log(`Fix: ${result.denial.suggestion}`);
    else {
      console.error(`\nPayment/call failed: ${result.reason}`);
      if (MODE === "testnet") {
        console.error(`\nMost likely cause: the client wallet has no testnet USDC yet.`);
        console.error(`Fund it at https://faucet.circle.com (select Base Sepolia) with address:\n  ${account.address}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  const { data } = result;
  console.log(`\nPaid $${tool.price} USDC — settlement:`, data.settlement ?? "(see facilitator response)");
  console.log(`\nAgent output${data.result?.real ? "" : " (canned — no ANTHROPIC_API_KEY set)"}:\n`);
  console.log(data.result?.text ?? JSON.stringify(data, null, 2));
}

main();
