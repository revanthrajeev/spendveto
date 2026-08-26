import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ExactAptosScheme } from "@x402/aptos/exact/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { ExactXrplScheme } from "@x402/xrpl/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { MODE, PORT, TOOLS, CHAINS, FACILITATOR_URL, findChain, DEFAULT_CHAIN } from "../shared-config.js";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createSimulateGate, receiptMessage, signDecision, consentMessage } from "./simulate.js";
import { decisionEvents, toJSONL } from "./events.js";
import { checkPolicy, policyHash } from "../client/policy.js";
import { verifyMessage } from "viem";
import { runTool } from "./agent.js";
import { getLedger, getBalances, appendLedgerEntry, creditSimBalance, verifyLedgerChain } from "./ledger.js";
import { createApproval, getApproval, decideApproval, listApprovals } from "./approvals.js";
import { worldIdConfigured, verifyWorldIdProof } from "./worldid.js";
import { listDelegations, createDelegation, revokeDelegation } from "./delegations.js";
import { listFreezes, findActiveFreeze, createFreeze, unfreeze } from "./freezes.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readdirSync, existsSync } from "node:fs";
import { account as mainAccount } from "../client/wallet.js";
import { maybeFreezeForBurst, analyzeAnomalies } from "./anomaly.js";
import { trustScoreFor, trustGraph, payeeReputation } from "./trust.js";
import { sendAlert } from "./alerts.js";
import { railsCatalog } from "../rails/index.js";
import { setShadowPolicy, clearShadowPolicy, shadowReport } from "./shadow.js";
import { requireAuth } from "./auth.js";
import { recordConsent, consentsForDelegation } from "./consents.js";
import { toVerifiableCredential } from "./vc.js";
import { normalizeReceipt } from "./receipts.js";
import { checkCartAgainstIntent, reconcileHumanNotPresent } from "./ap2.js";
import { toBazaarResources, governCatalog } from "./discovery.js";
import { checkSessionAgainstToken } from "./acp.js";
import { bindAuthorization, verifyBinding, getBinding, requestDigest } from "./integrity.js";
import { buildEvidencePack, checkEvidencePack } from "./disputes.js";
import { decisionSpans, toOtlpPayload, exportSpans } from "./otel.js";

dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

const app = express();
app.use(express.json());
// Local-tool CORS: lets the marketing site (:8403) show live governance stats.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.static(fileURLToPath(new URL("../dashboard", import.meta.url))));

async function serveAgentResult(toolId, res, settlement) {
  const result = await runTool(toolId);
  res.json({ result, settlement: settlement ?? null });
}

// Chains with real on-chain settlement live RIGHT NOW on this instance —
// facilitator-truth in testnet mode, empty in simulate mode (where every
// registry chain settles locally). Surfaced on /api/chains.
let liveSettlementChains = [];

if (MODE === "testnet") {
  const payTo = process.env.SERVER_PAYOUT_ADDRESS;
  if (!payTo) {
    console.error("SPENDVETO_MODE=testnet requires SERVER_PAYOUT_ADDRESS in .env.local — run `npm run gen-wallets` first, then fund CLIENT_PRIVATE_KEY's address via https://faucet.circle.com (Base Sepolia).");
    process.exit(1);
  }
  // Every non-EVM family has its own address shape (an EVM 0x address is
  // meaningless as an XRPL r-address or a Hedera 0.0.x account), so each gets
  // its own optional payout address. A family with none configured simply
  // never enters liveSettlementChains below — a chain the facilitator
  // supports but we have nowhere of our own to receive it on stays "ready",
  // never advertised in a 402 with a payTo that would misroute funds.
  const payToFor = {
    undefined: payTo,
    svm: process.env.SERVER_PAYOUT_ADDRESS_SVM,
    aptos: process.env.SERVER_PAYOUT_ADDRESS_APTOS,
    stellar: process.env.SERVER_PAYOUT_ADDRESS_STELLAR,
    hedera: process.env.SERVER_PAYOUT_ADDRESS_HEDERA,
    xrpl: process.env.SERVER_PAYOUT_ADDRESS_XRPL,
  };
  // x402 v2, registry-driven: ask the configured facilitator what it can
  // actually settle (GET /supported) and bring every registry chain it names
  // live — schemes registered and 402s advertising one accepts entry per live
  // chain. The chain set is the FACILITATOR's truth, not this file's bravado:
  // the public facilitator settles base-sepolia today; point FACILITATOR_URL
  // at a CDP facilitator (with an API key) and its mainnet chains go live with
  // zero code changes. If /supported is unreachable, fall back to base-sepolia
  // rather than refusing to boot.
  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  let supportedNetworks;
  try {
    const { kinds } = await facilitatorClient.getSupported();
    supportedNetworks = new Set(kinds.filter((k) => k.scheme === "exact").map((k) => k.network));
  } catch (err) {
    console.error(`[testnet] facilitator /supported unreachable (${err.message}) — falling back to base-sepolia only`);
    supportedNetworks = new Set([findChain("base-sepolia").caip2]);
  }
  liveSettlementChains = CHAINS.filter((c) => supportedNetworks.has(c.caip2) && payToFor[c.family] != null).map((c) => c.id);
  if (liveSettlementChains.length === 0) liveSettlementChains = ["base-sepolia"];
  console.log(`[testnet] live settlement chains via ${FACILITATOR_URL}: ${liveSettlementChains.join(", ")}`);

  const schemeFor = (c) => {
    switch (c.family) {
      case "svm":
        return new ExactSvmScheme();
      case "aptos":
        return new ExactAptosScheme();
      case "stellar":
        return new ExactStellarScheme();
      case "hedera":
        return new ExactHederaScheme();
      case "xrpl":
        return new ExactXrplScheme();
      default:
        return new ExactEvmScheme();
    }
  };
  let resourceServer = new x402ResourceServer(facilitatorClient);
  for (const id of liveSettlementChains) resourceServer = resourceServer.register(findChain(id).caip2, schemeFor(findChain(id)));
  // Price as an explicit AssetAmount per chain (atomic units + the registry's
  // canonical stablecoin contract/token id) rather than the "$0.01" shorthand
  // — the shorthand needs each package's built-in default-asset table, which
  // doesn't cover every chain we register, and every non-EVM family has its
  // own atomic-unit convention (decimals) and asset-address shape. XRPL is
  // the one exception: it has no atomic USDC unit at all (IOU amounts are
  // decimal ledger values), so it gets a plain decimal Money string and the
  // scheme's own default conversion prices it in RLUSD.
  const usdcAmount = (tool, id) => {
    const c = findChain(id);
    const atomic = (decimals) => ({ amount: String(Math.round(Number(tool.price) * 10 ** decimals)), asset: c.usdc });
    switch (c.family) {
      case "svm":
      case "aptos":
      case "hedera":
        return atomic(6);
      case "stellar":
        return atomic(7);
      case "xrpl":
        return String(tool.price);
      default:
        return { amount: String(Math.round(Number(tool.price) * 1e6)), asset: { address: c.usdc, name: "USDC", version: "2", decimals: 6 } };
    }
  };
  const routes = Object.fromEntries(
    TOOLS.map((tool) => [
      `GET ${tool.path}`,
      {
        accepts: liveSettlementChains.map((id) => {
          const c = findChain(id);
          return { scheme: "exact", price: usdcAmount(tool, id), network: c.caip2, payTo: payToFor[c.family] };
        }),
        description: `SpendVeto demo — ${tool.label}`,
      },
    ])
  );
  app.use(paymentMiddleware(routes, resourceServer));
  // x402-express already verified + settled payment before these handlers run.
  // Ledger accounting for testnet mode happens client-side (see client/pay-and-call.js) —
  // the client is the one party that reliably knows its own address and outcome.
  for (const tool of TOOLS) {
    app.get(tool.path, (req, res) => serveAgentResult(tool.id, res));
  }
} else {
  for (const tool of TOOLS) {
    app.get(tool.path, createSimulateGate(tool), (req, res) => serveAgentResult(tool.id, res, res.locals.settlement));
  }
  // Dynamic marketplace tools share the same 402 gate; static routes above
  // win first, so this only catches registered dynamic ids.
  app.get("/api/agent/:dynId", (req, res) => {
    const tool = readDynTools().find((t) => t.id === req.params.dynId);
    if (!tool) return res.status(404).json({ error: `unknown tool "${req.params.dynId}"` });
    createSimulateGate(tool)(req, res, async () => {
      let text;
      let real = false;
      if (tool.upstreamUrl) {
        try {
          // The caller already paid for THIS specific call, not a fixed canned resource — a
          // registered marketplace tool with no way to pass per-call input is a static page
          // wearing a price tag. Query params on the incoming request forward onto the
          // upstream URL (merged, so an upstreamUrl that already carries its own params, e.g.
          // an API key, keeps them); the request line is the only per-call channel this proxy
          // has, since it's a plain GET behind x402, not a tunnel.
          const target = new URL(tool.upstreamUrl);
          for (const [k, v] of Object.entries(req.query || {})) {
            if (typeof v === "string") target.searchParams.set(k, v);
          }
          text = await fetch(target, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());
          real = true;
        } catch (err) {
          text = `(upstream unreachable: ${err.message})`;
        }
      } else {
        text = `(paid response from marketplace tool "${tool.id}" — no upstreamUrl configured)`;
      }
      res.json({ result: { text: text.slice(0, 4000), real }, settlement: res.locals.settlement ?? null });
    });
  });
}

