import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../auth.js";
import { todayStr } from "./sales.js";

const router = Router();
router.use(requireAuth);

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateStrDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

router.get("/summary", (req, res, next) => {
  try {
    const from = dateStrDaysAgo(13);
    const today = todayStr();

    const base = db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE invoice_day = ?`
      )
      .get(today);
    const profitToday = db
      .prepare(
        `SELECT COALESCE(SUM((si.unit_price - si.cost_price) * si.qty), 0) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.invoice_day = ?`
      )
      .get(today).profit;

    const daysRaw = db
      .prepare(
        `SELECT invoice_day AS date, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE invoice_day >= ? GROUP BY invoice_day ORDER BY invoice_day`
      )
      .all(from);
    const dayMap = new Map(daysRaw.map((d) => [d.date, d]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = dateStrDaysAgo(i);
      const r = dayMap.get(d);
      days.push({ date: d, count: r?.count || 0, total: r?.total || 0 });
    }

    const categories = db
      .prepare(
        `SELECT COALESCE(c.name, 'Other') AS category,
                COUNT(*) AS items, COALESCE(SUM(si.qty), 0) AS qty, COALESCE(SUM(si.unit_price * si.qty), 0) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.invoice_day >= ?
         GROUP BY category ORDER BY total DESC`
      )
      .all(from);

    const topProducts = db
      .prepare(
        `SELECT si.name, COALESCE(SUM(si.qty), 0) AS qty, COALESCE(SUM(si.unit_price * si.qty), 0) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.invoice_day >= ?
         GROUP BY si.name ORDER BY qty DESC LIMIT 5`
      )
      .all(from);

    const todayItems = db
      .prepare(
        `SELECT COALESCE(SUM(qty), 0) AS qty FROM sale_items si
         JOIN sales s ON s.id = si.sale_id WHERE s.invoice_day = ?`
      )
      .get(today).qty;

    res.json({
      today: { date: today, count: base.count, total: base.total, profit: profitToday, items: todayItems },
      days,
      categories,
      topProducts,
    });
  } catch (e) {
    next(e);
  }
});

export default router;