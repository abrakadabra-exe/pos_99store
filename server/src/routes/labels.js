import { Router } from "express";
import db, { getSetting } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildLabel, tsplBytes } from "../label.js";

const router = Router();
router.use(requireAuth);

router.post("/", (req, res, next) => {
  try {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.body.product_id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const label = buildLabel({ product, storeName: getSetting("store_name") || "99tk Store" });
    const copies = Number(req.body.copies) || 1;
    res.json({ label, tspl: tsplBytes(label, copies).toString("base64") });
  } catch (e) {
    next(e);
  }
});

export default router;