// The tool marketplace: anyone can register a paid endpoint behind the same
// governance gate — the catalog stops being a fixed demo and becomes supply.
// Durable in data/tools.json (runtime state, gitignored).
const DYN_TOOLS_PATH = fileURLToPath(new URL("../data/tools.json", import.meta.url));
function readDynTools() {
  try {
    return JSON.parse(readFileSync(DYN_TOOLS_PATH, "utf8"));
  } catch {
    return [];
  }
}
const allTools = () => [...TOOLS, ...readDynTools()];

app.get("/api/catalog", (req, res) => {
  res.json({ tools: allTools() });
});

app.post("/api/catalog/tools", requireAuth("admin"), (req, res) => {
  const { id, price, label, description, upstreamUrl, category, payTo } = req.body || {};
  if (!/^[a-z0-9-]{2,40}$/.test(id || "")) return res.status(400).json({ error: "id must be 2-40 chars of a-z, 0-9, -" });
  if (!(Number(price) > 0)) return res.status(400).json({ error: "a positive price (USD) is required" });
  if (payTo != null && !/^0x[0-9a-fA-F]{40}$/.test(payTo)) return res.status(400).json({ error: "payTo, if given, must be a 0x-prefixed 20-byte address" });
  if (allTools().some((t) => t.id === id)) return res.status(409).json({ error: `tool "${id}" already exists` });
  const list = readDynTools();
  const record = {
    id,
    path: `/api/agent/${id}`,
    price: String(price),
    label: (label || id).slice(0, 60),
    description: (description || "").slice(0, 200),
    category: /^[a-z-]{2,30}$/.test(category || "") ? category : "marketplace",
    // The recipient this tool's payments settle to. When set, the payee
    // allowlist (policy.allowedPayees / delegated payee scope) governs it.
    ...(payTo ? { payTo } : {}),
    ...(upstreamUrl && /^https?:\/\//.test(upstreamUrl) ? { upstreamUrl } : {}),
    dynamic: true,
    createdAt: new Date().toISOString(),
  };
  list.push(record);
  writeFileSync(DYN_TOOLS_PATH, JSON.stringify(list, null, 2));
  res.status(201).json(record);
});

// Simulated top-up: fund a wallet's per-chain balance (simulate mode only —
// on-chain balances come from real faucets/transfers, never from an API).
app.post("/api/balances/topup", requireAuth("admin"), (req, res) => {
  if (MODE !== "simulate") return res.status(400).json({ error: "top-ups exist only in simulate mode" });
  const { address, amount, chain } = req.body || {};
  if (!address || !(Number(amount) > 0)) return res.status(400).json({ error: "address and a positive amount are required" });
  const balance = creditSimBalance(address, Number(amount), chain || "base-sepolia");
  res.json({ address, chain: chain || "base-sepolia", balance });
});

app.get("/api/chains", (req, res) => {
  // settlement: how a payment on this chain would settle on THIS instance —
  // "live" (real on-chain via the facilitator, testnet mode), "simulated"
  // (local ledger, simulate mode), or "ready" (full v2 wiring in place; goes
  // live the moment the configured facilitator supports it).
  const chains = CHAINS.map((c) => ({
    ...c,
    settlement:
      MODE === "testnet"
        ? liveSettlementChains.includes(c.id)
          ? "live"
          : "ready"
        : c.family
          ? "unsupported-in-simulate"
          : "simulated",
  }));
  res.json({ chains, mode: MODE, liveSettlementChains });
});

// The rail adapter registry: one pay() contract, x402 live today, the other
// rails as declared (honest) slots — see rails/index.js.
app.get("/api/rails", (req, res) => {
  res.json({ rails: railsCatalog() });
});

// Receipts as first-class audit objects: look one up by id, or hand the whole
// receipt back and have its ECDSA signature verified independently of the
// ledger file — an auditor doesn't have to trust our storage.
// Registered before /api/receipts/:id so "normalized" isn't swallowed as an id param.
app.get("/api/receipts/normalized", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json({ receipts: getLedger().slice(-limit).map(normalizeReceipt) });
});

