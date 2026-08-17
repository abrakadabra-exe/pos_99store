import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../auth.js";
import { logWrite } from "../backup.js";

export const SAMPLE_CSV = `barcode,name_en,category,cost_price,sale_price,stock,low_stock_threshold
6933046200012,Shampoo Sachet 20ml,Personal Care,9.00,99.00,200,50
6933046200029,Toothbrush 2-pack,Personal Care,30.00,99.00,150,40
,Biscuit Khaja 100g,Snacks,40.00,99.00,300,60`;

export const REQUIRED_COLUMNS = [
  "barcode",
  "name_en",
  "category",
  "cost_price",
  "sale_price",
  "stock",
  "low_stock_threshold",
];

const router = Router();
router.use(requireAuth);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function ean13FromId(id) {
  let digits = `200${String(id).padStart(9, "0")}`.slice(-12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

function genBarcode() {
  const ts = Date.now().toString().slice(-10);
  const digits = `200${ts}`.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

function asNum(v, label, errors, rowNo) {
  const n = Number(String(v ?? "").trim());
  if (v === "" || v === null || v === undefined || !Number.isFinite(n)) {
    errors.push(`Row ${rowNo}: ${label} must be a number`);
    return null;
  }
  return n;
}

router.get("/sample-csv", (req, res) => {
  res.type("text/csv").send(SAMPLE_CSV);
});

router.get("/", (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const low = req.query.low === "1";
    const params = [];
    let where = "";
    if (q) {
      where = "WHERE p.name_en LIKE ? OR p.barcode LIKE ? OR p.category LIKE ?";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (low) {
      where += where ? " AND p.stock <= p.low_stock_threshold" : "WHERE p.stock <= p.low_stock_threshold";
    }
    const rows = db
      .prepare(
        `SELECT p.*, (p.stock <= p.low_stock_threshold) AS low_stock FROM products p ${where} ORDER BY p.name_en COLLATE NOCASE`
      )
      .all(...params);
    res.json({ products: rows, lowCount: db.prepare("SELECT COUNT(*) c FROM products WHERE stock <= low_stock_threshold").get().c });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", (req, res, next) => {
  try {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!p) return res.status(404).json({ error: "Product not found" });
    const moves = db
      .prepare("SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 50")
      .all(req.params.id);
    res.json({ product: p, moves });
  } catch (e) {
    next(e);
  }
});

function parseProductBody(body, { partial = false } = {}) {
  const errors = [];
  const p = {};
  const num = (key, min = 0) => {
    if (body[key] === undefined || body[key] === null || body[key] === "") return undefined;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min) {
      errors.push(`${key} must be a number >= ${min}`);
      return undefined;
    }
    return n;
  };
  const str = (key, max = 200) => {
    if (body[key] === undefined || body[key] === null) return undefined;
    const s = String(body[key]).trim();
    if (s.length > max) {
      errors.push(`${key} too long (max ${max})`);
      return undefined;
    }
    return s;
  };
  if (partial) {
    const fields = ["barcode", "name_en", "name_bn", "category", "cost_price", "sale_price", "low_stock_threshold"];
    for (const f of fields) {
      const v = f.endsWith("_price") || f === "low_stock_threshold" ? num(f) : str(f);
      if (v !== undefined) p[f] = v;
    }
  } else {
    const name = str("name_en", 200);
    if (!name) errors.push("name_en is required");
    else p.name_en = name;
    p.name_bn = str("name_bn", 200) || "";
    p.category = str("category", 100) || "";
    p.cost_price = num("cost_price") ?? 0;
    p.sale_price = num("sale_price") ?? 0;
    p.low_stock_threshold = num("low_stock_threshold") ?? 0;
    const barcode = str("barcode", 32);
    if (barcode !== undefined && barcode !== "") p.barcode = barcode;
  }
  return { p, errors };
}

router.post("/", (req, res, next) => {
  try {
    const { p, errors } = parseProductBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const initialStock = Number(req.body.stock || 0);
    if (!Number.isFinite(initialStock) || initialStock < 0)
      return res.status(400).json({ error: "stock must be a number >= 0" });

    const create = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (barcode, name_en, name_bn, category, cost_price, sale_price, stock, low_stock_threshold)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          p.barcode || null,
          p.name_en,
          p.name_bn,
          p.category,
          p.cost_price,
          p.sale_price,
          initialStock,
          p.low_stock_threshold
        );
      const id = info.lastInsertRowid;
      if (!p.barcode) {
        const barcode = ean13FromId(id);
        db.prepare("UPDATE products SET barcode = ? WHERE id = ?").run(barcode, id);
        p.barcode = barcode;
      }
      if (initialStock > 0) {
        db.prepare(
          "INSERT INTO stock_moves (product_id, qty, type, ref, note, user_id) VALUES (?, ?, 'opening', ?, 'Initial stock', ?)"
        ).run(id, initialStock, `product:${id}`, req.user.id);
      }
      return id;
    });
    const id = create();
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    logWrite("product", "create", id, { product });
    res.status(201).json({ product });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Barcode already exists" });
    next(e);
  }
});

