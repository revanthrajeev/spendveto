// ~120s cut. Full marketing-site tour, live playground cycle, every
// dashboard tab in nav order, live agent/policy/budget creation.
// Timings are tuned against measured real runtime (see the printed
// "Actual elapsed" line), not guessed.
// Run: node scripts/demo-2min.mjs  (server + site must already be up)
import { chromium } from "playwright";

const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 90,
    channel: "chrome",
    args: ["--start-maximized"],
  });
  const page = await browser.newPage({ viewport: null });

  // --- Marketing site tour ---
  await page.goto(`${SITE}/`);
  await pause(6500);
  await page.goto(`${SITE}/use-cases.html`);
  await pause(4300);
  await page.goto(`${SITE}/docs.html`);
  await pause(4300);
  await page.goto(`${SITE}/security.html`);
  await pause(4300);
  await page.goto(`${SITE}/pricing.html`);
  await pause(4300);
  await page.goto(`${SITE}/about.html`);
  await pause(3600);

  // --- Playground: live cycle ---
  await page.goto(`${SITE}/playground.html`);
  await pause(5100);
  await page.fill("#percall", "5");
  await pause(700);
  await page.fill("#hourly", "50");
  await pause(700);
  await page.fill("#rate", "10");
  await pause(1700);
  await page.click("#burst");
  await pause(8000);
  await pause(2900);
  await page.click("#unfreeze");
  await pause(2900);

  // --- Dashboard: create an agent, a policy, a budget grant ---
  await page.goto(`${APP}/`);
  await pause(3600);
  await page.click('[data-nav="agents"]');
  await pause(2600);
  await page.fill('#agent-form input[name="label"]', "demo bot");
  await pause(900);
  await page.click('#agent-form button[type="submit"]');
  await pause(3200);

  await page.click('[data-nav="policy"]');
  await pause(2600);
  await page.fill('#policy-form input[name="maxPerCallUSD"]', "5");
  await page.fill('#policy-form input[name="maxPerHourUSD"]', "50");
  await page.fill('#policy-form input[name="maxCallsPerHour"]', "20");
  await page.fill('#policy-form input[name="requireApprovalAboveUSD"]', "10");
  await pause(1450);
  await page.click('#policy-form button[type="submit"]');
  await pause(3200);

  await page.click('[data-nav="budgets"]');
  await pause(2600);
  await page.fill('#grant-form input[name="capUSD"]', "0.05");
  await page.fill('#grant-form input[name="label"]', "research agent");
  await pause(1450);
  await page.click('#grant-form button[type="submit"]');
  await pause(3200);

  // --- Every remaining dashboard tab, in nav order ---
  for (const tab of ["approvals", "ledger", "chains", "analytics", "trust", "report"]) {
    await page.click(`[data-nav="${tab}"]`);
    await pause(4600);
  }

  // --- Close on pitch ---
  await page.goto(`${SITE}/pitch.html`);
  await pause(8700);

  console.log("2-min cut complete. Leaving browser open — close manually.");
}

const started = Date.now();
main()
  .then(() => {
    console.log(`Actual elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  })
  .catch((err) => {
    console.error("2-min demo failed:", err);
    process.exit(1);
  });