app.get("/api/receipts/:id", (req, res) => {
  const entry = getLedger().find((e) => e.receiptId === req.params.id);
  if (!entry) return res.status(404).json({ error: "no receipt with that id" });
  res.json({ receipt: entry });
});

app.post("/api/receipts/verify", async (req, res) => {
  const { receiptId, payer, resource, price, chain, signedBy, signature } = req.body || {};
  if (!receiptId || !payer || !resource || !price || !chain || !signedBy || !signature) {
    return res.status(400).json({ error: "receiptId, payer, resource, price, chain, signedBy, signature are all required" });
  }
  let valid = false;
  try {
    valid = await verifyMessage({ address: signedBy, message: receiptMessage({ receiptId, payer, resource, price, chain }), signature });
  } catch {
    valid = false;
  }
  res.json({ valid });
});

// Waitlist for the hosted platform. Durable, append-only; GET exposes only
// the count — never the emails/addresses.
const WAITLIST_PATH = fileURLToPath(new URL("../data/waitlist.json", import.meta.url));
function readWaitlist() {
  try {
    return JSON.parse(readFileSync(WAITLIST_PATH, "utf8"));
  } catch {
    return [];
  }
}
app.post("/api/waitlist", (req, res) => {
  const { email, wallet, chains, notes } = req.body || {};
  if (!email && !wallet) return res.status(400).json({ error: "email or wallet is required" });
  const list = readWaitlist();
  const entry = {
    id: randomUUID(),
    email: email || null,
    wallet: wallet || null,
    chains: Array.isArray(chains) ? chains.slice(0, 10) : [],
    notes: typeof notes === "string" ? notes.slice(0, 500) : null,
    ts: new Date().toISOString(),
  };
  list.push(entry);
  writeFileSync(WAITLIST_PATH, JSON.stringify(list, null, 2));
  sendAlert("waitlist", { email: entry.email, wallet: entry.wallet, chains: entry.chains });
  res.status(201).json({ ok: true, position: list.length });
});
app.get("/api/waitlist", (req, res) => {
  res.json({ count: readWaitlist().length });
});

app.get("/api/ledger", (req, res) => {
  res.json({ entries: getLedger(), balances: getBalances(), mode: MODE });
});

// Tamper-evidence (issue #11): confirm the hash chain over the whole ledger is
// intact. An auditor (or a nightly job) hits this to prove no historical entry
// was edited, deleted, or reordered since it was written — brokenAt names the
// first bad row if the chain is broken.
app.get("/api/ledger/verify-chain", (req, res) => {
  res.json(verifyLedgerChain());
});

app.post("/api/ledger/event", (req, res) => {
  const { address, resource, price, chain, category, status, reason } = req.body || {};
  if (!address || !status) return res.status(400).json({ error: "address and status are required" });
  appendLedgerEntry({ address, resource, amount: price, ...(chain ? { chain } : {}), ...(category ? { category } : {}), status, reason });
  if (status === "blocked") sendAlert("blocked", { address, resource, price, chain, reason });
  maybeFreezeForBurst(address);
  res.status(204).end();
});

