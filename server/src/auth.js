import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function loadSecret() {
  const secretFile = path.join(DATA_DIR, "session-secret");
  try {
    return fs.readFileSync(secretFile, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadSecret();

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

export function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })
  );
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
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
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: payload.userId, username: payload.username, role: payload.role };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}