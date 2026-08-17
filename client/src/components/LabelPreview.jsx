import { useEffect, useRef } from "react";

const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function ean13Pattern(data) {
  const digits = String(data).split("").map(Number);
  const parity = PARITY[digits[0]];
  const left = digits.slice(1, 7).map((d, i) => (parity[i] === "L" ? L[d] : G[d])).join("");
  const right = digits.slice(7).map((d) => R[d]).join("");
  return { pattern: `101${left}01010${right}101`, guard: 0 };
}

function drawEan13(ctx, data, x, y, height, narrow) {
  const { pattern } = ean13Pattern(data);
  let px = x;
  for (const bit of pattern) {
    if (bit === "1") ctx.fillRect(px, y, narrow, height);
    px += narrow;
  }
}

function seededBars(ctx, seed, x, y, width, height) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  let px = x;
  let i = 0;
  while (px < x + width) {
    h = (h * 1103515245 + 12345) >>> 0;
    const bar = 2 + (h % 3);
    if (i % 2 === 0) ctx.fillRect(px, y, bar, height);
    px += bar + 1;
    i++;
  }
}

function renderLabel(canvas, label) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const el of label.elements) {
    if (el.t === "text") {
      const size = (el.font.includes("24") ? 24 : 16) * el.multY;
      ctx.fillStyle = "#000000";
      ctx.font = `${size}px monospace`;
      ctx.fillText(el.text, el.x, el.y + size - 3);
    } else if (el.t === "barcode") {
      if (el.type === "EAN13" && /^\d{13}$/.test(el.data)) {
        drawEan13(ctx, el.data, el.x, el.y, el.height, 2);
      } else {
        seededBars(ctx, el.data, el.x, el.y, 240, el.height);
      }
      if (el.hri) {
        ctx.font = "16px monospace";
        ctx.fillText(el.data, el.x, el.y + el.height + 16);
      }
    }
  }
}

export default function LabelPreview({ label, className = "mx-auto" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !label) return;
    canvas.width = label.dotsW;
    canvas.height = label.dotsH;
    renderLabel(canvas, label);
  }, [label]);

  if (!label) return null;
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: "100%", maxWidth: "420px", border: "1px solid #cbd5e1", imageRendering: "pixelated" }}
      aria-label="Label preview"
    />
  );
}