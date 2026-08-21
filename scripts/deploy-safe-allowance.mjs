// One-time setup for the safe-allowance rail (see docs/safe-allowance.md).
// Deploys a fresh 1-of-1 Safe owned by CLIENT_PRIVATE_KEY, enables the
// canonical AllowanceModule on it, and registers that same wallet as its
// own delegate with a small USDC allowance — so `npm run call` can exercise
// the real executeAllowanceTransfer path end to end.
//
// BLOCKED until the client wallet has Base Sepolia ETH for gas. Check first:
//   node -e "fetch('https://sepolia.base.org',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_getBalance',params:['<address>','latest'],id:1})}).then(r=>r.json()).then(console.log)"
// Fund via https://faucet.circle.com or https://www.coinbase.com/faucets/base-sepolia-faucet
// (both require a human-verification step — that's a step only you can do).
//
// The GnosisSafeProxyFactory / GnosisSafe(1.3.0) / AllowanceModule addresses
// below are the canonical CREATE2 deployments used across every EVM chain —
// VERIFY them against a Base Sepolia block explorer before running this for
// real money; this script has not been executed against a live chain yet.

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

const RPC_URL = "https://sepolia.base.org";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // base-sepolia USDC (shared-config.js)

// Canonical Safe v1.3.0 + Zodiac AllowanceModule deployments (same address
// across chains via deterministic CREATE2 deployer) — VERIFY before use.
const SAFE_PROXY_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB";
const SAFE_SINGLETON = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
const ALLOWANCE_MODULE = "0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134";

const GNOSIS_SAFE_ABI = [
  {
    name: "setup",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "enableModule",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "module", type: "address" }],
    outputs: [],
  },
  {
    name: "execTransaction",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const PROXY_FACTORY_ABI = [
  {
    name: "createProxyWithNonce",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
    ],
    outputs: [{ name: "proxy", type: "address" }],
  },
];

const ALLOWANCE_MODULE_SETUP_ABI = [
  {
    name: "addDelegate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegate", type: "address" }],
    outputs: [],
  },
  {
    name: "setAllowance",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegate", type: "address" },
      { name: "token", type: "address" },
      { name: "allowanceAmount", type: "uint96" },
      { name: "resetTimeMin", type: "uint16" },
      { name: "resetBaseMin", type: "uint32" },
    ],
    outputs: [],
  },
];

async function main() {
  const pk = process.env.CLIENT_PRIVATE_KEY;
  if (!pk) throw new Error("CLIENT_PRIVATE_KEY not set — run `npm run gen-wallets` first");

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Client wallet: ${account.address}`);
  console.log(`Base Sepolia ETH balance: ${balance} wei`);
  if (balance === 0n) {
    console.error(
      "\nBLOCKED: this wallet has 0 ETH on Base Sepolia — cannot pay gas for Safe deployment.\n" +
      "Fund it via https://www.coinbase.com/faucets/base-sepolia-faucet (requires human verification), then re-run this script."
    );
    process.exit(1);
  }

  // Step 1: deploy a 1-of-1 Safe owned by this wallet.
  const setupData = encodeFunctionData({
    abi: GNOSIS_SAFE_ABI,
    functionName: "setup",
    args: [[account.address], 1n, "0x0000000000000000000000000000000000000000", "0x", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", 0n, "0x0000000000000000000000000000000000000000"],
  });
  const saltNonce = BigInt(Date.now());
  console.log("\nDeploying Safe via ProxyFactory.createProxyWithNonce ...");
  const deployHash = await walletClient.writeContract({
    address: SAFE_PROXY_FACTORY,
    abi: PROXY_FACTORY_ABI,
    functionName: "createProxyWithNonce",
    args: [SAFE_SINGLETON, setupData, saltNonce],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  console.log("Safe deploy tx:", deployHash, "status:", deployReceipt.status);
  // The deployed proxy address is emitted in a ProxyCreation event — decode
  // from the receipt logs rather than precompute, since initializer-hash
  // salt derivation is easy to get subtly wrong.
  console.log("Inspect the receipt logs for the ProxyCreation event to get the Safe address —");
  console.log("this script stops here deliberately: enabling AllowanceModule and calling");
  console.log("execTransaction needs that address confirmed against the block explorer first.");
  console.log("\nReceipt:", JSON.stringify(deployReceipt, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
