import dotenv from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes, generateKeyPairSigner, getBase58Encoder } from "@solana/kit";
import { createClientSigner as createAptosSigner } from "@x402/aptos";
import { Account as AptosAccount } from "@aptos-labs/ts-sdk";
import { createEd25519Signer as createStellarSigner } from "@x402/stellar";
import { Keypair as StellarKeypair } from "@stellar/stellar-sdk";
import { createClientHederaSigner } from "@x402/hedera";
import { PrivateKey as HederaPrivateKey } from "@hiero-ledger/sdk";
import { createXrplWalletSigner } from "@x402/xrpl";
import { Wallet as XrplWallet } from "xrpl";

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

// Solana settlement is a different signature family (ed25519, not secp256k1)
// so it needs its own keypair — but the governance identity (budgets, caps,
// ledger keying) stays `account.address` throughout; this signer only ever
// produces the on-chain SPL transfer signature for the solana-devnet rail.
// Lazy + memoized: key generation is async and most runs never touch Solana.
let svmSignerPromise;
export function getSvmSigner() {
  if (!svmSignerPromise) {
    svmSignerPromise = process.env.CLIENT_SOLANA_PRIVATE_KEY
      ? createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.CLIENT_SOLANA_PRIVATE_KEY))
      : generateKeyPairSigner();
  }
  return svmSignerPromise;
}

// Every non-EVM, non-SVM chain below is its own account model and signature
// scheme — same pattern as getSvmSigner: lazy, memoized, and governance
// identity never moves off `account.address` regardless of which of these
// actually signs the on-chain transfer. Ephemeral fallbacks exist so the
// rail is exercisable with zero setup, same as CLIENT_PRIVATE_KEY, though an
// unfunded ephemeral key settles nothing real on any of them — exactly like
// an unfunded EVM wallet today.

let aptosSignerPromise;
export function getAptosSigner() {
  if (!aptosSignerPromise) {
    aptosSignerPromise = process.env.CLIENT_APTOS_PRIVATE_KEY
      ? createAptosSigner(process.env.CLIENT_APTOS_PRIVATE_KEY)
      : Promise.resolve(AptosAccount.generate());
  }
  return aptosSignerPromise;
}

let stellarSignerPromise;
export function getStellarSigner() {
  if (!stellarSignerPromise) {
    const secret = process.env.CLIENT_STELLAR_PRIVATE_KEY || StellarKeypair.random().secret();
    stellarSignerPromise = Promise.resolve(createStellarSigner(secret, "stellar:testnet"));
  }
  return stellarSignerPromise;
}

// Hedera has no ephemeral fallback: accountId is assigned on-chain by an
// existing account funding a create-account transaction — there is no way
// to "generate" one locally the way every other chain here does. Without
// CLIENT_HEDERA_ACCOUNT_ID + CLIENT_HEDERA_PRIVATE_KEY set, this throws
// rather than pretending a fabricated account id would ever settle.
let hederaSignerPromise;
export function getHederaSigner() {
  if (!hederaSignerPromise) {
    const accountId = process.env.CLIENT_HEDERA_ACCOUNT_ID;
    const privateKey = process.env.CLIENT_HEDERA_PRIVATE_KEY;
    if (!accountId || !privateKey) {
      throw new Error(
        "Hedera settlement needs a real registered testnet account — set CLIENT_HEDERA_ACCOUNT_ID and CLIENT_HEDERA_PRIVATE_KEY (create one free at https://portal.hedera.com); unlike every other chain here, no ephemeral fallback is possible."
      );
    }
    hederaSignerPromise = Promise.resolve(createClientHederaSigner(accountId, HederaPrivateKey.fromStringED25519(privateKey)));
  }
  return hederaSignerPromise;
}

// XRPL: an ephemeral wallet has no account on the ledger at all (no reserve
// funded), so it can sign but nothing will settle without real XRP behind
// it — same honesty as an unfunded EVM key, just enforced by the ledger
// itself rather than a balance check. This is also the one chain in the
// registry settling real mainnet money, not a testnet.
let xrplSignerPromise;
export function getXrplSigner() {
  if (!xrplSignerPromise) {
    const wallet = process.env.CLIENT_XRPL_SEED ? XrplWallet.fromSeed(process.env.CLIENT_XRPL_SEED) : XrplWallet.generate();
    xrplSignerPromise = Promise.resolve(createXrplWalletSigner(wallet));
  }
  return xrplSignerPromise;
}

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
