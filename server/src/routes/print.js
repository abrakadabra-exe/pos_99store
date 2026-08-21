import { Router } from "express";
import usb from "usb";
import { getSetting } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildReceipt, escposBytes } from "../receipt.js";
import { buildLabel, tsplBytes } from "../label.js";

const router = Router();
router.use(requireAuth);

const MAX_PRINT_BYTES = 128 * 1024;

const TEST_SALE = {
  invoice_no: "TEST-0001",
  created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  subtotal: 99,
  discount: 0,
  total: 99,
  payment_method: "cash",
  payment_ref: "",
  cash_received: 100,
  change_given: 1,
};

const TEST_ITEMS = [{ name: "Test Item", qty: 1, unit_price: 99, cost_price: 50 }];

const TEST_PRODUCT = { name_en: "Test Label", sale_price: 99, barcode: "6900000000007" };

router.get("/test", (req, res) => {
  const receipt = buildReceipt({ sale: TEST_SALE, items: TEST_ITEMS, storeName: getSetting("store_name") || "99tk Store" });
  const label = buildLabel({ product: TEST_PRODUCT, storeName: getSetting("store_name") || "99tk Store" });
  res.json({
    receipt: escposBytes(receipt).toString("base64"),
    label: tsplBytes(label, 1).toString("base64"),
  });
});

export function readPrinters() {
  const raw = getSetting("printers");
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    const clean = {};
    for (const kind of ["receipt", "label"]) {
      const c = p?.[kind];
      if (c && Number.isInteger(c.vendorId) && Number.isInteger(c.productId)) {
        clean[kind] = { vendorId: c.vendorId, productId: c.productId };
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function findPrinterDevice(kind) {
  const cfg = readPrinters()[kind];
  if (cfg) {
    const found = usb.findByIds(cfg.vendorId, cfg.productId);
    if (found) return found;
  }
  return usb.getDeviceList().find((d) => d.deviceDescriptor.bDeviceClass === 7);
}

router.post("/:kind", async (req, res, next) => {
  const kind = req.params.kind === "label" ? "label" : "receipt";
  const data = String(req.body.data || "");
  if (!data) return res.status(400).json({ error: "No data to print" });
  if (data.length > MAX_PRINT_BYTES) {
    return res.status(400).json({ error: "Print payload too large" });
  }
  const device = findPrinterDevice(kind);
  if (!device) {
    return res.status(503).json({
      error: `No USB ${kind} printer found on the server — attach one to this computer, or use WebUSB in Chrome/Edge instead`,
    });
  }
  try {
    device.open();
    const iface = device.interfaces[0];
    device.claimInterface(iface.id);
    const out = iface.endpoints.find((e) => e.direction === "out") || iface.endpoints[0];
    if (!out) {
      device.close();
      return res.status(503).json({ error: "Printer has no output endpoint" });
    }
    await new Promise((resolve, reject) =>
      out.transfer(Buffer.from(data, "base64"), (err) => (err ? reject(err) : resolve()))
    );
    try { device.releaseInterface(iface.id); } catch {}
    device.close();
    res.json({ ok: true });
  } catch (e) {
    try { device.close(); } catch {}
    next(e);
  }
});

export default router;