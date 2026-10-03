// AI-spend quickstart: `npm run quickstart:ai`
// Gives an agent a hard dollar budget for LLM calls, lets it spend until the budget is gone, and shows the next call
// refused BEFORE any upstream request is made — with a machine-readable reason the agent can act on. Works with no
// API key (simulated completions; governance and metering are real). Set ANTHROPIC_API_KEY for real model calls.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { SpendVeto, SpendVetoDenialError } from "../sdk/index.js";

const SERVER = process.env.SPENDVETO_SERVER_URL || "http://localhost:8402";
const PROXY = process.env.SPENDVETO_PROXY_URL || "http://localhost:8404";
const BUDGET_USD = Number(process.argv[2]) || 0.0015;
const root = (p) => fileURLToPath(new URL(p, import.meta.url));
const up = (url) => fetch(url).then((r) => r.ok).catch(() => false);

const started = [];
async function ensure(name, url, script) {
  if (await up(url)) return console.log(`  using the ${name} already running`);
  console.log(`  starting ${name} ...`);
  started.push(spawn("node", [root(script)], { stdio: "ignore", env: { ...process.env, SPENDVETO_MODE: "simulate" } }));
  for (let i = 0; i < 40 && !(await up(url)); i++) await sleep(250);
  if (!(await up(url))) throw new Error(`${name} did not start`);
}

console.log("\nSpendVeto — AI spend quickstart\n");
try {
  await ensure("server ", `${SERVER}/api/stats`, "../server/index.js");
  await ensure("proxy  ", `${PROXY}/proxy/health`, "../proxy/server.js");

  const label = `quickstart-${Date.now().toString(36)}`;
  await fetch(`${SERVER}/api/delegations/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capUSD: BUDGET_USD, label }) });
  const admin = new SpendVeto({ proxyUrl: PROXY, serverUrl: SERVER });
  const agent = await admin.registerAgent(label, { child: label });
  const sv = new SpendVeto({ proxyUrl: PROXY, serverUrl: SERVER, agentToken: agent.token });

  console.log("  (the first agent identity you register switches the proxy to token-required mode — by design)");
  console.log(`\n  agent "${label}" has a hard LLM budget of $${BUDGET_USD.toFixed(4)}. It never holds a key or wallet.\n`);
  let spent = 0, ok = 0, blocked = 0, firstBlock = null;
  for (let i = 1; i <= 25 && blocked < 2; i++) {
    try {
      const r = await sv.chat(`Summarise item ${i} in one sentence.`, { maxTokens: 256, child: label });
      spent += r.actualUSD; ok++;
      console.log(`  call ${String(i).padStart(2)}  ALLOWED  $${r.actualUSD.toFixed(6)}   running total $${spent.toFixed(6)}`);
    } catch (e) {
      if (!(e instanceof SpendVetoDenialError)) throw e;
      blocked++; firstBlock ||= e;
      console.log(`  call ${String(i).padStart(2)}  BLOCKED  [${e.code ?? e.stage}] ${e.suggestion ?? e.message}`);
    }
  }

  const chain = await fetch(`${SERVER}/api/ledger/verify-chain`).then((r) => r.json());
  console.log(`\n  ${ok} calls allowed ($${spent.toFixed(6)} of $${BUDGET_USD.toFixed(4)}), ${blocked} refused before reaching the model.`);
  console.log(`  audit ledger hash-chain intact: ${chain.ok ?? chain.valid ?? JSON.stringify(chain)}`);
  console.log(`\n  Use it in your agent (3 lines):\n`);
  console.log(`    import { SpendVeto } from "spendveto-sdk";`);
  console.log(`    const sv = new SpendVeto({ agentToken: process.env.SPENDVETO_AGENT_TOKEN });`);
  console.log(`    const reply = await sv.chat(prompt);   // throws SpendVetoDenialError once the budget is gone\n`);
  console.log(`  Python: pip install ./sdk-python   ->   SpendVeto(agent_token=...).chat(prompt)\n`);
  if (!firstBlock) { console.error("  expected the budget to run out; try a smaller budget: npm run quickstart:ai -- 0.001"); process.exitCode = 1; }
} finally {
  for (const c of started) c.kill();
}
