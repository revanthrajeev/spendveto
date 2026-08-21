// Regenerates the social cards in site/assets/generated/.
//
// These existed as loose PNGs with no source, which is exactly why they still
// said "TOLLGATE" long after everything else had been renamed: an image nobody
// can rebuild is an image nobody updates. This script is the source. Run it
// after any brand or copy change:
//
//   node scripts/gen-og.mjs
//
// Self-contained like the site itself — the wordmark uses the same bundled
// Space Grotesk woff2 the pages use, so the card and the site can't drift
// apart typographically, and nothing is fetched from a CDN at build time.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}site/assets/generated`;
const FONT = `file://${ROOT}site/fonts/space-grotesk.woff2`;

const WORDMARK = "SPENDVETO";

// The gate diagram: one spend cleared, one refused at the same line. The whole
// product in two paths, which is why it earns the right half of the card.
const GATE_SVG = `
<svg viewBox="0 0 320 300" width="320" height="300" fill="none">
  <text x="160" y="16" fill="#46d68c" font-size="11" letter-spacing="1.6" text-anchor="middle" font-family="SG">GATE</text>
  <text x="52"  y="56" fill="#93a094" font-size="11" letter-spacing="1.6" text-anchor="middle" font-family="SG">AGENT</text>
  <text x="272" y="56" fill="#93a094" font-size="11" letter-spacing="1.6" text-anchor="middle" font-family="SG">OUTPUT</text>
  <line x1="160" y1="26" x2="160" y2="300" stroke="#46d68c" stroke-width="1.5"/>
  <circle cx="52" cy="104" r="19" stroke="#eef3ed" stroke-width="1.4"/>
  <text x="52" y="109" fill="#eef3ed" font-size="14" text-anchor="middle" font-family="SG">$</text>
  <line x1="71" y1="104" x2="160" y2="104" stroke="#46d68c" stroke-width="1.6"/>
  <line x1="160" y1="104" x2="252" y2="104" stroke="#46d68c" stroke-width="1.6"/>
  <circle cx="160" cy="104" r="5" fill="#46d68c"/>
  <path d="M256 100 l8 10 l14 -20" stroke="#eef3ed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="52" cy="224" r="19" stroke="#eef3ed" stroke-width="1.4"/>
  <text x="52" y="229" fill="#eef3ed" font-size="14" text-anchor="middle" font-family="SG">$</text>
  <line x1="71" y1="224" x2="152" y2="224" stroke="#e8a04a" stroke-width="1.6"/>
  <path d="M141 214 l11 10 l-11 10" stroke="#e8a04a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="160" cy="224" r="5" fill="#e8a04a"/>
  <path d="M153 217 l14 14 M167 217 l-14 14" stroke="#e8a04a" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// The playground card shows the controls the page actually gives you, so the
// preview matches what a visitor lands on.
const row = (label, pct) => `
  <div class="row">
    <div class="lab">${label}</div>
    <div class="track"><div class="fill" style="width:${pct}%"></div><div class="knob" style="left:calc(${pct}% - 6px)"></div></div>
  </div>`;

const chip = (text, tone) => `<div class="chip ${tone}">${text}</div>`;

const PLAYGROUND_SVG = `
<div class="pg">
  <div class="sliders">${row("MAX BUDGET", 76)}${row("RATE LIMIT", 40)}${row("COOLDOWN", 86)}</div>
  <div class="chips">${chip("PAID", "ok")}${chip("BLOCKED", "warn")}${chip("PENDING", "mute")}</div>
</div>`;

const page = (sub, right) => `
<style>
  @font-face { font-family: "SG"; src: url("${FONT}") format("woff2"); font-weight: 500 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: #070a08; color: #eef3ed;
    font-family: "SG", -apple-system, sans-serif; overflow: hidden; position: relative;
  }
  /* Same faint grid the site draws behind its canvas frame. */
  body::before {
    content: ""; position: absolute; inset: 0;
    background-image: linear-gradient(rgba(238,243,237,0.05) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(238,243,237,0.05) 1px, transparent 1px);
    background-size: 64px 64px;
  }
  body::after {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(900px 500px at 78% 22%, rgba(70,214,140,0.07), transparent 70%);
  }
  .wrap { position: relative; z-index: 1; display: flex; height: 100%; align-items: center; padding: 0 100px; gap: 56px; }
  .left { flex: 1; }
  .mark { font-size: 84px; font-weight: 500; letter-spacing: 0.06em; line-height: 1; white-space: nowrap; }
  .tick { color: #46d68c; }
  .sub { margin-top: 26px; font-size: 27px; color: #93a094; letter-spacing: 0.01em; }
  .pill {
    position: absolute; left: 100px; bottom: 118px;
    border: 1px solid rgba(70,214,140,0.45); border-radius: 99px;
    padding: 13px 26px; font-size: 17px; color: #46d68c; letter-spacing: 0.02em;
  }
  .right { width: 340px; display: flex; justify-content: center; }
  .pg { display: flex; gap: 34px; align-items: flex-start; }
  .sliders { display: flex; flex-direction: column; gap: 30px; width: 224px; }
  .lab { font-size: 12px; letter-spacing: 1.6px; color: #93a094; margin-bottom: 11px; }
  .track { position: relative; height: 2px; background: rgba(238,243,237,0.16); border-radius: 2px; }
  .fill { position: absolute; inset: 0 auto 0 0; background: #46d68c; border-radius: 2px; }
  .knob { position: absolute; top: -5px; width: 12px; height: 12px; border-radius: 50%; background: #46d68c; }
  .chips { display: flex; flex-direction: column; gap: 18px; }
  .chip { width: 142px; text-align: center; padding: 13px 0; border-radius: 7px; font-size: 14px; letter-spacing: 1.3px; }
  .chip.ok   { border: 1px solid rgba(70,214,140,0.5); color: #46d68c; }
  .chip.warn { border: 1px solid rgba(232,160,74,0.55); color: #e8a04a; }
  .chip.mute { border: 1px solid rgba(238,243,237,0.2); color: #93a094; }
</style>
<div class="wrap">
  <div class="left">
    <div class="mark">${WORDMARK}<span class="tick">_</span></div>
    <div class="sub">${sub}</div>
  </div>
  <div class="right">${right}</div>
</div>
<div class="pill">x402 + MCP &nbsp;·&nbsp; open source &nbsp;·&nbsp; verified in public</div>`;

const CARDS = [
  { file: "og-default.png", sub: "The spend-governance layer for AI agents.", right: GATE_SVG },
  { file: "og-playground.png", sub: "Try the live governance playground.", right: PLAYGROUND_SVG },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

for (const card of CARDS) {
  await p.setContent(page(card.sub, card.right));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${card.file}` });
  console.log(`wrote ${card.file}`);
}

await browser.close();
