// One-time setup: generates two real secp256k1 keypairs (client payer + server
// payout address) and writes them into .env.local. Safe to re-run — it will
// refuse to overwrite an existing .env.local so you don't orphan a funded wallet.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env.local", import.meta.url);

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, "utf8");
  if (/CLIENT_PRIVATE_KEY=0x[0-9a-fA-F]{64}/.test(existing)) {
    console.log(".env.local already has a CLIENT_PRIVATE_KEY — not overwriting. Delete it manually first if you want fresh wallets.");
    process.exit(0);
  }
}

const clientKey = generatePrivateKey();
const clientAccount = privateKeyToAccount(clientKey);

const serverKey = generatePrivateKey();
const serverAccount = privateKeyToAccount(serverKey);

const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const filled = example
  .replace("CLIENT_PRIVATE_KEY=", `CLIENT_PRIVATE_KEY=${clientKey}`)
  .replace("SERVER_PAYOUT_ADDRESS=", `SERVER_PAYOUT_ADDRESS=${serverAccount.address}`);

writeFileSync(envPath, filled);

console.log("Generated two real Base Sepolia wallets, written to .env.local:\n");
console.log("  Client (payer):  ", clientAccount.address);
console.log("  Server (payout): ", serverAccount.address);
console.log("\nTo test the real testnet rail, fund the CLIENT address with test USDC:");
console.log("  https://faucet.circle.com  (select Base Sepolia, paste the client address above)");
console.log("\nThen set SPENDVETO_MODE=testnet in .env.local and run: npm run server / npm run call");
