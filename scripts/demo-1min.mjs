// ~65-70s cut — YC-style. Tours every marketing page briefly, then one
// live playground cycle, then a dashboard proof point, then close.
// Timings are tuned against measured real runtime, not guessed.
// Run: node scripts/demo-1min.mjs  (server + site must already be up)
import { chromium } from "playwright";

const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 60,
    channel: "chrome",
    args: ["--start-maximized"],
  });
  const page = await browser.newPage({ viewport: null });

  // --- Marketing site, quick tour ---
  await page.goto(`${SITE}/`);
  await pause(3500);
  await page.goto(`${SITE}/use-cases.html`);
  await pause(2200);
  await page.goto(`${SITE}/docs.html`);
  await pause(2200);
  await page.goto(`${SITE}/security.html`);
  await pause(2200);
  await page.goto(`${SITE}/pricing.html`);
  await pause(2200);

  // --- Playground: the live demo ---
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

  // --- Dashboard: every tab, in nav order ---
  await page.goto(`${APP}/`);
  await pause(2500);
  for (const tab of [
    "overview",
    "approvals",
    "budgets",
    "ledger",
    "chains",
    "analytics",
    "trust",
    "policy",
    "agents",
    "report",
  ]) {
    await page.click(`[data-nav="${tab}"]`);
    await pause(2800);
  }

  // --- Close on pitch ---
  await page.goto(`${SITE}/pitch.html`);
  await pause(6000);

  console.log("Demo cut complete. Leaving browser open — close manually.");
}

const started = Date.now();
main()
  .then(() => {
    console.log(`Actual elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  })
  .catch((err) => {
    console.error("1-min demo failed:", err);
    process.exit(1);
  });
