// Lay a narration track over a demo cut recorded by scripts/demo-record.mjs.
//
//   node scripts/narrate.mjs [--in <mp4>] [--voice en_US-ryan-high]
//
// The recorder writes a <name>.marks.json beside the video listing exactly when
// each beat happened. Guessing those timings from the finished file does not
// work — scene detection sees nothing in a dark UI, and caption-luminance
// detection misses every caption that sits over a bright page. So this reads
// the marks instead, speaks one line per beat, and places each at its own
// timestamp.
//
// Speech is generated locally with Piper (neural TTS, no API key, no per-use
// cost). Each line is written to fit the gap before the next beat; anything
// that overruns is flagged rather than silently talking over the next scene.
//
// The result is normalised to -16 LUFS, matching the loudness of the original
// product film so the two sit at the same level side by side.

import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split("=")[1] : d;
};

const VIDEO = arg("in", "/Users/revanthrajeev/Desktop/spendveto-demo.mp4");
const VOICE = arg("voice", "en_US-ryan-high");
const PIPER = arg("piper", "/private/tmp/claude-501/-Users-revanthrajeev/0eca4a0d-b8c8-4e3b-a67f-39f18eceac8b/scratchpad/ttsenv/bin/piper");
const VOICES = arg("voices", "/private/tmp/claude-501/-Users-revanthrajeev/0eca4a0d-b8c8-4e3b-a67f-39f18eceac8b/scratchpad/voices");
const LUFS = Number(arg("lufs", -16));
const LENGTH = arg("length-scale", "0.92"); // <1 speaks faster

// One spoken line per mark. Deliberately NOT a re-read of the on-screen
// caption — a voice that recites the subtitle is worse than no voice. These
// say the thing the caption cannot fit, and each is written to the length of
// the gap it has to live in.
const LINES = [
  "Agents can pay for things now. This decides whether they should.",
  "Agents spending money you can't watch.",
  "Via CLI, SDK, or MCP.",
  "Enforced server side, not promised.",
  "Self hosting is free forever.",
  "Set a per call cap and an hourly budget.",
  "Then fire a runaway burst at it. Twelve rapid calls.",
  "Frozen mid loop. Nothing spends until a human unfreezes it.",
  "The console: ten surfaces over one governed ledger.",
  "Above the line, a human decides.",
  "Budgets cascade through every ancestor.",
  "Hash chained, so the record is tamper evident.",
  "The chain lives inside the signature itself.",
  "And counterparties earn reputation from governed history.",
  "Two hundred sixty seven assertions.",
  "Your agents can spend. Spend Veto decides.",
];

const run = (cmd, args, opts = {}) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"], ...opts });
    if (opts.stdin != null) { p.stdin.write(opts.stdin); p.stdin.end(); }
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
  });

const probe = (path, entries) =>
  new Promise((res) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "csv=p=0", path]);
    let out = ""; p.stdout.on("data", (d) => (out += d));
    p.on("close", () => res(out.trim()));
  });

const marksPath = VIDEO.replace(/\.mp4$/, "") + ".marks.json";
if (!existsSync(marksPath)) throw new Error(`no marks file at ${marksPath} — record with scripts/demo-record.mjs first`);
const { offset, marks } = JSON.parse(readFileSync(marksPath, "utf8"));
if (marks.length !== LINES.length) {
  console.warn(`  ! ${marks.length} marks but ${LINES.length} lines — using the shorter of the two`);
}

const videoDur = Number(await probe(VIDEO, "format=duration"));
const dir = `${ROOT}.narration`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

console.log(`\nNarrating ${VIDEO}  (${videoDur.toFixed(1)}s, voice ${VOICE})\n`);

const clips = [];
const n = Math.min(marks.length, LINES.length);
for (let i = 0; i < n; i++) {
  const at = marks[i].t + offset;
  const next = i + 1 < n ? marks[i + 1].t + offset : videoDur;
  const wav = `${dir}/line${String(i).padStart(2, "0")}.wav`;
  await run(PIPER, ["-m", VOICE, "--data-dir", VOICES, "--length-scale", LENGTH, "-f", wav], { stdin: LINES[i] });
  const len = Number(await probe(wav, "format=duration"));
  const gap = next - at;
  const over = len > gap;
  console.log(`  ${String(i).padStart(2)} ${at.toFixed(2)}s  spoken ${len.toFixed(2)}s / gap ${gap.toFixed(2)}s ${over ? "⚠ overruns" : ""}`);
  clips.push({ wav, at, len });
}

// Mix: every clip delayed to its own mark, summed, then loudness-normalised.
const inputs = [];
clips.forEach((c) => inputs.push("-i", c.wav));
const delays = clips.map((c, i) => `[${i}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`).join(";");
const mixIn = clips.map((_, i) => `[a${i}]`).join("");
const filter = `${delays};${mixIn}amix=inputs=${clips.length}:duration=longest:normalize=0[m];[m]loudnorm=I=${LUFS}:TP=-1.5:LRA=11,apad[out]`;

const track = `${dir}/narration.wav`;
await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", ...inputs,
  "-filter_complex", filter, "-map", "[out]", "-t", videoDur.toFixed(2), "-ar", "48000", "-ac", "2", track]);

const outTmp = `${dir}/narrated.mp4`;
await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", VIDEO, "-i", track,
  "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
  "-movflags", "+faststart", outTmp]);
renameSync(outTmp, VIDEO);
rmSync(dir, { recursive: true, force: true });

const [dur, size] = (await probe(VIDEO, "format=duration,size")).split(",");
console.log(`\n  DONE — ${VIDEO}`);
console.log(`  ${Number(dur).toFixed(1)}s, narration at ${LUFS} LUFS, ${(Number(size) / 1e6).toFixed(1)} MB\n`);
