import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db.js";

const SECRET_FILE = path.join(DATA_DIR, "session-secret");

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET.trim();
  try {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

let SECRET = loadSecret();

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = String(stored).split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const derived = crypto.scryptSync(pin, Buffer.from(saltB64, "base64url"), 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const expected = Buffer.from(hashB64, "base64url");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function isValidPin(pin) {
  return /^\d{4,8}$/.test(String(pin));
}

export function generateRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = crypto.randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) code += alphabet[bytes[i] % alphabet.length];
  return code.match(/.{1,4}/g).join("-");
}

function base64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function buildToken(payload, jti) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({ ...payload, jti, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })
  );
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function tokenJti(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).jti || null;
  } catch {
    return null;
  }
}

function cleanupSessions() {
  db.prepare(
    `DELETE FROM sessions
     WHERE expires_at < datetime('now')
        OR (revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days'))`
  ).run();
}

export function createSession(userId, payload) {
  const jti = crypto.randomUUID();
  const token = buildToken(payload, jti);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  db.prepare("INSERT INTO sessions (user_id, token_id, expires_at) VALUES (?, ?, ?)").run(
    userId,
    jti,
    expiresAt
  );
  cleanupSessions();
  return token;
}

export function revokeSession(token) {
  const jti = tokenJti(token);
  if (!jti) return false;
  return (
    db
      .prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_id = ? AND revoked_at IS NULL")
      .run(jti).changes > 0
  );
}

function sessionValid(jti) {
  const row = db.prepare("SELECT expires_at, revoked_at FROM sessions WHERE token_id = ?").get(jti);
  if (!row) return null;
  if (row.revoked_at) return false;
  if (Date.parse(String(row.expires_at).replace(" ", "T") + "Z") < Date.now()) return false;
  return true;
}

export function signToken(payload) {
  return buildToken(payload, crypto.randomUUID());
}

export function verifyToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  const sigBuf = Buffer.from(sig, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload || !payload.userId || !payload.jti) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (sessionValid(payload.jti) !== true) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = db
    .prepare("SELECT id, username, role, active FROM users WHERE id = ?")
    .get(payload.userId);
  if (!user || !user.active) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

export function rotateSecret() {
  if (process.env.JWT_SECRET) {
    const err = new Error("Session secret is set via the JWT_SECRET environment variable — rotate it there instead");
    err.status = 400;
    throw err;
  }
  const secret = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  SECRET = secret;
  db.prepare("DELETE FROM sessions").run();
}
