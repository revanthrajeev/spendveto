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
//   --record      capture the film directly — no screen recorder, no
//                 countdown, no window to leave alone. Writes an mp4.
//   --no-seed     skip seeding (use whatever is already in the ledger)
//   --countdown=N seconds before the tour starts (default 8)
//   --cut=1min|2min|5min   which cut to drive (default 1min)
//
// Without --record this drives a visible Chrome window for you to screen-
// record, and stops when the terminal prints DONE. That path depends on the
// window surviving the whole take, which in practice it often doesn't — a
// click in the wrong place ends the run at whatever step it had reached. Use
// --record unless you specifically want your cursor in the footage.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { readdirSync, rmSync, statSync, existsSync } from "node:fs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "http://localhost:8403";
const APP = "http://localhost:8402";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const SEED = !process.argv.includes("--no-seed");
const RECORD = process.argv.includes("--record");
const NATIVE = process.argv.includes("--native");
// macOS menu-bar height in device pixels on a 2x display; cropped off the top
// so the film starts at the browser chrome, the way the original did.
const CROP_TOP = Number(arg("crop-top", 0));
const COUNTDOWN = Number(arg("countdown", 8));
const CUT = arg("cut", "1min");
const OUT = arg("out", `${ROOT}demo-out.mp4`);