// Audit export: the full ledger as CSV for accounting/compliance workflows.
app.get("/api/export.csv", (req, res) => {
  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows = getLedger().map((e) => [e.ts, e.address, e.resource, e.amount, e.chain, e.status, e.mode, e.reason].map(quote).join(","));
  res.set("Content-Type", "text/csv");
  res.set("Content-Disposition", `attachment; filename="spendveto-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(["ts,address,resource,amount,chain,status,mode,reason", ...rows].join("\n"));
});

// Structured decision events — the SIEM-ready evidence surface over the
// hash-chained ledger: one stable schema (spendveto.decision.v1) carrying the
// decision, the policy version in force (policyHash), and the chain-of-custody
// hashes. JSON for dashboards; JSONL export for log shippers (Splunk/Datadog/
// Elastic ingest one-event-per-line without any envelope parsing).
app.get("/api/events", (req, res) => {
  const { since, until, status, address, limit } = req.query;
  res.json({ events: decisionEvents({ since, until, status, address, limit }) });
});

app.get("/api/events/export", (req, res) => {
  const { since, until, status, address, limit } = req.query;
  res.set("Content-Type", "application/x-ndjson");
  res.set("Content-Disposition", `attachment; filename="spendveto-decisions-${new Date().toISOString().slice(0, 10)}.jsonl"`);
  res.send(toJSONL(decisionEvents({ since, until, status, address, limit })));
});

// AP2-style mandate evaluation: SpendVeto as the policy evaluator for an
// AP2-shaped mandate (agent, amount, payee, category, expiry). This is the
// governance half of the AP2 story, real and testable today: the full policy
// pipeline runs against the mandate and the verdict comes back ECDSA-signed by
// the server's receipt key, so the decision is portable evidence. AP2
// *settlement* remains an honest roadmap rail slot (rails/index.js) — this
// endpoint decides; it does not move money.
app.post("/api/ap2/evaluate", async (req, res) => {
  const { id, agent, amountUSD, payee, category, tool, chain, expiresAt } = req.body || {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent || "")) return res.status(400).json({ error: "agent must be a 0x-prefixed 20-byte address" });
  const amount = Number(amountUSD);
  if (!(amount > 0)) return res.status(400).json({ error: "amountUSD must be a positive number" });

  const ts = new Date().toISOString();
  let verdict;
  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    verdict = { allowed: false, code: "mandate_expired", reason: `mandate expired at ${expiresAt}` };
  } else {
    verdict = await checkPolicy(agent, amount, tool || "ap2-mandate", chain || DEFAULT_CHAIN, category, payee);
  }
  const decision = verdict.allowed ? (verdict.requiresApproval ? "requires_approval" : "allow") : "deny";
  const signed = await signDecision({ id, agent, amountUSD: amount, payee, verdict: decision, ts });
  const mandate = { id: id || null, agent, amountUSD: amount, payee: payee || null, category: category || null, tool: tool || null, chain: chain || DEFAULT_CHAIN, expiresAt: expiresAt || null };
  const body = {
    mandate,
    decision,
    reason: verdict.reason || "within policy",
    ...(verdict.code ? { code: verdict.code } : {}),
    ts,
    ...signed, // message, signature, signer — verify with any ECDSA library
  };
  // ?format=vc: same signed verdict, re-shaped as a portable VC envelope
  // (AP2 itself is built on W3C Verifiable Credentials — see server/vc.js).
  if (req.query.format === "vc") {
    return res.json(toVerifiableCredential({ mandate, decision, reason: body.reason, code: verdict.code, ts, ...signed }));
  }
  res.json(body);
});

// AP2 mandate CHAIN evaluation: judge the cart against the intent it claims to
// come from, not just its dollar amount. /api/ap2/evaluate above sees one
// number and so cannot catch the failure the chain exists to expose — a cart
// that drifted off the intent the human actually signed (wrong merchant,
// out-of-scope category, a total that doesn't match its own line items).
app.post("/api/ap2/mandate-chain", async (req, res) => {
  const { agent, intent, cart, chain } = req.body || {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent || "")) return res.status(400).json({ error: "agent must be a 0x-prefixed 20-byte address" });

  const ts = new Date().toISOString();
  const drift = checkCartAgainstIntent(intent, cart);

  // Structural drift is decided before policy: an unauthorized cart is not a
  // budget question, and running the spend pipeline on a total the cart can't
  // justify would be checking the wrong number anyway.
  if (!drift.ok) {
    const signed = await signDecision({ id: cart?.id, agent, amountUSD: Number(cart?.totalUSD) || 0, payee: null, verdict: "deny", ts });
    return res.json({
      decision: "deny",
      stage: "mandate_chain",
      code: drift.code,
      reason: drift.reason,
      suggestion: drift.suggestion,
      intentId: intent?.id ?? null,
      cartId: cart?.id ?? null,
      ts,
      ...signed,
    });
  }

  const payee = cart.payee || null;
  const category = cart.items.find((it) => it.category)?.category || null;
  let verdict = await checkPolicy(agent, drift.totalUSD, "ap2-cart", chain || DEFAULT_CHAIN, category, payee);

  // Human-not-present: a "pause for approval" verdict has no one to answer it,
  // so the signed intent's ceiling decides instead — see server/ap2.js.
  const hnp = reconcileHumanNotPresent({ verdict, intent, totalUSD: drift.totalUSD });
  verdict = hnp.verdict;

  const decision = verdict.allowed ? (verdict.requiresApproval ? "requires_approval" : "allow") : "deny";
  const signed = await signDecision({ id: cart.id, agent, amountUSD: drift.totalUSD, payee, verdict: decision, ts });
  res.json({
    decision,
    stage: "policy",
    reason: hnp.note || verdict.reason || "cart matches its intent and is within policy",
    ...(verdict.code ? { code: verdict.code } : {}),
    ...(verdict.suggestion ? { suggestion: verdict.suggestion } : {}),
    humanPresent: intent?.humanPresent !== false,
    preAuthorizedByIntent: hnp.preAuthorized,
    intentId: intent?.id ?? null,
    cartId: cart.id ?? null,
    totalUSD: drift.totalUSD,
    merchants: drift.merchants,
    itemCount: drift.itemCount,
    ts,
    ...signed,
  });
});

// Bazaar (x402 v2 discovery), publish side: SpendVeto's governed catalog in the
// schema a Bazaar-aware buyer already speaks.
app.get("/api/discovery/resources", (req, res) => {
  const type = req.query.type;
  if (type && type !== "http") return res.json({ resources: [] });
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({ resources: toBazaarResources(allTools(), { baseUrl, chain: req.query.chain }) });
});

// Bazaar, consume side — the control that matters. Discovery lets an agent find
// and pay a service nobody vetted, so a payee allowlist consulted at settlement
// learns about it far too late. This filters a discovered catalog through the
// live policy BEFORE the agent sees it: what it cannot be allowed to pay for,
// it never gets to name. A pre-filter, not a replacement for the gate — the
// resource it does pick still runs the full pipeline at call time.
app.post("/api/discovery/govern", (req, res) => {
  const { resources } = req.body || {};
  if (!Array.isArray(resources)) return res.status(400).json({ error: "resources must be an array of Bazaar listings" });
  let policy;
  try {
    policy = JSON.parse(readFileSync(fileURLToPath(new URL("../data/policy.json", import.meta.url)), "utf8"));
  } catch {
    policy = { maxPerCallUSD: 0.05, maxPerHourUSD: 0.2, maxCallsPerHour: 10, requireApprovalAboveUSD: 0.015 };
  }
  const { allowed, filtered } = governCatalog(resources, policy);
  res.json({ considered: resources.length, allowed, filtered, policyVersion: policyHash(policy) });
});

// Spend analytics: where the money went and where it was stopped.
app.get("/api/analytics", (req, res) => {
  const entries = getLedger();
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const roll = (keyOf) => {
    const map = new Map();
    for (const e of entries) {
      const key = keyOf(e);
      if (!key) continue;
      const row = map.get(key) || { paidCount: 0, paidUSD: 0, blockedCount: 0, blockedUSD: 0 };
      if (e.status === "paid") {
        row.paidCount++;
        row.paidUSD = round(row.paidUSD + Number(e.amount || 0));
      } else if (e.status === "blocked") {
        row.blockedCount++;
        row.blockedUSD = round(row.blockedUSD + Number(e.amount || 0));
      }
      map.set(key, row);
    }
    return [...map.entries()]
      .map(([key, row]) => ({ key, ...row }))
      .sort((a, b) => b.paidUSD - a.paidUSD);
  };
  res.json({
    byTool: roll((e) => e.resource),
    byWallet: roll((e) => e.address?.toLowerCase()),
    // Entries from before the multichain ledger have no chain field; they all
    // settled on the default chain.
    byChain: roll((e) => e.chain || "base-sepolia"),
  });
});

// The spend report: the artifact you forward to whoever owns the budget.
// Pure ledger math over a window — totals, what governance stopped, and the
// breakdowns that answer "where did it go and who tried to overspend?".
app.get("/api/report", (req, res) => {
  const days = Math.min(Number(req.query.days) || 7, 90);
  const cutoff = Date.now() - days * 86400000;
  const entries = getLedger().filter((e) => new Date(e.ts).getTime() >= cutoff);
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const sum = (list) => round(list.reduce((s, e) => s + Number(e.amount || 0), 0));
  const paid = entries.filter((e) => e.status === "paid");
  const blocked = entries.filter((e) => e.status === "blocked");
  const failed = entries.filter((e) => e.status === "failed");
  const rollBy = (keyOf) => {
    const map = new Map();
    for (const e of paid) {
      const k = keyOf(e) || "uncategorized";
      map.set(k, round((map.get(k) || 0) + Number(e.amount || 0)));
    }
    return [...map.entries()].map(([key, usd]) => ({ key, usd })).sort((a, b) => b.usd - a.usd);
  };
  const reasons = new Map();
  for (const e of blocked) {
    const k = (e.reason || "").split(" (")[0].slice(0, 80);
    reasons.set(k, (reasons.get(k) || 0) + 1);
  }
  res.json({
    windowDays: days,
    paid: { count: paid.length, usd: sum(paid) },
    blocked: { count: blocked.length, usd: sum(blocked) },
    failed: { count: failed.length, usd: sum(failed) },
    byCategory: rollBy((e) => e.category),
    byChain: rollBy((e) => e.chain || "base-sepolia"),
    topWallets: rollBy((e) => e.address?.toLowerCase()).slice(0, 8),
    topBlockReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    frozenWallets: listFreezes().filter((f) => !f.unfrozen).length,
    headline: `Governance stopped $${sum(blocked)} across ${blocked.length} attempts in the last ${days}d, while $${sum(paid)} moved under policy.`,
  });
});

// The headline number: dollars the governance layer stopped from moving.
app.get("/api/stats", (req, res) => {
  const entries = getLedger();
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const bucket = (status) => {
    const mine = entries.filter((e) => e.status === status);
    return { count: mine.length, usd: round(mine.reduce((s, e) => s + Number(e.amount || 0), 0)) };
  };
  res.json({
    paid: bucket("paid"),
    blocked: bucket("blocked"),
    failed: bucket("failed"),
    frozenWallets: listFreezes().filter((f) => !f.unfrozen).length,
    totalAttempts: entries.length,
  });
});

// Prometheus-style scrape target — same ledger /api/stats already summarizes,
// in text exposition format so ops can point Prometheus/Grafana at it
// directly instead of polling and reshaping the JSON themselves.
app.get("/metrics", (req, res) => {
  const entries = getLedger();
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const bucket = (status) => {
    const mine = entries.filter((e) => e.status === status);
    return { count: mine.length, usd: round(mine.reduce((s, e) => s + Number(e.amount || 0), 0)) };
  };
  const paid = bucket("paid");
  const blocked = bucket("blocked");
  const failed = bucket("failed");
  const byCategory = {};
  for (const e of entries) {
    if (!e.category || (e.status !== "paid" && e.status !== "blocked")) continue;
    byCategory[e.category] ??= { paid_usd: 0, blocked_usd: 0 };
    byCategory[e.category][`${e.status}_usd`] += Number(e.amount || 0);
  }
  const metric = (name, help, type, value) => [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name} ${value}`];
  const lines = [
    ...metric("spendveto_paid_usd_total", "Total USD governed spend that was paid.", "counter", paid.usd),
    ...metric("spendveto_paid_calls_total", "Total calls that were paid.", "counter", paid.count),
    ...metric("spendveto_blocked_usd_total", "Total USD governance refused to spend.", "counter", blocked.usd),
    ...metric("spendveto_blocked_calls_total", "Total calls governance blocked.", "counter", blocked.count),
    ...metric("spendveto_failed_calls_total", "Total calls that failed for a reason other than a policy block.", "counter", failed.count),
    ...metric("spendveto_frozen_wallets", "Wallets currently frozen (kill switch, manual or anomaly-triggered).", "gauge", listFreezes().filter((f) => !f.unfrozen).length),
    ...metric("spendveto_attempts_total", "All governed spend attempts seen (paid + blocked + failed).", "counter", entries.length),
    "# HELP spendveto_category_usd_total USD paid or blocked, broken down by spend category.",
    "# TYPE spendveto_category_usd_total counter",
    ...Object.entries(byCategory).flatMap(([cat, v]) => [
      `spendveto_category_usd_total{category="${cat}",status="paid"} ${round(v.paid_usd)}`,
      `spendveto_category_usd_total{category="${cat}",status="blocked"} ${round(v.blocked_usd)}`,
    ]),
  ];
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(lines.join("\n") + "\n");
});

