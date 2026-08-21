// One command to record the product film.
//
//   node scripts/demo-record.mjs
//
// The older scripts/demo-*.mjs cuts assume you already booted two servers and
// that the ledger happens to have data in it. Both assumptions fail in the one
// moment they matter — mid-recording, with the dashboard showing empty tables.
// So this does the whole thing: boots the app and site servers, seeds real
// governed traffic so every dashboard tab has something to show, counts you in
// so you can start the screen recorder, then drives the tour.
//
// Flags:
//   --no-seed     skip seeding (use whatever is already in the ledger)
//   --countdown=N seconds before the tour starts (default 8)
//   --cut=1min|2min|5min   which cut to drive (default 1min)
//
// Stop the recording when the terminal prints DONE. The browser is left open
// on purpose; close it yourself so a window-closing animation never lands in
// the last frame.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const SEED = !process.argv.includes("--no-seed");
const COUNTDOWN = Number(arg("countdown", 8));
const CUT = arg("cut", "1min");

const children = [];
function boot(script, label, env = {}) {
  const proc = spawn("node", [script], { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore" });
  children.push(proc);
  console.log(`  started ${label}`);
  return proc;
}

async function waitFor(url, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error(`${label} did not come up at ${url}`);
}

// Real calls through the real client, so the ledger rows on camera are genuine
// settlements and genuine refusals — not fixtures. A film of seeded fake data
// would be exactly the thing this project refuses to ship.
function call(tool, extraArgs = []) {
  return new Promise((resolve) => {
    const p = spawn("node", ["client/pay-and-call.js", tool, ...extraArgs], {
      cwd: ROOT,
      env: { ...process.env, SPENDVETO_MODE: "simulate" },
      stdio: "ignore",
    });
    p.on("close", resolve);
  });
}

const pause = (ms) => sleep(ms);

async function tour1min(page) {
  const step = (n, what) => console.log(`  [${n}] ${what}`);

  step(1, "marketing tour");
  await page.goto(`${SITE}/`);
  await pause(3500);
  for (const [p, ms] of [["use-cases", 2200], ["docs", 2200], ["security", 2200], ["pricing", 2200]]) {
    await page.goto(`${SITE}/${p}.html`);
    await pause(ms);
  }

  step(2, "playground — cap, budget, runaway burst, auto-freeze, unfreeze");
  await page.goto(`${SITE}/playground.html`);
  await pause(3500);
  await page.fill("#percall", "5");
  await pause(500);
  await page.fill("#hourly", "50");
  await pause(1200);
  await page.click("#burst");
  await pause(6000);
  await pause(2500);
  await page.click("#unfreeze");
  await pause(2500);

  step(3, "console — all ten tabs");
  await page.goto(`${APP}/`);
  await pause(2500);
  for (const tab of ["overview", "approvals", "budgets", "ledger", "chains", "analytics", "trust", "policy", "agents", "report"]) {
    await page.click(`[data-nav="${tab}"]`);
    await pause(2800);
  }

  step(4, "close on the pitch page");
  await page.goto(`${SITE}/pitch.html`);
  await pause(6000);
}

async function main() {
  console.log("\nBooting servers…");
  boot("server/index.js", "app  :8402", { SPENDVETO_MODE: "simulate" });
  boot("scripts/site.mjs", "site :8403");
  await waitFor(`${APP}/api/stats`, "app server");
  await waitFor(`${SITE}/index.html`, "site server");
  console.log("  both up.");

  if (SEED) {
    // A leftover auto-freeze from an earlier run would block every seeded call,
    // and the film would show a dead wallet instead of working governance.
    // Clear active freezes first — the tour creates its own freeze on camera.
    const { freezes = [] } = await fetch(`${APP}/api/freezes`).then((r) => r.json());
    const active = freezes.filter((f) => !f.unfrozen);
    for (const f of active) {
      await fetch(`${APP}/api/freezes/${f.id}/unfreeze`, { method: "POST" });
    }
    if (active.length) console.log(`\n  cleared ${active.length} leftover freeze(s) from an earlier run`);

    console.log("\nSeeding real governed traffic (so no dashboard tab is empty on camera)…");
    // A spread of prices: some clear, some trip the approval threshold, some
    // are refused outright. That spread is what makes the ledger readable.
    await call("translate");
    await call("review");
    await call("translate");
    await call("summarize");
    await call("review");
    const stats = await fetch(`${APP}/api/stats`).then((r) => r.json());
    console.log(`  ledger seeded — paid $${stats.paid?.usd ?? "?"}, blocked $${stats.blocked?.usd ?? "?"}`);
  }

  if (CUT !== "1min") {
    console.log(`\nNote: --cut=${CUT} isn't wired here yet; driving the 1min cut.`);
  }

  console.log(`\n${"─".repeat(56)}`);
  console.log("  START YOUR SCREEN RECORDING NOW");
  console.log("  macOS: Cmd+Shift+5 → Record Selected Portion → pick the");
  console.log("  Chrome window → Record. Or QuickTime → New Screen Recording.");
  console.log(`${"─".repeat(56)}`);
  for (let i = COUNTDOWN; i > 0; i--) {
    process.stdout.write(`\r  starting in ${i}…   `);
    await sleep(1000);
  }
  console.log("\r  GO.                    \n");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 60,
    channel: "chrome",
    args: ["--start-maximized"],
  });
  const page = await browser.newPage({ viewport: null });

  const started = Date.now();
  await tour1min(page);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(56)}`);
  console.log(`  DONE — stop the recording. Runtime: ${elapsed}s`);
  console.log("  Browser left open on purpose. Close it yourself so the");
  console.log("  window-closing animation doesn't land in your last frame.");
  console.log(`${"─".repeat(56)}\n`);
  console.log("  Press Ctrl+C when you're finished to shut the servers down.");

  // Deliberately does not exit: killing the process would tear down the two
  // servers, and the browser is still showing pages served by them.
  await new Promise(() => {});
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("\ndemo-record failed:", err.message);
  shutdown();
});
