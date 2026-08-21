import dotenv from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// quiet: dotenv v17 prints an injection banner to stdout by default, which
// would corrupt the MCP stdio protocol when this module is loaded by mcp/server.js.
dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

const configuredKey = process.env.CLIENT_PRIVATE_KEY;
const isEphemeral = !configuredKey;

// Real secp256k1 keypair either way — the only difference is whether it's
// persisted (.env.local, reusable, fundable on testnet) or generated fresh
// this run (fine for simulate mode, useless for testnet since it'd never be funded).
export const account = privateKeyToAccount(configuredKey || generatePrivateKey());
export const walletIsEphemeral = isEphemeral;

const CHILDREN_PATH = fileURLToPath(new URL("../data/children.json", import.meta.url));

// Child agent wallets created by `npm run delegate`. Keys live in a gitignored
// JSON file — acceptable for simulate-mode demo money; a real product would
// keep them in a proper secret store. Pass a label or address to pick a
// specific child; default is the most recently created one.
export function loadChildAccount(selector) {
  if (!existsSync(CHILDREN_PATH)) {
    throw new Error("no child wallets yet — run `npm run delegate -- <capUSD>` first");
  }
  const children = JSON.parse(readFileSync(CHILDREN_PATH, "utf8"));
  if (children.length === 0) {
    throw new Error("no child wallets yet — run `npm run delegate -- <capUSD>` first");
  }
  if (selector) {
    const match = children.find(
      (c) => c.label === selector || c.address.toLowerCase() === selector.toLowerCase()
    );
    if (!match) {
      throw new Error(`no child wallet matching "${selector}" — labels: ${children.map((c) => c.label || c.address.slice(0, 10)).join(", ")}`);
    }
    return privateKeyToAccount(match.privateKey);
  }
  const latest = children[children.length - 1];
  return privateKeyToAccount(latest.privateKey);
}