// Retina capture. deviceScaleFactor is ignored by recordVideo (measured: a 2x
// context still yields a 1x video), so density has to come from the browser
// itself via --force-device-scale-factor. Layout stays at 1728 CSS px — a
// normal Mac window — while the compositor renders 3456x1944, which is what a
// Retina screen recording produces and why the original film looked sharp.
const LAYOUT = { width: 1728, height: 972 };
const CAPTURE = { width: 3456, height: 1944 };
// Delivered at 1080p: downscaling 2x supersampled frames beats capturing at
// 1080p directly, and keeps the file small enough to ship on the site.
const DELIVER = arg("deliver", "1920:1080");

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

  if (NATIVE) {
    // Native macOS capture. Playwright's recordVideo is a test-debugging
    // feature encoding VP8 at a capped bitrate — measured at ~890 kbps even
    // when capturing 3456x1944, against 1413 kbps for the original film. No
    // amount of resolution fixes a starved encoder, so this drives a real
    // visible Chrome window and lets `screencapture -v` record it: the same
    // engine behind Cmd+Shift+5, at the display's native 3456x2234 and
    // 120 fps. Nothing to click, so the window can't be closed mid-take.
    console.log("\nNative capture — a Chrome window will open. Do not touch it.\n");

    const browser = await chromium.launch({
      headless: false,
      slowMo: 60,
      channel: "chrome",
      // Pinned to a known position and size so the capture region can be
      // computed exactly. --kiosk does not survive Playwright's window
      // management (it yields a small windowed Chrome, and a full-screen
      // grab then catches the desktop behind it), so instead the window
      // stays ordinary and only its *content* rect is recorded — no tab
      // strip, no address bar, no menu bar, no dock, no wallpaper.
      args: ["--window-position=0,0", `--window-size=${LAYOUT.width},${LAYOUT.height + 120}`, "--hide-scrollbars", "--disable-infobars"],
    });
    const page = await browser.newPage({ viewport: null });
    await page.goto(`${SITE}/`);
    await sleep(1500);

    // Ask the page where it actually is. Browser chrome height varies with
    // Chrome version and bookmark-bar state, so measuring beats assuming.
    const rect = await page.evaluate(() => ({
      x: window.screenX,
      y: window.screenY + (window.outerHeight - window.innerHeight),
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    // screencapture -R takes points; on a 2x display it writes 2x pixels.
    const R = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`;
    console.log(`  capture region (points): ${R}  → ${rect.w * 2}x${rect.h * 2} px`);

    const raw = `${ROOT}.demo-native.mov`;
    // -V must expire on its own. screencapture DISCARDS the file if it is
    // signalled instead of reaching its own time limit, so the budget is set
    // generously and the surplus is trimmed off afterwards rather than the
    // process being killed early.
    const BUDGET = Number(arg("budget", 95));
    const cap = spawn("screencapture", ["-v", "-V", String(BUDGET), "-x", "-R", R, raw], { stdio: "ignore" });
    children.push(cap);
    const capStart = Date.now();
    const capDone = new Promise((r) => cap.on("close", r));
    await sleep(2000); // let the capture actually engage before the tour moves

    const tourStart = Date.now();
    await tour1min(page);
    const tourEnd = Date.now();
    const elapsed = ((tourEnd - tourStart) / 1000).toFixed(1);

    const left = Math.max(0, BUDGET * 1000 - (Date.now() - capStart));
    console.log(`\n  tour done in ${elapsed}s — letting the capture close itself (${(left / 1000).toFixed(0)}s of budget left)…`);
    await capDone;
    await sleep(1000);
    await browser.close();

    if (!existsSync(raw)) throw new Error("screencapture produced no file — check Screen Recording permission");

    // Trim to the tour itself, drop the menu bar, and downscale to 1920 wide
    // (aspect preserved — forcing 16:9 on a 3456x2234 display would stretch).
    const ss = ((tourStart - capStart) / 1000 - 0.4).toFixed(2);
    const dur = ((tourEnd - tourStart) / 1000 + 1.0).toFixed(2);
    console.log(`  encoding → ${OUT}`);
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-y",
        "-ss", ss, "-t", dur, "-i", raw,
        "-vf", CROP_TOP > 0
          ? `crop=in_w:in_h-${CROP_TOP}:0:${CROP_TOP},scale=1920:-2:flags=lanczos`
          : "scale=1920:-2:flags=lanczos",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], { stdio: "inherit" });
      ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`))));
    });
    rmSync(raw, { force: true });

    const mb = (statSync(OUT).size / 1e6).toFixed(1);
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  DONE — ${OUT}`);
    console.log(`  ${elapsed}s, page content only (${rect.w * 2}x${rect.h * 2} native) → 1920 wide, ${mb} MB, no audio.`);
    console.log(`${"─".repeat(56)}\n`);
    shutdown();
    return;
  }

  if (RECORD) {
    // Headless + Playwright's own capture. Nothing to leave alone, nothing to
    // time, and the take is identical every run — which is the whole point
    // after a manual take dies halfway through for the second time.
    console.log("\nRecording headlessly — no screen recorder needed.\n");
    const browser = await chromium.launch({
      headless: true,
      slowMo: 60,
      args: ["--force-device-scale-factor=2", "--hide-scrollbars"],
    });
    const ctx = await browser.newContext({
      viewport: LAYOUT,
      recordVideo: { dir: `${ROOT}.demo-video`, size: CAPTURE },
    });
    const page = await ctx.newPage();

    const started = Date.now();
    await tour1min(page);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    // The video is only flushed to disk when the context closes.
    await ctx.close();
    await browser.close();

    const dir = `${ROOT}.demo-video`;
    const webm = readdirSync(dir).filter((f) => f.endsWith(".webm")).map((f) => `${dir}/${f}`).pop();
    if (!webm) throw new Error("Playwright produced no video file");

    console.log(`\n  encoding → ${OUT}`);
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", webm,
        "-vf", `scale=${DELIVER}:flags=lanczos`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], { stdio: "inherit" });
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
    rmSync(dir, { recursive: true, force: true });

    const mb = (statSync(OUT).size / 1e6).toFixed(1);
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  DONE — ${OUT}`);
    console.log(`  ${elapsed}s, captured ${CAPTURE.width}×${CAPTURE.height} → delivered ${DELIVER.replace(":", "×")}, ${mb} MB, no audio track.`);
    console.log(`${"─".repeat(56)}\n`);
    shutdown();
    return;
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
