// ~5-minute full product review. Every marketing page, every playground
// control, live agent + tool + policy + nested-budget creation, every
// dashboard tab, scroll-through close on the pitch page.
// Timings are verified against measured real runtime before use — see
// the "Actual elapsed" line this script prints at the end.
// Run: node scripts/demo-5min.mjs  (server + site must already be up)
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

  const setSlider = async (id, value) => {
    await page.locator(`#${id}`).evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };

  // --- Marketing site: broad tour ---
  await page.goto(`${SITE}/`);
  await pause(15200);
  await page.goto(`${SITE}/use-cases.html`);
  await pause(11400);
  await page.goto(`${SITE}/docs.html`);
  await pause(11400);
  await page.goto(`${SITE}/security.html`);
  await pause(11400);
  await page.goto(`${SITE}/pricing.html`);
  await pause(11400);
  await page.goto(`${SITE}/about.html`);
  await pause(9500);
  await page.goto(`${SITE}/signup.html`);
  await pause(7600);
  await page.goto(`${SITE}/contact.html`);
  await pause(7600);

  // --- Playground: full control surface ---
  await page.goto(`${SITE}/playground.html`);
  await pause(11400);
  await setSlider("percall", 5);
  await pause(1900);
  await setSlider("hourly", 50);
  await pause(1900);
  await setSlider("rate", 10);
  await pause(1900);
  await setSlider("appr", 10);
  await pause(1900);
  await page.locator("#payee + .slider").click();
  await pause(2850);
  await page.click("#burst");
  await pause(17100);
  await pause(5700);
  await page.click("#unfreeze");
  await pause(5700);
  await page.click("#autorun");
  await pause(7600);
  await page.click("#autorun");
  await pause(1900);
  await page.click("#reset");
  await pause(3800);

  // --- Dashboard: Overview ---
  await page.goto(`${APP}/`);
  await pause(5700);
  await page.click('[data-nav="overview"]');
  await pause(7600);

  // --- Agents: register one live ---
  await page.click('[data-nav="agents"]');
  await pause(4750);
  await page.fill('#agent-form input[name="label"]', "demo bot");
  await pause(1520);
  await page.click('#agent-form button[type="submit"]');
  await pause(5700);

  // --- Register a tool, if the form is on this tab ---
  const toolForm = page.locator("#tool-form");
  if (await toolForm.count()) {
    await toolForm.locator('input[name="id"]').fill("demo-tool");
    await pause(900);
    await toolForm.locator('input[name="price"]').fill("0.02");
    await pause(900);
    await toolForm.locator('input[name="label"]').fill("Demo Tool");
    await pause(1050);
    await toolForm.locator('button[type="submit"]').click();
    await pause(5700);
  }

  // --- Policy: set live caps ---
  await page.click('[data-nav="policy"]');
  await pause(4750);
  await page.fill('#policy-form input[name="maxPerCallUSD"]', "5");
  await page.fill('#policy-form input[name="maxPerHourUSD"]', "50");
  await page.fill('#policy-form input[name="maxCallsPerHour"]', "20");
  await page.fill('#policy-form input[name="requireApprovalAboveUSD"]', "10");
  await pause(2850);
  await page.click('#policy-form button[type="submit"]');
  await pause(5700);

  // --- Budgets: a grant, then a nested sub-grant (delegation tree) ---
  await page.click('[data-nav="budgets"]');
  await pause(4750);
  await page.fill('#grant-form input[name="capUSD"]', "0.05");
  await page.fill('#grant-form input[name="label"]', "research agent");
  await pause(2850);
  await page.click('#grant-form button[type="submit"]');
  await pause(5700);
  await page.fill('#grant-form input[name="capUSD"]', "0.01");
  await page.fill('#grant-form input[name="label"]', "sub-agent");
  await page.fill('#grant-form input[name="parent"]', "research agent");
  await pause(2850);
  await page.click('#grant-form button[type="submit"]');
  await pause(5700);

  // --- Approvals ---
  await page.click('[data-nav="approvals"]');
  await pause(7600);

  // --- Ledger ---
  await page.click('[data-nav="ledger"]');
  await pause(8550);

  // --- Chains ---
  await page.click('[data-nav="chains"]');
  await pause(8550);

  // --- Analytics ---
  await page.click('[data-nav="analytics"]');
  await pause(8550);

  // --- Trust: live counterparty lookup ---
  await page.click('[data-nav="trust"]');
  await pause(4750);
  await page.fill('#trust-form input[name="addr"]', "0x0000000000000000000000000000000000dEaD");
  await pause(1520);
  await page.click('#trust-form button[type="submit"]');
  await pause(5700);

  // --- Report ---
  await page.click('[data-nav="report"]');
  await pause(8550);

  // --- Close: scroll through the pitch page ---
  await page.goto(`${SITE}/pitch.html`);
  await pause(9500);
  await page.mouse.wheel(0, 900);
  await pause(5700);
  await page.mouse.wheel(0, 900);
  await pause(5700);

  console.log("5-min cut complete. Leaving browser open — close manually.");
}

const started = Date.now();
main()
  .then(() => {
    console.log(`Actual elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  })
  .catch((err) => {
    console.error("5-min demo failed:", err);
    process.exit(1);
  });
