// Mint an admin-surface API key from the trusted host. The first key flips the
// server from open mode to auth-required, so every admin endpoint (policy,
// freezes, delegations, shadow, catalog, top-ups) then needs a bearer key.
//
//   npm run apikey                       # an admin key
//   npm run apikey -- approver "on-call" # an approver key, labelled
//   npm run apikey -- viewer "dashboard" # a read-scoped key
//
// The key is printed ONCE — store it now; it can't be recovered later.
import { createKey, ROLES, readKeys } from "../server/auth.js";

const args = process.argv.slice(2);
const role = args[0] && ROLES.includes(args[0]) ? args[0] : "admin";
const label = (ROLES.includes(args[0]) ? args[1] : args[0]) || "";

if (args[0] && !ROLES.includes(args[0]) && args.length && !label) {
  // first arg wasn't a role and there's no second arg — treat it as the label
}

try {
  const before = readKeys().length;
  const record = createKey({ role, label });
  console.log(`\nMinted a "${record.role}" API key${record.label ? ` ("${record.label}")` : ""}:\n`);
  console.log(`  ${record.key}\n`);
  console.log("Send it as:  Authorization: Bearer <key>");
  if (before === 0) {
    console.log("\nThis is the FIRST key — the server is now in auth-required mode.");
    console.log("Every admin-surface endpoint now needs a bearer key. Restart the server if it's running.");
  }
  console.log("");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
