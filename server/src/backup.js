import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");
const MAX_FILE_BYTES = 5 * 1024 * 1024; // rotate at 5MB

fs.mkdirSync(BACKUP_DIR, { recursive: true });

let seq = 0;
let currentFile = null;

function dateStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function currentBackupFile() {
  const stamp = dateStamp();
  const base = path.join(BACKUP_DIR, `backup-${stamp}`);
  let file = `${base}.jsonl`;
  if (fs.existsSync(file) && fs.statSync(file).size >= MAX_FILE_BYTES) {
    let i = 2;
    while (fs.existsSync(`${base}-${i}.jsonl`)) i++;
    file = `${base}-${i}.jsonl`;
  }
  return file;
}

function rotateIfNeeded() {
  if (!currentFile) {
    currentFile = currentBackupFile();
    return;
  }
  const next = currentBackupFile();
  if (next !== currentFile) currentFile = next;
}

const localTarget = {
  name: "local",
  push(entry) {
    rotateIfNeeded();
    fs.appendFileSync(currentFile, JSON.stringify(entry) + "\n", "utf8");
  },
};

export const targets = [localTarget];

export function addTarget(target) {
  targets.push(target);
}

/**
 * Live backup: called after every successful database write.
 * The entry is streamed to all targets (local file by default;
 * cloud targets like Google Drive / Dropbox / S3 can be plugged in later).
 */
export function logWrite(entity, action, id, payload = {}) {
  seq += 1;
  const entry = {
    ts: new Date().toISOString(),
    seq,
    entity,
    action,
    id,
    payload,
  };
  for (const target of targets) {
    try {
      target.push(entry);
    } catch (err) {
      console.error(`[backup] target ${target.name} failed:`, err.message);
    }
  }
  db.prepare(
    "INSERT INTO backup_events (entity, action, payload) VALUES (?, ?, ?)"
  ).run(entity, action, JSON.stringify(payload));
}

export function backupInfo() {
  return {
    dir: BACKUP_DIR,
    targets: targets.map((t) => t.name),
    lastEvent: db
      .prepare("SELECT * FROM backup_events ORDER BY id DESC LIMIT 1")
      .get(),
    eventCount: db.prepare("SELECT COUNT(*) AS n FROM backup_events").get().n,
  };
}