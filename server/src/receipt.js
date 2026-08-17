const W = 42;

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

export function buildReceipt({ sale, items, storeName }) {
  const lines = [];
  lines.push({ align: "center", bold: true, text: padCenter(storeName || "99tk Store", W) });
  lines.push({ type: "blank" });
  lines.push({ text: `Invoice: ${sale.invoice_no}` });
  lines.push({ text: `Date: ${sale.created_at}` });
  lines.push({ type: "divider" });
  lines.push({
    text: `${padRight("Item", 24)}${padLeft("Qty", 6)}${padLeft("Total", 12)}`,
  });
  for (const it of items) {
    lines.push({
      text: `${padRight(it.name, 24)}${padLeft(it.qty, 6)}${padLeft(taka(it.unit_price * it.qty), 12)}`,
    });
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
  return lines;
}

export function escposBytes(lines) {
  const chunks = [];
  chunks.push(Buffer.from([0x1b, 0x40]));
  for (const line of lines) {
    if (line.type === "blank") {
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
    chunks.push(Buffer.from([0x1d, 0x21, line.bold ? 0x11 : 0x00]));
    chunks.push(Buffer.from(line.text.slice(0, W) + "\n", "ascii"));
  }
  chunks.push(Buffer.from([0x1b, 0x64, 0x03]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x41]));
  return Buffer.concat(chunks);
}