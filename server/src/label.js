const DOTS_W = 320;
const DOTS_H = 240;
const NAME_MAX_CHARS = 24;

const taka = (n) => `${Number(n).toFixed(2)} Tk`;

export function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function wrapName(name) {
  const text = String(name).trim() || "Product";
  if (text.length <= NAME_MAX_CHARS) return [text];
  if (text.length <= 2 * NAME_MAX_CHARS) {
    return [text.slice(0, NAME_MAX_CHARS).trimEnd(), text.slice(NAME_MAX_CHARS).trimStart()];
  }
  const clipped = text.slice(0, 2 * NAME_MAX_CHARS - 3).trimEnd() + "...";
  return [clipped.slice(0, NAME_MAX_CHARS).trimEnd(), clipped.slice(NAME_MAX_CHARS).trimStart()].filter(Boolean);
}

function barcodeSpec(barcode) {
  const b = String(barcode || "").trim();
  if (/^\d{12}$/.test(b)) return { type: "EAN13", data: b + ean13CheckDigit(b) };
  if (/^\d{13}$/.test(b)) return { type: "EAN13", data: b };
  if (b) return { type: "128", data: b };
  return null;
}

export function buildLabel({ product, storeName }) {
  const elements = [];
  const name = String(product.name_en || "Product").trim();

  if (storeName) {
    elements.push({ t: "text", x: 12, y: 6, font: "TSS16.BF", multX: 1, multY: 1, text: String(storeName).slice(0, 36) });
  }

  const lines = wrapName(name);
  lines.forEach((line, i) => {
    elements.push({ t: "text", x: 12, y: 38 + i * 28, font: "TSS24.BF", multX: 1, multY: 1, text: line });
  });

  const priceText = taka(product.sale_price);
  const priceWidth = priceText.length * 12 * 2;
  elements.push({
    t: "text",
    x: Math.max(0, Math.floor((DOTS_W - priceWidth) / 2)),
    y: 116,
    font: "TSS24.BF",
    multX: 2,
    multY: 2,
    text: priceText,
  });

  const spec = barcodeSpec(product.barcode);
  if (spec) {
    elements.push({ t: "barcode", x: 40, y: 172, type: spec.type, height: 40, hri: true, data: spec.data });
  } else {
    elements.push({ t: "text", x: 12, y: 180, font: "TSS16.BF", multX: 1, multY: 1, text: "NO BARCODE" });
  }

  return { dotsW: DOTS_W, dotsH: DOTS_H, elements };
}

export function tsplBytes(label, copies) {
  const cmds = [
    "SIZE 40 mm,30 mm",
    "GAP 2 mm,0 mm",
    "DENSITY 8",
    "DIRECTION 1",
    "CLS",
  ];
  for (const el of label.elements) {
    if (el.t === "text") {
      cmds.push(`TEXT ${el.x},${el.y},"${el.font}",0,${el.multX},${el.multY},"${el.text.replace(/"/g, "'")}"`);
    } else if (el.t === "barcode") {
      cmds.push(`BARCODE ${el.x},${el.y},"${el.type}",${el.height},${el.hri ? 1 : 0},0,2,2,"${el.data}"`);
    }
  }
  const n = Math.min(99, Math.max(1, Math.floor(Number(copies) || 1)));
  cmds.push(`PRINT ${n},1`);
  return Buffer.from(cmds.join("\n") + "\n", "ascii");
}