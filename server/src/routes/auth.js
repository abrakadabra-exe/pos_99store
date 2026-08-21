import { Router } from "express";
import db, { getSetting, setSetting } from "../db.js";
import { rateLimiter } from "../rateLimit.js";
import {
  hashPin,
  verifyPin,
  isValidPin,
  generateRecoveryCode,
  createSession,
  revokeSession,
  rotateSecret,
  requireAuth,
  requireAdmin,
} from "../auth.js";

const router = Router();

export function isSetupDone() {
  return getSetting("admin_recovery_hash") !== null;
}

const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const loginIpLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const recoverLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 3 });
const recoverIpLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const setupLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

function tooMany(res, limiterStatus) {
  res.set("Retry-After", String(Math.ceil(limiterStatus.retryAfterMs / 1000)));
  return res.status(429).json({ error: "Too many failed attempts. Try again later." });
}

router.get("/setup/status", (req, res) => {
  res.json({ setupDone: isSetupDone() });
});

router.post("/setup", (req, res) => {
  const ipKey = `${req.ip}:setup`;
  const ipStatus = setupLimiter.check(ipKey);
  if (!ipStatus.allowed) return tooMany(res, ipStatus);
  setupLimiter.fail(ipKey);

  if (isSetupDone()) {
    return res.status(400).json({ error: "Setup already done" });
  }
  const username = String(req.body.username || "").trim();
  const name = String(req.body.name || "").trim();
  const pin = String(req.body.pin || "");

  if (!username || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: "Username must be 3-30 characters" });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: "Username may contain only letters, numbers, dots, dashes, underscores" });
  }
  if (!isValidPin(pin)) {
    return res.status(400).json({ error: "PIN must be 4-8 digits" });
  }

  const recoveryCode = generateRecoveryCode();
  const storeName = String(req.body.store_name || "").trim().slice(0, 60);
  const run = db.transaction(() => {
    db.prepare("INSERT INTO users (username, pin_hash, role, name) VALUES (?, ?, 'admin', ?)").run(
      username,
      hashPin(pin),
      name || username
    );
    setSetting("admin_recovery_hash", hashPin(recoveryCode));
    setSetting("setup_done_at", new Date().toISOString());
    if (storeName) setSetting("store_name", storeName);
  });
  run();

  res.status(201).json({
    message: "Admin created",
    recoveryCode,
    warning:
      "Store this recovery code somewhere safe (offline). It is the only way to regain admin access if the admin PIN is lost.",
  });
});

router.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const pin = String(req.body.pin || "");
  const userKey = `${req.ip}:${username.toLowerCase()}`;
  const ipKey = `${req.ip}:global`;

  const userStatus = loginLimiter.check(userKey);
  const ipStatus = loginIpLimiter.check(ipKey);
  if (!userStatus.allowed) return tooMany(res, userStatus);
  if (!ipStatus.allowed) return tooMany(res, ipStatus);

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!user || !verifyPin(pin, user.pin_hash)) {
    loginLimiter.fail(userKey);
    loginIpLimiter.fail(ipKey);
    return res.status(401).json({ error: "Invalid username or PIN" });
  }
  if (!user.active) {
    loginLimiter.fail(userKey);
    loginIpLimiter.fail(ipKey);
    return res.status(403).json({ error: "Account is deactivated" });
  }

  loginLimiter.reset(userKey);
  loginIpLimiter.reset(ipKey);

  const token = createSession(user.id, { userId: user.id, username: user.username, role: user.role });
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  });
});

router.post("/logout", requireAuth, (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  revokeSession(token);
  res.json({ ok: true });
});

router.post("/rotate-secret", requireAuth, requireAdmin, (req, res, next) => {
  try {
    rotateSecret();
    res.json({
      message: "Session secret rotated. All sessions have been revoked — everyone must log in again.",
    });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, username, name, role, active, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user });
});

router.post("/recover", (req, res) => {
  const username = String(req.body.username || "").trim();
  const recoveryCode = String(req.body.recoveryCode || "").trim();
  const newPin = String(req.body.newPin || "");
  const userKey = `${req.ip}:${username.toLowerCase()}`;
  const ipKey = `${req.ip}:global`;

  const userStatus = recoverLimiter.check(userKey);
  const ipStatus = recoverIpLimiter.check(ipKey);
  if (!userStatus.allowed) return tooMany(res, userStatus);
  if (!ipStatus.allowed) return tooMany(res, ipStatus);

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND role = 'admin'").get(username);
  const storedHash = getSetting("admin_recovery_hash");
  if (!user || !storedHash || !verifyPin(recoveryCode, storedHash)) {
    recoverLimiter.fail(userKey);
    recoverIpLimiter.fail(ipKey);
    return res.status(401).json({ error: "Invalid username or recovery code" });
  }
  if (!isValidPin(newPin)) {
    recoverLimiter.fail(userKey);
    recoverIpLimiter.fail(ipKey);
    return res.status(400).json({ error: "PIN must be 4-8 digits" });
  }

  const newRecoveryCode = generateRecoveryCode();
  const run = db.transaction(() => {
    db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(newPin), user.id);
    setSetting("admin_recovery_hash", hashPin(newRecoveryCode));
    db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(user.id);
  });
  run();
  recoverLimiter.reset(userKey);
  recoverIpLimiter.reset(ipKey);

  res.json({
    message: "Admin PIN reset",
    recoveryCode: newRecoveryCode,
    warning: "Store this new recovery code somewhere safe. The previous code no longer works.",
  });
});

router.post("/change-pin", requireAuth, (req, res) => {
  const oldPin = String(req.body.oldPin || "");
  const newPin = String(req.body.newPin || "");

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!verifyPin(oldPin, user.pin_hash)) {
    return res.status(401).json({ error: "Current PIN is incorrect" });
  }
  if (!isValidPin(newPin)) {
    return res.status(400).json({ error: "PIN must be 4-8 digits" });
  }
  db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(newPin), user.id);
  res.json({ message: "PIN changed" });
});

export default router;