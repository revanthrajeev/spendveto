// Creates a child agent wallet and grants it a capped budget:
//   npm run delegate -- 0.03 "research agent"                    (granted by the main wallet)
//   npm run delegate -- 0.01 "intern" --parent "research agent"  (granted by an existing child → grandchild)
// Caps cascade: a grandchild's spending counts against its own cap and every
// ancestor's — enforced in the caller's policy check (client/policy.js).
// Requires the server to be running (it stores the grant).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { account as mainAccount } from "../client/wallet.js";
import { PORT } from "../shared-config.js";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flagIndices = new Set();
for (const name of ["--parent", "--tools", "--chains", "--payees", "--ttl", "--every"]) {
  const i = args.indexOf(name);
  if (i >= 0) {
    flagIndices.add(i);
    flagIndices.add(i + 1);
  }
}
const parentSelector = flagValue("--parent");
const toolsArg = flagValue("--tools");
const allowedTools = toolsArg ? toolsArg.split(",").map((t) => t.trim()).filter(Boolean) : null;
const chainsArg = flagValue("--chains");
const allowedChains = chainsArg ? chainsArg.split(",").map((c) => c.trim()).filter(Boolean) : null;
const payeesArg = flagValue("--payees");
const allowedPayees = payeesArg ? payeesArg.split(",").map((c) => c.trim()).filter(Boolean) : null;
// --ttl 90 / --ttl 10m / --ttl 2h: the grant self-expires — a time-boxed budget.
const ttlArg = flagValue("--ttl");
const ttlMatch = ttlArg ? /^(\d+)([smh]?)$/.exec(ttlArg.trim()) : null;
const ttlSeconds = ttlMatch ? Number(ttlMatch[1]) * ({ "": 1, s: 1, m: 60, h: 3600 }[ttlMatch[2]]) : null;
// --every 30s / 10m / 2h / 7d: a recurring allowance — the cap re-fills on a rolling window.
const everyArg = flagValue("--every");
const everyMatch = everyArg ? /^(\d+)([smhd]?)$/.exec(everyArg.trim()) : null;
const periodSeconds = everyMatch ? Number(everyMatch[1]) * ({ "": 1, s: 1, m: 60, h: 3600, d: 86400 }[everyMatch[2]]) : null;
const positional = args.filter((a, i) => !flagIndices.has(i));

const capUSD = Number(positional[0]);
const label = positional[1] || null;
if (
  !(capUSD > 0) ||
  (args.includes("--parent") && !parentSelector) ||
  (args.includes("--tools") && !allowedTools?.length) ||
  (args.includes("--chains") && !allowedChains?.length) ||
  (args.includes("--payees") && !allowedPayees?.length) ||
  (args.includes("--ttl") && !(ttlSeconds > 0)) ||
  (args.includes("--every") && !(periodSeconds > 0))
) {
  console.error('Usage: npm run delegate -- <capUSD> [label] [--parent <label-or-address>] [--tools id1,id2] [--chains id1,id2] [--ttl 90|10m|2h]');
  console.error('  e.g. npm run delegate -- 0.03 "research agent"');
  console.error('       npm run delegate -- 0.01 "intern" --parent "research agent"');
  console.error('       npm run delegate -- 0.02 "translator" --tools translate');
  console.error('       npm run delegate -- 0.02 "base only" --chains base-sepolia,base');
  console.error('       npm run delegate -- 0.05 "flash task" --ttl 10m');
  process.exit(1);
}

const childrenPath = fileURLToPath(new URL("../data/children.json", import.meta.url));
const children = existsSync(childrenPath) ? JSON.parse(readFileSync(childrenPath, "utf8")) : [];

// The granting wallet: the main wallet by default, or an existing child
// (matched by label or address) when building a deeper hierarchy.
let grantorAddress = mainAccount.address;
let grantorNote = "main wallet";
if (parentSelector) {
  const match = children.find(
    (c) => c.label === parentSelector || c.address.toLowerCase() === parentSelector.toLowerCase()
  );
  if (!match) {
    console.error(`No child wallet matching "${parentSelector}" in data/children.json — labels: ${children.map((c) => c.label || c.address.slice(0, 10)).join(", ") || "(none)"}`);
    process.exit(1);
  }
  grantorAddress = match.address;
  grantorNote = `child "${match.label || match.address.slice(0, 10)}"`;
}

const childKey = generatePrivateKey();
const childAccount = privateKeyToAccount(childKey);

let delegation;
try {
  const res = await fetch(`http://localhost:${PORT}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentAddress: grantorAddress, childAddress: childAccount.address, capUSD, label, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds }),
  });
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  delegation = await res.json();
} catch (err) {
  console.error(`Could not store the delegation — is \`npm run server\` running? (${err.message})`);
  process.exit(1);
}

children.push({ address: childAccount.address, privateKey: childKey, delegationId: delegation.id, capUSD, label, allowedTools, allowedChains, allowedPayees, expiresAt: delegation.expiresAt ?? null, createdAt: delegation.createdAt });
writeFileSync(childrenPath, JSON.stringify(children, null, 2));

console.log(`Delegated $${capUSD.toFixed(4)} USDC${label ? ` to "${label}"` : ""} from ${grantorNote}${allowedTools ? ` (scope: ${allowedTools.join(", ")})` : ""}${allowedChains ? ` (chains: ${allowedChains.join(", ")})` : ""}${allowedPayees ? ` (payees: ${allowedPayees.length})` : ""}${delegation.expiresAt ? ` (expires ${delegation.expiresAt})` : ""}${periodSeconds ? ` (allowance: re-fills every ${periodSeconds}s)` : ""}`);
console.log(`  Parent: ${grantorAddress}`);
console.log(`  Child:  ${childAccount.address}`);
console.log(`\nThe child spends it with:  npm run call -- <tool> --child${label ? `="${label}"` : ""}`);
console.log(`Watch the budget tree on the dashboard: http://localhost:${PORT}/`);
