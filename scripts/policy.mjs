// Policy packs: shareable governance presets.
//   npm run policy               # list available packs
//   npm run policy -- apply cautious|standard|production
// Applying a pack overwrites data/policy.json (the previous file is kept at
// data/policy.json.bak). Packs are plain JSON — teams can commit their own.
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKS_DIR = fileURLToPath(new URL("../data/policy-packs", import.meta.url));
const POLICY_PATH = fileURLToPath(new URL("../data/policy.json", import.meta.url));

const packs = readdirSync(PACKS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const body = JSON.parse(readFileSync(`${PACKS_DIR}/${f}`, "utf8"));
    return { name: f.replace(/\.json$/, ""), body };
  });

const [cmd, name] = process.argv.slice(2);

if (cmd === "apply") {
  const pack = packs.find((p) => p.name === name);
  if (!pack) {
    console.error(`Unknown pack "${name}". Available: ${packs.map((p) => p.name).join(", ")}`);
    process.exit(1);
  }
  if (existsSync(POLICY_PATH)) copyFileSync(POLICY_PATH, `${POLICY_PATH}.bak`);
  const { $description, ...policy } = pack.body;
  writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2) + "\n");
  console.log(`Applied policy pack "${pack.name}" — ${$description}`);
  console.log(`Previous policy saved to data/policy.json.bak`);
} else {
  console.log("Available policy packs:\n");
  for (const p of packs) {
    const { $description, ...rest } = p.body;
    console.log(`  ${p.name.padEnd(12)} ${$description}`);
    console.log(`  ${"".padEnd(12)} ${Object.entries(rest).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join("  ")}\n`);
  }
  console.log('Apply one:  npm run policy -- apply <name>');
}