router.patch("/:id", (req, res, next) => {
  try {
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Product not found" });
    const { p, errors } = parseProductBody(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    if (Object.keys(p).length === 0) return res.status(400).json({ error: "Nothing to update" });
    if (p.barcode !== undefined) {
      const dup = db.prepare("SELECT id FROM products WHERE barcode = ? AND id != ?").get(p.barcode, existing.id);
      if (dup) return res.status(409).json({ error: "Barcode already exists" });
    }
    const sets = Object.keys(p)
      .map((k) => `${k} = ?`)
      .join(", ");
    db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
      ...Object.values(p),
      existing.id
    );
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id);
    logWrite("product", "update", existing.id, { product });
    res.json({ product });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Barcode already exists" });
    next(e);
  }
});

router.post("/:id/stock-in", (req, res, next) => {
  try {
    const qty = Number(req.body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "qty must be a number > 0" });
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Product not found" });
    const note = String(req.body.note || "").trim().slice(0, 200);
    const run = db.transaction(() => {
      db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(
        qty,
        existing.id
      );
      db.prepare(
        "INSERT INTO stock_moves (product_id, qty, type, ref, note, user_id) VALUES (?, ?, 'purchase', ?, ?, ?)"
      ).run(existing.id, qty, `purchase:${Date.now()}`, note || "Stock in", req.user.id);
    });
    run();
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id);
    logWrite("product", "stock_in", existing.id, { qty, product });
    res.json({ product });
  } catch (e) {
    next(e);
  }
});

router.post("/import", (req, res, next) => {
  try {
    const text = String(req.body.csv || "").replace(/^\uFEFF/, "");
    if (!text.trim()) return res.status(400).json({ error: "Empty CSV" });
    const rows = parseCsv(text);
    if (rows.length < 2) return res.status(400).json({ error: "CSV needs a header row and at least one data row" });

    const header = rows[0].map((h) => h.trim());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    const extra = header.filter((c) => !REQUIRED_COLUMNS.includes(c));
    if (missing.length || extra.length) {
      return res.status(400).json({
        error: `Invalid columns. Missing: ${missing.join(", ") || "none"}. Unexpected: ${extra.join(", ") || "none"}. Required: ${REQUIRED_COLUMNS.join(", ")}`,
      });
    }
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));

    const errors = [];
    const parsed = rows.slice(1).map((r, i) => {
      const rowNo = i + 2;
      const get = (col) => (r[idx[col]] ?? "").toString().trim();
      const name = get("name_en");
      const sale = asNum(get("sale_price"), "sale_price", errors, rowNo);
      const cost = asNum(get("cost_price"), "cost_price", errors, rowNo);
      const stock = asNum(get("stock"), "stock", errors, rowNo);
      const threshold = asNum(get("low_stock_threshold"), "low_stock_threshold", errors, rowNo);
      const cat = get("category");
      const barcode = get("barcode");
      if (!name) errors.push(`Row ${rowNo}: name_en is required`);
      if (cat.length > 100) errors.push(`Row ${rowNo}: category too long`);
      if (barcode.length > 32) errors.push(`Row ${rowNo}: barcode too long`);
      return { rowNo, barcode, name, cat, cost, sale, stock, threshold };
    });

    if (errors.length) {
      return res.status(400).json({ error: `Import rejected (${errors.length} problem${errors.length > 1 ? "s" : ""}): ${errors.slice(0, 10).join("; ")}` });
    }

    const byBarcode = db.prepare("SELECT id FROM products WHERE barcode = ?");
    const run = db.transaction(() => {
      let created = 0;
      let updated = 0;
      for (const row of parsed) {
        const existing = row.barcode ? byBarcode.get(row.barcode) : null;
        if (existing) {
          db.prepare(
            `UPDATE products SET name_en = ?, category = ?, cost_price = ?, sale_price = ?, low_stock_threshold = ?, stock = stock + ?, updated_at = datetime('now') WHERE id = ?`
          ).run(row.name, row.cat, row.cost, row.sale, row.threshold, row.stock, existing.id);
          if (row.stock > 0) {
            db.prepare(
              "INSERT INTO stock_moves (product_id, qty, type, ref, note, user_id) VALUES (?, ?, 'purchase', ?, 'CSV import', ?)"
            ).run(existing.id, row.stock, `import:${Date.now()}`, req.user.id);
          }
          updated++;
        } else {
          const info = db
            .prepare(
              `INSERT INTO products (barcode, name_en, category, cost_price, sale_price, stock, low_stock_threshold)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(row.barcode || null, row.name, row.cat, row.cost, row.sale, row.stock, row.threshold);
          const id = info.lastInsertRowid;
          if (!row.barcode) {
            db.prepare("UPDATE products SET barcode = ? WHERE id = ?").run(ean13FromId(id), id);
          }
          if (row.stock > 0) {
            db.prepare(
              "INSERT INTO stock_moves (product_id, qty, type, ref, note, user_id) VALUES (?, ?, 'opening', ?, 'CSV import', ?)"
            ).run(id, row.stock, `import:${Date.now()}`, req.user.id);
          }
          created++;
        }
      }
      return { created, updated };
    });
    const counts = run();
    logWrite("product", "import", null, { counts, rows: parsed.length });
    res.json({ imported: parsed.length, created: counts.created, updated: counts.updated });
  } catch (e) {
    next(e);
  }
});

export default router;