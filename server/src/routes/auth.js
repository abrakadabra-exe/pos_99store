import { Router } from "express";
import db, { getSetting, setSetting } from "../db.js";
import {
  hashPin,
  verifyPin,
  isValidPin,
  generateRecoveryCode,
  signToken,
  requireAuth,
} from "../auth.js";

const router = Router();

export function isSetupDone() {
  return getSetting("admin_recovery_hash") !== null;
}

router.get("/setup/status", (req, res) => {
  res.json({ setupDone: isSetupDone() });
});

router.post("/setup", (req, res) => {
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

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!user || !verifyPin(pin, user.pin_hash)) {
    return res.status(401).json({ error: "Invalid username or PIN" });
  }
  if (!user.active) {
    return res.status(403).json({ error: "Account is deactivated" });
  }

  const token = signToken({ userId: user.id, username: user.username, role: user.role });
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, username, name, role, active, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "User no longer exists" });
  res.json({ user });
});

router.post("/recover", (req, res) => {
  const username = String(req.body.username || "").trim();
  const recoveryCode = String(req.body.recoveryCode || "").trim();
  const newPin = String(req.body.newPin || "");

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND role = 'admin'").get(username);
  const storedHash = getSetting("admin_recovery_hash");
  if (!user || !storedHash || !verifyPin(recoveryCode, storedHash)) {
    return res.status(401).json({ error: "Invalid username or recovery code" });
  }
  if (!isValidPin(newPin)) {
    return res.status(400).json({ error: "PIN must be 4-8 digits" });
  }

  const newRecoveryCode = generateRecoveryCode();
  const run = db.transaction(() => {
    db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(newPin), user.id);
    setSetting("admin_recovery_hash", hashPin(newRecoveryCode));
  });
  run();

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