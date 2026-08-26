// SpendVeto as MCP middleware: any MCP client (Claude Desktop, Claude Code, …)
// connects to this server and sees the paid catalog as ordinary tools — but
// every call runs the full governed pipeline first: policy check → human
// approval if over the threshold → x402 payment (simulate or testnet) → task.
// The agent never touches the wallet; governance is not optional.
//
// This is the buyer-side counterpart to seller-side MCP monetization
// (Cloudflare Monetization Gateway, Stripe MPP, Nevermined): they help tools
// charge — this governs what YOUR agent is allowed to spend. The catalog this
// server exposes is NOT limited to SpendVeto's own demo tools: it's fetched
// from /api/catalog at boot, which is the built-in tools plus anyone's
// marketplace listing registered via POST /api/catalog/tools (own payTo,
// own price) — so a third party's tool is payable and governed here too,
// with settlement crediting THEIR payTo, not SpendVeto's.
//
// Register with Claude Code:  claude mcp add spendveto -- node <abs-path>/mcp/server.js
// (stdio protocol lives on stdout — all logging here goes to stderr.)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MODE, PORT } from "../shared-config.js";
import { account } from "../client/wallet.js";
import { governedCall } from "../client/pay.js";

const BASE_URL = `http://localhost:${PORT}`;
const server = new McpServer({ name: "spendveto", version: "0.4.0" });

let TOOLS;
try {
  ({ tools: TOOLS } = await fetch(`${BASE_URL}/api/catalog`).then((r) => r.json()));
} catch {
  console.error(`[spendveto] cannot reach ${BASE_URL} — start the server with \`npm run server\` before the MCP server`);
  process.exit(1);
}

for (const tool of TOOLS) {
  server.registerTool(
    tool.id,
    {
      title: `${tool.label} — $${tool.price} USDC/call`,
      description:
        `${tool.description} PAID TOOL: each call costs $${tool.price} USDC, paid from this agent's own wallet ` +
        `and governed by its SpendVeto spend policy — hard limits apply, and prices above the policy threshold ` +
        `pause for human approval on the dashboard. A call may come back blocked or denied; report that to the user rather than retrying.`,
    },
    async () => {
      const result = await governedCall(tool, account, {
        approvalTimeoutMs: 25000,
        onStatus: (line) => console.error(`[spendveto] ${line}`),
      });

      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `SpendVeto blocked this call at the ${result.stage} gate: ${result.reason}. Nothing was spent.${result.denial?.suggestion ? ` Fix: ${result.denial.suggestion}` : ""}` }],
        };
      }

      const settlement = result.data.settlement;
      const receipt = settlement?.remainingBalance != null
        ? `paid $${tool.price} USDC, remaining balance $${settlement.remainingBalance}`
        : `paid $${tool.price} USDC`;
      return {
        content: [{ type: "text", text: `${result.data.result.text}\n\n— SpendVeto receipt: ${receipt} (${MODE} mode)` }],
      };
    }
  );
}

server.registerTool(
  "spendveto_status",
  {
    title: "SpendVeto status",
    description:
      "Free. Reports this agent's wallet address, balance, spend policy, last-hour spend, pending approvals, and any delegated budgets. Use it to check whether a paid call would be allowed before making it.",
  },
  async () => {
    try {
      const [{ entries, balances }, policy, { approvals }, { delegations }, { freezes }, stats] = await Promise.all([
        fetch(`${BASE_URL}/api/ledger`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/policy`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/approvals`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/delegations`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/freezes`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/stats`).then((r) => r.json()),
      ]);
      const me = account.address.toLowerCase();
      const cutoff = Date.now() - 60 * 60 * 1000;
      const mine = entries.filter((e) => e.status === "paid" && e.address?.toLowerCase() === me);
      const lastHour = mine.filter((e) => new Date(e.ts).getTime() >= cutoff);
      const spentHour = lastHour.reduce((s, e) => s + Number(e.amount || 0), 0);
      const pending = approvals.filter((a) => a.status === "pending").length;
      const myDelegations = delegations.filter((d) => d.parentAddress.toLowerCase() === me && !d.revoked);
      const myFreeze = freezes.find((f) => !f.unfrozen && f.address.toLowerCase() === me);

      const lines = [
        `Wallet: ${account.address} (${MODE} mode)${myFreeze ? ` — FROZEN (${myFreeze.source}): ${myFreeze.reason}` : ""}`,
        balances[me] != null
          ? `Simulated balances: ${
              typeof balances[me] === "object"
                ? Object.entries(balances[me]).map(([chain, usd]) => `${chain} $${usd}`).join(", ")
                : `$${balances[me]}`
            }`
          : `Balance: (no simulate-mode balance yet)`,
        `Policy: max $${policy.maxPerCallUSD}/call, $${policy.maxPerHourUSD}/hour, ${policy.maxCallsPerHour} calls/hour; human approval required above $${policy.requireApprovalAboveUSD}`,
        `Last hour: ${lastHour.length} paid calls, $${spentHour.toFixed(4)} spent`,
        `Pending approvals on dashboard: ${pending}`,
        myDelegations.length > 0
          ? `Active delegated budgets granted: ${myDelegations.map((d) => `${d.label || d.childAddress.slice(0, 8)} cap $${d.capUSD}`).join("; ")}`
          : `No delegated child budgets.`,
        `Governance totals: $${stats.blocked.usd} blocked across ${stats.blocked.count} stopped attempts; ${stats.frozenWallets} wallet(s) currently frozen.`,
        `Paid tools: ${TOOLS.map((t) => `${t.id} ($${t.price})`).join(", ")}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: `SpendVeto server is not reachable at ${BASE_URL} — start it with \`npm run server\` in the spendveto directory.` }],
      };
    }
  }
);

await server.connect(new StdioServerTransport());
console.error(`[spendveto] MCP server ready — wallet ${account.address}, ${MODE} mode, gating ${TOOLS.length} paid tools via ${BASE_URL}`);