// Console write-APIs: the dashboard is a real control surface, not a viewer.
// PUT /api/policy edits the live spend rules; the packs endpoints list and
// apply the committed governance presets (current policy backed up to .bak).
const POLICY_FILE = fileURLToPath(new URL("../data/policy.json", import.meta.url));
const PACKS_DIR = fileURLToPath(new URL("../data/policy-packs", import.meta.url));
app.put("/api/policy", requireAuth("admin"), (req, res) => {
  const b = req.body || {};
  const nums = ["maxPerCallUSD", "maxPerHourUSD", "maxCallsPerHour", "requireApprovalAboveUSD"];
  for (const k of nums) if (b[k] != null && !(Number(b[k]) > 0)) return res.status(400).json({ error: `${k} must be a positive number` });
  let current = {};
  try { current = JSON.parse(readFileSync(POLICY_FILE, "utf8")); } catch {}
  const next = { ...current };
  for (const k of nums) if (b[k] != null) next[k] = Number(b[k]);
  if (b.allowedChains !== undefined) next.allowedChains = Array.isArray(b.allowedChains) && b.allowedChains.length ? b.allowedChains.slice(0, 10) : undefined;
  if (next.allowedChains === undefined) delete next.allowedChains;
  if (b.allowedPayees !== undefined) next.allowedPayees = Array.isArray(b.allowedPayees) && b.allowedPayees.length ? b.allowedPayees.slice(0, 50) : undefined;
  if (next.allowedPayees === undefined) delete next.allowedPayees;
  if (b.anomaly?.burstAttempts > 0 && b.anomaly?.burstWindowSeconds > 0) next.anomaly = { burstAttempts: Number(b.anomaly.burstAttempts), burstWindowSeconds: Number(b.anomaly.burstWindowSeconds) };
  if (typeof b.alertWebhookUrl === "string") next.alertWebhookUrl = b.alertWebhookUrl || undefined;
  if (next.alertWebhookUrl === undefined) delete next.alertWebhookUrl;
  if (typeof b.requireWorldIdForApproval === "boolean") next.requireWorldIdForApproval = b.requireWorldIdForApproval;
  writeFileSync(POLICY_FILE, JSON.stringify(next, null, 2));
  res.json(next);
});

