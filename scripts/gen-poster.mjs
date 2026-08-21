// Regenerates site/assets/demo-poster.jpg — the still behind the demo video's
// play button — by screenshotting the real playground page.
//
// Same reasoning as scripts/gen-og.mjs: the previous poster was a loose JPEG
// with no source, so it kept showing the old brand long after the pages had
// been renamed. A poster that is a screenshot of the live page can never drift
// from the live page.
//
// Requires the site server to be up:
//   npm run site      # :8403
//   node scripts/gen-poster.mjs

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}site/assets/demo-poster.jpg`;
const SITE = process.env.SITE_URL || "http://localhost:8403";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 922 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(`${SITE}/playground.html`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// The page reveals sections on scroll; a headless shot would otherwise catch
// them mid-fade. Settle them all before capturing.
await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in")));
await page.waitForTimeout(700);

// Drive real governed activity so the poster shows the console doing its job
// — a paid call and a blocked one — rather than an empty starting state.
for (const label of ["runaway burst", "pay an unknown vendor", "premium data", "translate"]) {
  const el = page.locator(`text=${label}`).first();
  if (await el.count()) {
    try {
      await el.click({ timeout: 1500 });
      await page.waitForTimeout(550);
    } catch {
      /* a control that moved or isn't clickable is not worth failing the shot over */
    }
  }
}
await page.waitForTimeout(1400);

await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
await browser.close();
console.log(`wrote ${OUT}`);
