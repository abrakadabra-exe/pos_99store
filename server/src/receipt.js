import { getSetting } from "./db.js";

const W = 42;
const PRINTER_DOTS = 576;

function padRight(text, width) {
  text = String(text);
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function padLeft(text, width) {
  text = String(text);
  return text.length >= width ? text.slice(-width) : " ".repeat(width - text.length) + text;
}

function padCenter(text, width) {
  text = String(text);
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text + " ".repeat(width - text.length - left);
}

const taka = (n) => `${Number(n).toFixed(2)} Tk`;

function localDateTime(utc) {
  const d = new Date(String(utc).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return String(utc);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function readLogo() {
  try {
    const raw = getSetting("logo");
    if (!raw) return null;
    const logo = JSON.parse(raw);
    if (
      logo &&
      Number.isInteger(logo.width) &&
      logo.width > 0 &&
      logo.width <= 384 &&
      Number.isInteger(logo.height) &&
      logo.height > 0 &&
      logo.height <= 400 &&
      Array.isArray(logo.bitmap)
    ) {
      return { width: logo.width, height: logo.height, bitmap: logo.bitmap };
    }
  } catch {
    /* corrupted logo -> treated as unset */
  }
  return null;
}

function itemLines(it) {
  const name = String(it.name);
  const first = name.slice(0, 24);
  const rest = name.slice(24);
  const lines = [
    {
      text: `${padRight(first, 24)}${padLeft(it.qty, 6)}${padLeft(taka(it.unit_price * it.qty), 12)}`,
    },
  ];
  let rem = rest;
  while (rem.length) {
    lines.push({ text: padRight(rem.slice(0, 40), W) });
    rem = rem.slice(40);
  }
  return lines;
}

export function buildReceipt({ sale, items, storeName }) {
  const lines = [];
  lines.push({ type: "logo" });
  lines.push({ align: "center", bold: true, text: padCenter(storeName || "99tk Store", W) });
  lines.push({ type: "blank" });
  lines.push({ text: `Invoice: ${sale.invoice_no}` });
  lines.push({ text: `Date: ${localDateTime(sale.created_at)}` });
  lines.push({ type: "divider" });
  lines.push({
    text: `${padRight("Item", 24)}${padLeft("Qty", 6)}${padLeft("Total", 12)}`,
  });
  for (const it of items) {
    lines.push(...itemLines(it));
  }
  lines.push({ type: "divider" });
  lines.push({ text: `${padRight("Subtotal", 30)}${padLeft(taka(sale.subtotal), 12)}` });
  lines.push({ align: "right", bold: true, text: padRight(`Total ${taka(sale.total)}`, W) });
  lines.push({ type: "divider" });
  const methodLabel = { cash: "Cash", bkash: "bKash", nagad: "Nagad" }[sale.payment_method] || sale.payment_method;
  lines.push({ text: `Payment: ${methodLabel}` });
  if (sale.payment_ref) lines.push({ text: `Ref: ${sale.payment_ref}` });
  if (sale.payment_method === "cash") {
    lines.push({ text: `Received: ${taka(sale.cash_received)}` });
    lines.push({ text: `Change: ${taka(sale.change_given)}` });
  }
  lines.push({ type: "divider" });
  lines.push({ align: "center", bold: true, text: padCenter("Thank you!", W) });
  lines.push({ align: "center", text: padCenter("Have a nice day", W) });
  return { logo: readLogo(), lines };
}

export function escposBytes(receipt) {
  const { logo, lines } = receipt;
  const chunks = [];
  chunks.push(Buffer.from([0x1b, 0x40]));
  if (logo && logo.width > 0 && logo.height > 0 && Array.isArray(logo.bitmap) && logo.bitmap.length) {
    const widthBytes = Math.ceil(logo.width / 8);
    const offset = Math.max(0, Math.floor((PRINTER_DOTS - logo.width) / 2));
    chunks.push(Buffer.from([0x1d, 0x4c, offset & 0xff, offset >> 8]));
    chunks.push(
      Buffer.from([
        0x1d, 0x76, 0x30, 0x00,
        widthBytes & 0xff, widthBytes >> 8,
        logo.height & 0xff, logo.height >> 8,
      ])
    );
    chunks.push(Buffer.from(logo.bitmap));
    chunks.push(Buffer.from([0x1d, 0x4c, 0x00, 0x00]));
    chunks.push(Buffer.from([0x1b, 0x64, 0x01]));
  }
  for (const line of lines) {
    if (line.type === "logo" || line.type === "blank") {
      chunks.push(Buffer.from([0x1b, 0x64, 0x01]));
      continue;
    }
    if (line.type === "divider") {
      chunks.push(Buffer.from("-".repeat(W) + "\n", "ascii"));
      continue;
    }
    const align = { left: 0, center: 1, right: 2 }[line.align] ?? 0;
    chunks.push(Buffer.from([0x1b, 0x61, align]));
    chunks.push(Buffer.from([0x1b, 0x45, line.bold ? 1 : 0]));
    chunks.push(Buffer.from([0x1d, 0x21, line.bold ? 0x01 : 0x00]));
    chunks.push(Buffer.from(line.text.slice(0, W) + "\n", "ascii"));
  }
  chunks.push(Buffer.from([0x1b, 0x64, 0x03]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x41]));
  return Buffer.concat(chunks);
}