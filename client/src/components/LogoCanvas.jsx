import { useEffect, useRef } from "react";

export default function LogoCanvas({ logo, width = "280px", className = "mx-auto" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !logo) return;
    const widthBytes = Math.ceil(logo.width / 8);
    canvas.width = logo.width;
    canvas.height = logo.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(logo.width, logo.height);
    for (let y = 0; y < logo.height; y++) {
      for (let x = 0; x < logo.width; x++) {
        const byte = logo.bitmap[y * widthBytes + Math.floor(x / 8)];
        const black = ((byte ?? 0) >> (7 - (x % 8))) & 1;
        const i = (y * logo.width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = black ? 0 : 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [logo]);

  if (!logo) return null;
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, imageRendering: "pixelated" }}
      aria-label="Store logo"
    />
  );
}