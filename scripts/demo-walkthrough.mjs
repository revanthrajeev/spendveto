// One-off demo automation for screen recording. Not part of the app —
// run manually with `node scripts/demo-walkthrough.mjs` while the server
// (npm run server) and site (npm run site) are already up, and your
// screen recorder is rolling. Drives a real visible browser window
// through the whole product, screen by screen, with pauses so the
// recording reads clearly.
import { chromium } from "playwright";

const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 120,
    channel: "chrome",
    args: ["--start-maximized"],
  });
  const page = await browser.newPage({ viewport: null });

  // --- Playground ---
  await page.goto(`${SITE}/playground.html`);
  await pause(1500);

  await page.fill("#percall", "5");
  await pause(400);
  await page.fill("#hourly", "50");
  await pause(400);
  await page.fill("#rate", "10");
  await pause(600);

  await page.click("#burst");
  await pause(2500);

  await page.click("#frozen");
  await pause(1500);
  await page.click("#unfreeze");
  await pause(1500);

  // --- Dashboard: Agents ---
  await page.goto(`${APP}/`);
  await pause(1200);
  await page.click('[data-nav="agents"]');
  await pause(800);
  await page.fill('#agent-form input[name="label"]', "demo bot");
  await pause(400);
  await page.click('#agent-form button[type="submit"]');
  await pause(1500);

  // --- Dashboard: Policy ---
  await page.click('[data-nav="policy"]');
  await pause(800);
  await page.fill('#policy-form input[name="maxPerCallUSD"]', "5");
  await page.fill('#policy-form input[name="maxPerHourUSD"]', "50");
  await page.fill('#policy-form input[name="maxCallsPerHour"]', "20");
  await page.fill('#policy-form input[name="requireApprovalAboveUSD"]', "10");
  await pause(600);
  await page.click('#policy-form button[type="submit"]');
  await pause(1500);

  // --- Dashboard: Budgets (grant) ---
  await page.click('[data-nav="budgets"]');
  await pause(800);
  await page.fill('#grant-form input[name="capUSD"]', "0.05");
  await page.fill('#grant-form input[name="label"]', "research agent");
  await pause(600);
  await page.click('#grant-form button[type="submit"]');
  await pause(1500);

  // --- Dashboard: Approvals ---
  await page.click('[data-nav="approvals"]');
  await pause(1500);

  // --- Dashboard: Ledger ---
  await page.click('[data-nav="ledger"]');
  await pause(1500);

  // --- Dashboard: Chains ---
  await page.click('[data-nav="chains"]');
  await pause(1500);

  // --- Dashboard: Trust ---
  await page.click('[data-nav="trust"]');
  await pause(800);
  await page.fill('#trust-form input[name="addr"]', "0x0000000000000000000000000000000000dEaD");
  await pause(400);
  await page.click('#trust-form button[type="submit"]');
  await pause(1500);

  // --- Dashboard: Analytics + Report ---
  await page.click('[data-nav="analytics"]');
  await pause(1500);
  await page.click('[data-nav="report"]');
  await pause(1500);

  // --- Close on pitch/site ---
  await page.goto(`${SITE}/pitch.html`);
  await pause(3000);

  console.log("Walkthrough complete — leaving browser open. Close it manually when done recording.");
}

main().catch((err) => {
  console.error("Demo walkthrough failed:", err);
  process.exit(1);
});
