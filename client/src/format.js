export const taka = (n) => "৳" + Number(n).toFixed(2);

export function parseUtc(value) {
  const d = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function localTime(value) {
  const d = parseUtc(value);
  if (!d) return String(value);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function localDateTime(value) {
  const d = parseUtc(value);
  if (!d) return String(value);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
