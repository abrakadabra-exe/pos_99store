import { Router } from "express";
import db, { getSetting } from "../db.js";
import { requireAuth } from "../auth.js";
import { logWrite } from "../backup.js";
import { buildReceipt, escposBytes } from "../receipt.js";

const router = Router();
router.use(requireAuth);

function pad(n) {
  return String(n).padStart(2, "0");
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function storeName() {
  return getSetting("store_name") || "99tk Store";
}

router.post("/", (req, res, next) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Cart is empty" });
    const method = req.body.payment_method;
    if (!["cash", "bkash", "nagad"].includes(method))
      return res.status(400).json({ error: "payment_method must be cash, bkash or nagad" });
    const ref = String(req.body.payment_ref || "").trim().slice(0, 40);
    const cashReceived = Number(req.body.cash_received || 0);
    if (!Number.isFinite(cashReceived) || cashReceived < 0)
      return res.status(400).json({ error: "cash_received must be a number >= 0" });

    const productStmt = db.prepare("SELECT * FROM products WHERE id = ?");
    const parsed = [];
    for (const it of items) {
      const qty = Number(it.qty);
      if (!Number.isInteger(qty) || qty <= 0)
        return res.status(400).json({ error: `Invalid quantity for item ${it.product_id}` });
      const p = productStmt.get(it.product_id);
      if (!p) return res.status(404).json({ error: `Product ${it.product_id} not found` });
      if (p.stock < qty)
        return res.status(400).json({
          error: `Not enough stock for "${p.name_en}" (stock ${p.stock}, asked ${qty})`,
        });
      parsed.push({ p, qty });
    }

    const subtotal = parsed.reduce((s, { p, qty }) => s + p.sale_price * qty, 0);
    const total = subtotal;
    if (method === "cash" && cashReceived < total)
      return res.status(400).json({ error: "Cash received is less than the total" });
    const change = method === "cash" ? Number((cashReceived - total).toFixed(2)) : 0;
    const day = todayStr();

    const createSale = db.transaction(() => {
      const last = db
        .prepare("SELECT invoice_no FROM sales WHERE invoice_day = ? ORDER BY id DESC LIMIT 1")
        .get(day);
      const nextNum = last ? parseInt(last.invoice_no.replace(/\D/g, ""), 10) + 1 : 1;
      const invoiceNo = `R-${String(nextNum).padStart(4, "0")}`;

      const info = db
        .prepare(
          `INSERT INTO sales (invoice_day, invoice_no, subtotal, discount, total, payment_method, payment_ref, cash_received, change_given, user_id)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
        )
        .run(day, invoiceNo, subtotal, total, method, ref, cashReceived, change, req.user.id);
      const saleId = info.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, unit_price, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const decStock = db.prepare(
        "UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?"
      );
      const insertMove = db.prepare(
        "INSERT INTO stock_moves (product_id, qty, type, ref, note, user_id) VALUES (?, ?, 'sale', ?, ?, ?)"
      );
      for (const { p, qty } of parsed) {
        insertItem.run(saleId, p.id, p.name_en, p.barcode || "", qty, p.sale_price, p.cost_price);
        decStock.run(qty, p.id);
        insertMove.run(p.id, -qty, invoiceNo, `Sale ${invoiceNo}`, req.user.id);
      }
      return { saleId, invoiceNo };
    });

    const { saleId, invoiceNo } = createSale();
    const sale = db
      .prepare("SELECT * FROM sales WHERE id = ?")
      .get(saleId);
    const saleItems = db
      .prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id")
      .all(saleId);
    const receipt = buildReceipt({ sale, items: saleItems, storeName: storeName() });
    logWrite("sale", "create", saleId, { sale, items: saleItems });
    res.status(201).json({ sale, items: saleItems, receipt, escpos: escposBytes(receipt).toString("base64") });
  } catch (e) {
    next(e);
  }
});

router.get("/", (req, res, next) => {
  try {
    const day = req.query.date || todayStr();
    const rows = db
      .prepare(
        `SELECT s.*, u.name AS user_name,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.invoice_day = ? ORDER BY s.id DESC`
      )
      .all(day);
    res.json({ date: day, sales: rows });
  } catch (e) {
    next(e);
  }
});

router.get("/today/summary", (req, res, next) => {
  try {
    const day = todayStr();
    const base = db.prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
       FROM sales WHERE invoice_day = ?`
    ).get(day);
    const byMethod = db
      .prepare(
        `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE invoice_day = ? GROUP BY payment_method`
      )
      .all(day);
    const profit = db
      .prepare(
        `SELECT COALESCE(SUM((si.unit_price - si.cost_price) * si.qty), 0) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.invoice_day = ?`
      )
      .get(day).profit;
    res.json({ date: day, count: base.count, total: base.total, profit, byMethod });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", (req, res, next) => {
  try {
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id").all(sale.id);
    res.json({ sale, items, receipt: buildReceipt({ sale, items, storeName: storeName() }) });
  } catch (e) {
    next(e);
  }
});

export default router;