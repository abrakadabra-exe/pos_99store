import { Router } from "express";
import db from "../db.js";
import { hashPin, isValidPin, requireAuth, requireAdmin } from "../auth.js";
import { logWrite } from "../backup.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const users = db
    .prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id")
    .all();
  res.json({ users });
});

router.post("/", (req, res) => {
  const username = String(req.body.username || "").trim();
  const name = String(req.body.name || "").trim();
  const role = req.body.role === "admin" ? "admin" : "staff";
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
  const exists = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (exists) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const info = db
    .prepare("INSERT INTO users (username, pin_hash, role, name) VALUES (?, ?, ?, ?)")
    .run(username, hashPin(pin), role, name || username);
  const user = db
    .prepare("SELECT id, username, name, role, active, created_at FROM users WHERE id = ?")
    .get(info.lastInsertRowid);
  logWrite("users", "create", user.id, { username, role });
  res.status(201).json({ user });
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (id === req.user.id && req.body.active === 0) {
    return res.status(400).json({ error: "You cannot deactivate your own account" });
  }
  if (target.role === "admin" && req.body.role && req.body.role !== "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot demote the last active admin" });
    }
  }

  const fields = [];
  const values = [];
  if (req.body.role !== undefined) {
    fields.push("role = ?");
    values.push(req.body.role === "admin" ? "admin" : "staff");
  }
  if (req.body.active !== undefined) {
    fields.push("active = ?");
    values.push(req.body.active ? 1 : 0);
  }
  if (req.body.name !== undefined) {
    fields.push("name = ?");
    values.push(String(req.body.name).trim());
  }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  const user = db
    .prepare("SELECT id, username, name, role, active, created_at FROM users WHERE id = ?")
    .get(id);
  logWrite("users", "update", id, user);
  res.json({ user });
});

router.post("/:id/reset-pin", (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "User not found" });
  const pin = String(req.body.pin || "");
  if (!isValidPin(pin)) {
    return res.status(400).json({ error: "PIN must be 4-8 digits" });
  }
  db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(pin), id);
  logWrite("users", "reset-pin", id, { username: target.username });
  res.json({ message: "PIN reset" });
});

export default router;