// Shadow mode: set a candidate policy that runs alongside the live one without
// enforcing, read the divergence report, or clear the experiment. The gate
// (server/simulate.js) records what the candidate WOULD have decided on every
// real call; the report says how much spend it would have additionally blocked
// or allowed — measure a policy change against live traffic before promoting.
app.get("/api/shadow", (req, res) => {
  res.json(shadowReport());
});

app.put("/api/shadow", requireAuth("admin"), (req, res) => {
  const b = req.body || {};
  const nums = ["maxPerCallUSD", "maxPerHourUSD", "maxCallsPerHour", "requireApprovalAboveUSD"];
  for (const k of nums) if (b[k] != null && !(Number(b[k]) > 0)) return res.status(400).json({ error: `${k} must be a positive number` });
  res.status(201).json({ ok: true, policy: setShadowPolicy(b) });
});

app.delete("/api/shadow", requireAuth("admin"), (req, res) => {
  clearShadowPolicy();
  res.json({ ok: true, active: false });
});

app.get("/api/policy-packs", (req, res) => {
  const packs = readdirSync(PACKS_DIR).filter((f) => f.endsWith(".json")).map((f) => ({ name: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(`${PACKS_DIR}/${f}`, "utf8")) }));
  res.json({ packs });
});

app.post("/api/policy/apply", requireAuth("admin"), (req, res) => {
  const { pack } = req.body || {};
  const file = `${PACKS_DIR}/${String(pack).replace(/[^a-z-]/g, "")}.json`;
  if (!pack || !existsSync(file)) return res.status(404).json({ error: `unknown pack "${pack}"` });
  try { writeFileSync(`${POLICY_FILE}.bak`, readFileSync(POLICY_FILE)); } catch {}
  const next = JSON.parse(readFileSync(file, "utf8"));
  delete next.$description;
  writeFileSync(POLICY_FILE, JSON.stringify(next, null, 2));
  res.json(next);
});

// One-call budget creation for the console: generates the child wallet
// server-side (simulate-mode convenience — keys live in gitignored
// children.json exactly as the delegate script writes them), stores the
// grant, and returns the address so the CLI can spend as it immediately.
const CHILDREN_FILE = fileURLToPath(new URL("../data/children.json", import.meta.url));
app.post("/api/delegations/wallet", requireAuth("admin"), async (req, res) => {
  const { capUSD, label, parent, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds } = req.body || {};
  if (!(Number(capUSD) > 0)) return res.status(400).json({ error: "a positive capUSD is required" });
  let children = [];
  try { children = JSON.parse(readFileSync(CHILDREN_FILE, "utf8")); } catch {}
  let parentAddress = mainAccount.address;
  if (parent) {
    const match = children.find((c) => c.label === parent || c.address.toLowerCase() === String(parent).toLowerCase());
    if (!match) return res.status(404).json({ error: `no child wallet matching "${parent}"` });
    parentAddress = match.address;
  }
  const privateKey = generatePrivateKey();
  const child = privateKeyToAccount(privateKey);
  const record = createDelegation({ parentAddress, childAddress: child.address, capUSD, label, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds });
  await recordConsent(record, "grant");
  children.push({ address: child.address, privateKey, delegationId: record.id, capUSD: Number(capUSD), label: label || null, allowedTools: record.allowedTools, allowedChains: record.allowedChains, allowedPayees: record.allowedPayees, expiresAt: record.expiresAt, createdAt: record.createdAt });
  writeFileSync(CHILDREN_FILE, JSON.stringify(children, null, 2));
  res.status(201).json({ ...record, spendWith: `npm run call -- <tool> --child="${label || child.address}"` });
});

app.get("/api/policy", (req, res) => {
  try {
    const raw = readFileSync(fileURLToPath(new URL("../data/policy.json", import.meta.url)), "utf8");
    res.json(JSON.parse(raw));
  } catch {
    res.json({ maxPerCallUSD: 0.05, maxPerHourUSD: 0.2, maxCallsPerHour: 10, requireApprovalAboveUSD: 0.015, source: "built-in default" });
  }
});

// Human-in-the-loop approval queue: the client posts a pending request when its
// own policy says a price needs sign-off, then polls until someone (the dashboard,
// a human) decides it. Fails closed — see client/pay-and-call.js's timeout handling.
app.post("/api/approvals", (req, res) => {
  const { address, resource, price } = req.body || {};
  if (!address || !resource || price == null) return res.status(400).json({ error: "address, resource, price are required" });
  const record = createApproval({ address, resource, price });
  // One-click decide links: pasted into Slack/Telegram by the webhook, they
  // let an approver decide from chat — anywhere this server is reachable.
  sendAlert("approval_pending", {
    id: record.id,
    address,
    resource,
    price,
    approveUrl: `http://localhost:${PORT}/api/approvals/${record.id}/decide?decision=approved`,
    denyUrl: `http://localhost:${PORT}/api/approvals/${record.id}/decide?decision=denied`,
  });
  res.status(201).json(record);
});

function readPolicyRequiredApprovals() {
  try {
    const p = JSON.parse(readFileSync(POLICY_FILE, "utf8"));
    return Number(p.approversRequired) > 1 ? Number(p.approversRequired) : 1;
  } catch {
    return 1;
  }
}

function readPolicyRequiresWorldId() {
  try {
    const p = JSON.parse(readFileSync(POLICY_FILE, "utf8"));
    return Boolean(p.requireWorldIdForApproval);
  } catch {
    return false;
  }
}

app.get("/api/approvals", (req, res) => {
  res.json({ approvals: listApprovals() });
});

app.get("/api/approvals/:id", (req, res) => {
  const record = getApproval(req.params.id);
  if (!record) return res.status(404).json({ error: "not found" });
  res.json(record);
});

// GET variant of decide, so the webhook's one-click links work from a chat
// message or any browser — same rules as the POST.
app.get("/api/approvals/:id/decide", (req, res) => {
  const decision = req.query.decision;
  if (decision !== "approved" && decision !== "denied") return res.status(400).send("decision must be 'approved' or 'denied'");
  const record = decideApproval(req.params.id, decision, readPolicyRequiredApprovals());
  if (!record) return res.status(409).send("not pending (already decided, or unknown id)");
  res.send(`<body style="font-family:system-ui;background:#0b0f0c;color:#eef3ed;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h2>${decision === "approved" ? "✅ Approved" : "⛔ Denied"}</h2><p style="color:#93a094">${record.resource} · $${record.price} — recorded. You can close this tab.</p></div></body>`);
});

