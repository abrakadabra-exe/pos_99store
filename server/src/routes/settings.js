import { Router } from "express";
import { getSetting, setSetting } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { logWrite } from "../backup.js";
import { readLogo } from "../receipt.js";
import { readPrinters } from "./print.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  res.json({
    store_name: getSetting("store_name") || "99tk Store",
    logo: readLogo(),
    printers: readPrinters(),
  });
});

router.put("/", (req, res, next) => {
  try {
    const storeName = String(req.body.store_name ?? getSetting("store_name") ?? "99tk Store").trim().slice(0, 60);
    if (!storeName) return res.status(400).json({ error: "Store name cannot be empty" });
    setSetting("store_name", storeName);

    if (req.body.logo === null || req.body.logo === undefined) {
      setSetting("logo", "");
      logWrite("settings", "update", null, { store_name: storeName, logo: "removed" });
      return res.json({ store_name: storeName, logo: null });
    }

    const logo = req.body.logo;
    if (
      !logo ||
      !Number.isInteger(logo.width) ||
      logo.width < 1 ||
      logo.width > 384 ||
      !Number.isInteger(logo.height) ||
      logo.height < 1 ||
      logo.height > 400 ||
      !Array.isArray(logo.bitmap) ||
      logo.bitmap.some((b) => !Number.isInteger(b) || b < 0 || b > 255)
    ) {
      return res.status(400).json({ error: "Invalid logo bitmap" });
    }
    const expected = Math.ceil(logo.height / 8) * logo.width;
    if (logo.bitmap.length !== expected) {
      return res.status(400).json({ error: `Logo bitmap must have ${expected} bytes` });
    }
    setSetting("logo", JSON.stringify({ width: logo.width, height: logo.height, bitmap: logo.bitmap }));
    logWrite("settings", "update", null, { store_name: storeName, logo: { width: logo.width, height: logo.height } });
    res.json({ store_name: storeName, logo: { width: logo.width, height: logo.height, bitmap: logo.bitmap } });
  } catch (e) {
    next(e);
  }
});

router.put("/printers", (req, res, next) => {
  try {
    const p = req.body.printers;
    if (!p || typeof p !== "object") return res.status(400).json({ error: "printers must be an object" });
    const clean = {};
    for (const kind of ["receipt", "label"]) {
      const c = p[kind];
      if (c === null || c === undefined) continue;
      if (
        !Number.isInteger(c.vendorId) || c.vendorId < 1 || c.vendorId > 65535 ||
        !Number.isInteger(c.productId) || c.productId < 1 || c.productId > 65535
      ) {
        return res.status(400).json({ error: `Invalid USB ids for ${kind}` });
      }
      clean[kind] = { vendorId: c.vendorId, productId: c.productId };
    }
    setSetting("printers", JSON.stringify(clean));
    logWrite("settings", "update", null, { printers: clean });
    res.json({ printers: clean });
  } catch (e) {
    next(e);
  }
});

export default router;
