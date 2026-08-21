// ~4-minute detailed cut. Every playground control, every dashboard
// tab (overview, agents, policy, budgets, approvals, ledger, chains,
// analytics, trust, report), a tool registration, and the key
// marketing pages. Use this for a due-diligence / deep-dive audience,
// not a first-touch pitch.
// Run: node scripts/demo-detailed.mjs  (server + site must already be up)
import { chromium } from "playwright";

const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 130,
    channel: "chrome",
    args: ["--start-maximized"],
  });
  const page = await browser.newPage({ viewport: null });

  // --- Playground: full control surface ---
  // percall/hourly/rate/appr are range sliders — set via evaluate + input
  // event, since .fill() only works on text-like inputs.
  const setSlider = async (id, value) => {
    await page.locator(`#${id}`).evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };

  // --- Landing page first ---
  await page.goto(`${SITE}/`);
  await pause(2200);

  await page.goto(`${SITE}/playground.html`);
  await pause(2000);
  await setSlider("percall", 5);
  await pause(500);
  await setSlider("hourly", 50);
  await pause(500);
  await setSlider("rate", 10);
  await pause(500);
  await setSlider("appr", 10);
  await pause(500);
  await page.locator("#payee + .slider").click();
  await pause(800);
  await page.click("#burst");
  await pause(3200);
  await pause(1800);
  await page.click("#unfreeze");
  await pause(1500);
  await page.click("#autorun");
  await pause(2500);
  await page.click("#autorun");
  await pause(600);
  await page.click("#reset");
  await pause(1200);

  // --- Dashboard: Overview ---
  await page.goto(`${APP}/`);
  await pause(1600);
  await page.click('[data-nav="overview"]');
  await pause(1800);

  // --- Agents ---
  await page.click('[data-nav="agents"]');
  await pause(1000);
  await page.fill('#agent-form input[name="label"]', "demo bot");
  await pause(500);
  await page.click('#agent-form button[type="submit"]');
  await pause(1800);

  // --- Tool registration ---
  const toolForm = page.locator("#tool-form");
  if (await toolForm.count()) {
    await toolForm.locator('input[name="id"]').fill("demo-tool");
    await pause(400);
    await toolForm.locator('input[name="price"]').fill("0.02");
    await pause(400);
    await toolForm.locator('input[name="label"]').fill("Demo Tool");
    await pause(600);
    await toolForm.locator('button[type="submit"]').click();
    await pause(1600);
  }

  // --- Policy ---
  await page.click('[data-nav="policy"]');
  await pause(1000);
  await page.fill('#policy-form input[name="maxPerCallUSD"]', "5");
  await page.fill('#policy-form input[name="maxPerHourUSD"]', "50");
  await page.fill('#policy-form input[name="maxCallsPerHour"]', "20");
  await page.fill('#policy-form input[name="requireApprovalAboveUSD"]', "10");
  await pause(800);
  await page.click('#policy-form button[type="submit"]');
  await pause(1800);

  // --- Budgets: nested delegation ---
  await page.click('[data-nav="budgets"]');
  await pause(1000);
  await page.fill('#grant-form input[name="capUSD"]', "0.05");
  await page.fill('#grant-form input[name="label"]', "research agent");
  await pause(500);
  await page.click('#grant-form button[type="submit"]');
  await pause(1800);
  await page.fill('#grant-form input[name="capUSD"]', "0.01");
  await page.fill('#grant-form input[name="label"]', "sub-agent");
  await page.fill('#grant-form input[name="parent"]', "research agent");
  await pause(600);
  await page.click('#grant-form button[type="submit"]');
  await pause(1800);

  // --- Approvals ---
  await page.click('[data-nav="approvals"]');
  await pause(2000);

  // --- Ledger ---
  await page.click('[data-nav="ledger"]');
  await pause(2200);

  // --- Chains ---
  await page.click('[data-nav="chains"]');
  await pause(2200);

  // --- Analytics ---
  await page.click('[data-nav="analytics"]');
  await pause(2200);

  // --- Trust ---
  await page.click('[data-nav="trust"]');
  await pause(1000);
  await page.fill('#trust-form input[name="addr"]', "0x0000000000000000000000000000000000dEaD");
  await pause(500);
  await page.click('#trust-form button[type="submit"]');
  await pause(1800);

  // --- Report ---
  await page.click('[data-nav="report"]');
  await pause(2200);

  // --- Marketing pages: proof it's a real product, not just a console ---
  await page.goto(`${SITE}/use-cases.html`);
  await pause(2200);
  await page.goto(`${SITE}/security.html`);
  await pause(2200);
  await page.goto(`${SITE}/docs.html`);
  await pause(2200);

  // --- Close on pitch ---
  await page.goto(`${SITE}/pitch.html`);
  await pause(3500);

  console.log("Detailed cut complete (~4 min). Leaving browser open — close manually.");
}

main().catch((err) => {
  console.error("Detailed demo failed:", err);
  process.exit(1);
});