app.post("/api/approvals/:id/decide", requireAuth("approver"), async (req, res) => {
  const { decision, worldIdProof } = req.body || {};
  if (decision !== "approved" && decision !== "denied") return res.status(400).json({ error: "decision must be 'approved' or 'denied'" });
  // World ID gate (control #33): only an APPROVAL needs proof-of-personhood —
  // a deny never authorizes spend, so it's never gated. When the policy
  // requires it, "approved" must carry a real, independently verified human
  // proof, not just a click from whoever holds an approver key.
  if (decision === "approved" && readPolicyRequiresWorldId()) {
    if (!worldIdConfigured()) {
      return res.status(403).json({ error: "world_id_not_configured", reason: "this policy requires World ID verification on every approval, but WORLD_APP_ID is not set — refusing rather than accepting an unverified approval" });
    }
    const verdict = await verifyWorldIdProof(worldIdProof);
    if (!verdict.verified) {
      return res.status(403).json({ error: "world_id_verification_failed", reason: verdict.reason });
    }
  }
  const record = decideApproval(req.params.id, decision, readPolicyRequiredApprovals());
  if (!record) return res.status(409).json({ error: "not pending (already decided, or unknown id)" });
  res.json(record);
});

// Budget delegation: a parent wallet grants a child agent wallet a capped
// lifetime budget ("IAM for money"). The server is just the shared record
// store — enforcement happens in the child's own policy check (client/policy.js).
app.get("/api/delegations", (req, res) => {
  res.json({ delegations: listDelegations() });
});

app.post("/api/delegations", requireAuth("admin"), async (req, res) => {
  const { parentAddress, childAddress, capUSD, label, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds } = req.body || {};
  if (!parentAddress || !childAddress || !(Number(capUSD) > 0)) {
    return res.status(400).json({ error: "parentAddress, childAddress, and a positive capUSD are required" });
  }
  const delegation = createDelegation({ parentAddress, childAddress, capUSD, label, allowedTools, allowedChains, allowedPayees, ttlSeconds, periodSeconds });
  await recordConsent(delegation, "grant");
  res.status(201).json(delegation);
});

app.post("/api/delegations/:id/revoke", requireAuth("admin"), async (req, res) => {
  const record = revokeDelegation(req.params.id);
  if (!record) return res.status(409).json({ error: "not found or already revoked" });
  await recordConsent(record, "revoke");
  res.json(record);
});

// The consent trail for one delegation: the signed grant, and — once it
// happens — the signed revoke. Each entry is independently verifiable
// (POST /api/consent/verify) without trusting this JSON file, the same way a
// settlement receipt is: the signature is over the record's own fields, not
// over "trust me, the ledger says so".
app.get("/api/consent/:delegationId", (req, res) => {
  res.json({ consents: consentsForDelegation(req.params.delegationId) });
});

app.post("/api/consent/verify", async (req, res) => {
  const { id, parentAddress, childAddress, capUSD, scope, action, ts, signedBy, signature } = req.body || {};
  if (!id || !parentAddress || !childAddress || !capUSD || !scope || !action || !ts || !signedBy || !signature) {
    return res.status(400).json({ error: "id, parentAddress, childAddress, capUSD, scope, action, ts, signedBy, signature are all required" });
  }
  let valid = false;
  try {
    valid = await verifyMessage({ address: signedBy, message: consentMessage({ id, parentAddress, childAddress, capUSD, scope, action, ts }), signature });
  } catch {
    valid = false;
  }
  res.json({ valid });
});

// The Mastercard-Agent-Pay-style "Agentic Token": their tokenized card
// credential binds one agent + one merchant scope + one consent policy into
// a single presentable unit. SpendVeto already has every piece of that
// (delegation cap/scope + signed consent record) but scattered across two
// generic APIs; this is a thin, honest convenience wrapper — not a new
// enforcement mechanism — that requires exactly ONE payee (by construction,
// a "merchant token" that could pay more than one merchant isn't one) and
// hands back the delegation, its signed consent, and a short-lived TTL in
// one bundle. Enforcement is the same payee-allowlist + cap check every
// delegation already gets (client/policy.js).
app.post("/api/agentic-token", requireAuth("admin"), async (req, res) => {
  const { parentAddress, childAddress, capUSD, merchant, allowedTools, ttlSeconds, label } = req.body || {};
  if (!parentAddress || !childAddress || !(Number(capUSD) > 0)) {
    return res.status(400).json({ error: "parentAddress, childAddress, and a positive capUSD are required" });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(merchant || "")) {
    return res.status(400).json({ error: "merchant must be a single 0x-prefixed 20-byte payee address — an agentic token is scoped to exactly one merchant" });
  }
  const delegation = createDelegation({
    parentAddress,
    childAddress,
    capUSD,
    label: label || `agentic token → ${merchant.slice(0, 10)}`,
    allowedTools: allowedTools || null,
    allowedPayees: [merchant],
    ttlSeconds: ttlSeconds || 3600,
  });
  const consent = await recordConsent(delegation, "grant");
  res.status(201).json({ tokenId: delegation.id, merchant, delegation, consent });
});

app.get("/api/agentic-token/:id", (req, res) => {
  const delegation = listDelegations().find((d) => d.id === req.params.id);
  if (!delegation) return res.status(404).json({ error: "no agentic token with that id" });
  res.json({ tokenId: delegation.id, merchant: delegation.allowedPayees?.[0] ?? null, delegation, consents: consentsForDelegation(delegation.id) });
});

// The cross-org trust graph: every wallet a scored node, every delegation an
// edge, every delegation root an "org" with a blended sub-tree reputation. The
// flat per-wallet score, scaled out into the beginnings of an agent credit
// bureau. Registered before /api/trust/:address so "graph" isn't swallowed as
// an address param.
app.get("/api/trust/graph", (req, res) => {
  res.json(trustGraph());
});

// Counterparty bureau: reputation of a recipient address, aggregated across
// every wallet that has paid it — the "credit report on the merchant" side.
app.get("/api/trust/payee/:address", (req, res) => {
  res.json(payeeReputation(req.params.address));
});

// Agent trust score: a wallet's governance history, compressed to one number.
// Paid history earns trust; blocks, failures, and freezes burn it. The ledger
// is the credit file — the beginning of a trust graph for agents.
app.get("/api/trust/:address", (req, res) => {
  res.json(trustScoreFor(req.params.address));
});

// Advanced anomaly analysis: a panel of deterministic behavioural signals
// (block-rate spike, novel payee, category drift, amount outlier) over the
// wallet's own ledger, above and beyond the burst-rate auto-freeze. Advisory —
// surfaced for review, not an automatic block.
app.get("/api/anomaly/:address", (req, res) => {
  res.json(analyzeAnomalies(req.params.address));
});

