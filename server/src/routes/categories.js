import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../auth.js";
import { logWrite } from "../backup.js";

const router = Router();
router.use(requireAuth);

function validateName(name) {
  const s = String(name || "").trim();
  if (!s) return { error: "Category name is required" };
  if (s.length > 40) return { error: "Category name too long (max 40)" };
  return { name: s };
}

function listQuery() {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(p.id) AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`
    )
    .all();
}

router.get("/", (req, res) => {
  res.json({ categories: listQuery() });
});

router.post("/", (req, res, next) => {
  try {
    const { name, error } = validateName(req.body.name);
    if (error) return res.status(400).json({ error });
    const dup = db.prepare("SELECT id FROM categories WHERE name = ?").get(name);
    if (dup) return res.status(409).json({ error: `Category "${name}" already exists` });
    const info = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
    const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid);
    logWrite("category", "create", category.id, { category });
    res.status(201).json({ category: { id: category.id, name: category.name, product_count: 0 } });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", (req, res, next) => {
  try {
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Category not found" });
    const { name, error } = validateName(req.body.name);
    if (error) return res.status(400).json({ error });
    const dup = db.prepare("SELECT id FROM categories WHERE name = ? AND id != ?").get(name, existing.id);
    if (dup) return res.status(409).json({ error: `Category "${name}" already exists` });
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, existing.id);
    const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(existing.id);
    logWrite("category", "update", existing.id, { category });
    const count = db.prepare("SELECT COUNT(*) AS c FROM products WHERE category_id = ?").get(existing.id).c;
    res.json({ category: { id: category.id, name: category.name, product_count: count } });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", (req, res, next) => {
  try {
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Category not found" });
    const count = db.prepare("SELECT COUNT(*) AS c FROM products WHERE category_id = ?").get(existing.id).c;
    if (count > 0) {
      return res
        .status(409)
        .json({ error: `Category "${existing.name}" has ${count} product${count === 1 ? "" : "s"} — move or delete them first` });
    }
    db.prepare("DELETE FROM categories WHERE id = ?").run(existing.id);
    logWrite("category", "delete", existing.id, { category: existing });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;