import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// API-key auth for the admin surface (issue #10). The management API — rewrite
// policy, unfreeze wallets, mint delegations, register tools — was previously
// wide open to anyone who could reach the port. It now sits behind bearer keys
// with roles, using the same "open until configured" pattern the proxy already
// uses for agent identities: with ZERO keys the server is in open mode
// (zero-setup demos and the verify suite keep working), and the moment the
// first key exists (or SPENDVETO_REQUIRE_AUTH=1), every admin-surface endpoint
// requires `Authorization: Bearer <key>` with a sufficient role. Mint the first
// key from the trusted host with `npm run apikey` — it can't be minted over the
// API, by design (no privilege bootstrap from an unauthenticated request).

const KEYS_PATH = fileURLToPath(new URL("../data/api-keys.json", import.meta.url));

// viewer < approver < admin. A key satisfies an endpoint if its role ranks at
// or above the endpoint's minimum.
const ROLE_RANK = { viewer: 1, approver: 2, admin: 3 };
export const ROLES = Object.keys(ROLE_RANK);

export function readKeys() {
  if (!existsSync(KEYS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(KEYS_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function authEnabled() {
  return readKeys().length > 0 || process.env.SPENDVETO_REQUIRE_AUTH === "1";
}

export function createKey({ role = "admin", label = "" } = {}) {
  if (!ROLE_RANK[role]) throw new Error(`role must be one of: ${ROLES.join(", ")}`);
  const keys = readKeys();
  const record = {
    id: randomUUID(),
    key: `tgk_${randomBytes(24).toString("hex")}`,
    role,
    label: String(label).slice(0, 80),
    createdAt: new Date().toISOString(),
  };
  keys.push(record);
  mkdirSync(dirname(KEYS_PATH), { recursive: true });
  writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  return record; // full key returned once, like every API-key flow
}

// Express middleware factory. requireAuth("admin") on an endpoint means: in
// open mode, pass through; otherwise require a valid key ranked >= admin.
export function requireAuth(minRole = "admin") {
  const need = ROLE_RANK[minRole] || ROLE_RANK.admin;
  return (req, res, next) => {
    if (!authEnabled()) return next(); // open mode — no keys configured
    const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const key = readKeys().find((k) => k.key === token);
    if (!key) {
      return res.status(401).json({ error: "this endpoint requires an API key — send Authorization: Bearer <key> (mint one on the host with `npm run apikey`)" });
    }
    if ((ROLE_RANK[key.role] || 0) < need) {
      return res.status(403).json({ error: `this endpoint requires the "${minRole}" role or higher; this key is "${key.role}"` });
    }
    req.apiKey = { id: key.id, role: key.role, label: key.label };
    next();
  };
}