// Kill switch: freeze a wallet (manually, or automatically via the anomaly
// detector when a runaway loop is suspected). Enforced in the client's policy
// check and, in simulate mode, at the payment gate itself.
app.get("/api/freezes", (req, res) => {
  res.json({ freezes: listFreezes() });
});

app.post("/api/freezes", requireAuth("admin"), (req, res) => {
  const { address, reason } = req.body || {};
  if (!address) return res.status(400).json({ error: "address is required" });
  if (findActiveFreeze(address)) return res.status(409).json({ error: "already frozen" });
  res.status(201).json(createFreeze({ address, reason, source: "manual" }));
});

app.post("/api/freezes/:id/unfreeze", requireAuth("admin"), (req, res) => {
  const record = unfreeze(req.params.id);
  if (!record) return res.status(409).json({ error: "not found or already unfrozen" });
  res.json(record);
});

// ACP (OpenAI/Stripe Agentic Commerce Protocol), buyer side. Same shape as the
// AP2 mandate chain above, because it is the same failure: a scoped credential
// (there, a signed intent; here, a Shared Payment Token) and an agent that
// assembled the actual purchase somewhere else. The merchant validates the
// token; nobody validates the shopping. See server/acp.js.
app.post("/api/acp/checkout", async (req, res) => {
  const { agent, token, session, chain } = req.body || {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent || "")) return res.status(400).json({ error: "agent must be a 0x-prefixed 20-byte address" });

  const ts = new Date().toISOString();
  const drift = checkSessionAgainstToken(token, session);

  // Structural drift decided before policy, for the same reason as AP2: a
  // session the token never authorized is not a budget question.
  if (!drift.ok) {
    const signed = await signDecision({ id: session?.id, agent, amountUSD: Number(session?.totalUSD) || 0, payee: null, verdict: "deny", ts });
    return res.json({
      decision: "deny",
      stage: "spt_scope",
      code: drift.code,
      reason: drift.reason,
      suggestion: drift.suggestion,
      tokenId: token?.id ?? null,
      sessionId: session?.id ?? null,
      ts,
      ...signed,
    });
  }

  const payee = session.payee || drift.merchant || null;
  const category = session.items.find((it) => it.category)?.category || null;
  const verdict = await checkPolicy(agent, drift.totalUSD, "acp-checkout", chain || DEFAULT_CHAIN, category, payee);
  const decision = verdict.allowed ? (verdict.requiresApproval ? "requires_approval" : "allow") : "deny";
  const signed = await signDecision({ id: session.id, agent, amountUSD: drift.totalUSD, payee, verdict: decision, ts });

  // An allowed session is bound to its own bytes before it leaves: the caller
  // executes with this bindingId, and a session edited in between stops
  // verifying. Denials get no binding — there is nothing to authorize.
  const binding = decision === "allow" ? await bindAuthorization({ agent, payload: session, amountUSD: drift.totalUSD, payee }) : null;

  res.json({
    decision,
    stage: "policy",
    reason: verdict.reason || "session matches its token scope and is within policy",
    ...(verdict.code ? { code: verdict.code } : {}),
    ...(verdict.suggestion ? { suggestion: verdict.suggestion } : {}),
    tokenId: token?.id ?? null,
    sessionId: session.id ?? null,
    totalUSD: drift.totalUSD,
    merchant: drift.merchant,
    currency: drift.currency,
    itemCount: drift.itemCount,
    ...(binding ? { binding: { id: binding.id, digest: binding.digest, expiresAt: binding.expiresAt } } : {}),
    ts,
    ...signed,
  });
});

// Request integrity (server/integrity.js): bind an authorization to the exact
// request it was granted for, then refuse at execution if the payload moved.
app.post("/api/integrity/bind", async (req, res) => {
  const { agent, payload, amountUSD, payee, ttlMs } = req.body || {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent || "")) return res.status(400).json({ error: "agent must be a 0x-prefixed 20-byte address" });
  if (payload === undefined) return res.status(400).json({ error: "payload is required — there is nothing to bind an authorization to" });
  const record = await bindAuthorization({ agent, payload, amountUSD, payee, ...(ttlMs ? { ttlMs: Number(ttlMs) } : {}) });
  res.status(201).json({ id: record.id, digest: record.digest, agent: record.agent, expiresAt: record.expiresAt, message: record.message, signature: record.signature, signer: record.signer });
});

app.post("/api/integrity/verify", (req, res) => {
  const { bindingId, payload, agent } = req.body || {};
  if (!bindingId) return res.status(400).json({ error: "bindingId is required" });
  const result = verifyBinding({ bindingId, payload, agent });
  res.status(result.ok ? 200 : 409).json(result);
});

app.get("/api/integrity/digest", (req, res) => {
  res.json({ digest: requestDigest(req.query.payload ? JSON.parse(req.query.payload) : null) });
});

app.get("/api/integrity/:id", (req, res) => {
  const record = getBinding(req.params.id);
  if (!record) return res.status(404).json({ error: "not found" });
  res.json(record);
});

// Dispute evidence packs (server/disputes.js) — the agent-side defence file
// that card-scheme evidence rules have no equivalent for yet.
app.get("/api/disputes/:entryHash/evidence", async (req, res) => {
  const pack = await buildEvidencePack(req.params.entryHash);
  res.status(pack.ok ? 200 : 404).json(pack);
});

app.post("/api/disputes/verify", (req, res) => {
  const result = checkEvidencePack(req.body?.pack ?? req.body);
  res.status(result.ok ? 200 : 409).json(result);
});

// OpenTelemetry (server/otel.js): the same decisions as /api/events, shaped as
// OTLP spans so a refusal lands inside the agent trace that caused it.
app.get("/api/otel/spans", async (req, res) => {
  const { since, until, status, address, limit, service } = req.query;
  const spans = decisionSpans({ traceparent: req.get("traceparent"), since, until, status, address, limit });
  const payload = toOtlpPayload(spans, service ? { serviceName: service } : {});
  const exported = req.query.export === "1" ? await exportSpans(payload) : { exported: false, reason: "not requested" };
  res.json({ spanCount: spans.length, traceparent: req.get("traceparent") || null, exported, payload });
});

app.listen(PORT, () => {
  console.log(`SpendVeto server — mode: ${MODE}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Catalog:   ${TOOLS.map((t) => `${t.path} ($${t.price})`).join(", ")}`);
  if (MODE === "simulate") console.log(`Client wallets are auto-seeded with a $5.00 simulated USDC balance on first call.`);
});
