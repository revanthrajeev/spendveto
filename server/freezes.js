import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { sendAlert } from "./alerts.js";

// The kill switch. A freeze stops a wallet from spending — checked by the
// client's own policy engine on every call AND by the simulate payment gate
// as defense in depth. Durable like delegations: a frozen runaway agent must
// stay frozen across a server restart.
const PATH = fileURLToPath(new URL("../data/freezes.json", import.meta.url));

function read() {
  if (!existsSync(PATH)) return [];
  try {
    return JSON.parse(readFileSync(PATH, "utf8"));
  } catch {
    return [];
  }
}

function save(list) {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(list, null, 2));
}

export function listFreezes() {
  return read();
}

export function findActiveFreeze(address) {
  const key = address.toLowerCase();
  return read().find((f) => !f.unfrozen && f.address.toLowerCase() === key) || null;
}

export function createFreeze({ address, reason, source }) {
  const existing = findActiveFreeze(address);
  if (existing) return existing;
  const list = read();
  const record = {
    id: randomUUID(),
    address,
    reason: reason || "manually frozen from the dashboard",
    source: source === "anomaly" ? "anomaly" : "manual",
    createdAt: new Date().toISOString(),
    unfrozen: false,
  };
  list.push(record);
  save(list);
  sendAlert("freeze", { address: record.address, source: record.source, reason: record.reason });
  return record;
}

export function unfreeze(id) {
  const list = read();
  const record = list.find((f) => f.id === id);
  if (!record || record.unfrozen) return null;
  record.unfrozen = true;
  record.unfrozenAt = new Date().toISOString();
  save(list);
  return record;
}
