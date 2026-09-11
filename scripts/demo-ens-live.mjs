// Live, on-camera ENS demo: resolves a real .eth name against Ethereum
// mainnet and shows it gating a governed payment — real network call, no
// mocking (the hermetic verify.mjs suite swaps this for a fake resolver;
// this script deliberately does not, since the whole point here is to prove
// it against the real chain on camera).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { checkPolicy } from "../client/policy.js";
import { resolveEnsName } from "../client/ens.js";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const POLICY_PATH = new URL("../data/policy.json", import.meta.url);
const original = readFileSync(POLICY_PATH, "utf8");
const policy = JSON.parse(original);

const NAME = "vitalik.eth";
console.log(`\nResolving ${NAME} against Ethereum mainnet…`);
const resolved = await resolveEnsName(NAME);
if (!resolved) {
  console.error("Resolution failed — check network access. Aborting without touching policy.json.");
  process.exit(1);
}
console.log(`  ${NAME} -> ${resolved}\n`);

policy.allowedPayees = [NAME];
writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
console.log(`policy.allowedPayees set to ["${NAME}"]\n`);

const payer = privateKeyToAccount(generatePrivateKey()).address;

console.log(`Governed call paying the RESOLVED address (${resolved})…`);
const good = await checkPolicy(payer, 0.01, "review", "base-sepolia", null, resolved);
console.log(`  decision: ${good.allowed ? "ALLOWED" : "BLOCKED"}${good.code ? ` (${good.code})` : ""}\n`);

const stranger = privateKeyToAccount(generatePrivateKey()).address;
console.log(`Governed call paying an address NOT on the allowlist (${stranger})…`);
const bad = await checkPolicy(payer, 0.01, "review", "base-sepolia", null, stranger);
console.log(`  decision: ${bad.allowed ? "ALLOWED" : "BLOCKED"}${bad.code ? ` (${bad.code})` : ""}\n`);

writeFileSync(POLICY_PATH, original);
console.log("policy.json restored.\n");
