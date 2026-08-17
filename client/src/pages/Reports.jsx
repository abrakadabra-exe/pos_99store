import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { taka } from "../format.js";

function BarChart({ data }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = 220;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const max = Math.max(...data.map((d) => d.total), 1);
    const padB = 22;
    const padT = 12;
    const plotH = cssH - padB - padT;
    const n = data.length;
    const slot = cssW / n;
    const barW = Math.min(26, slot * 0.55);
    const niceMax = Math.ceil(max / 500) * 500 || 500;

    ctx.font = "10px sans-serif";
    for (let g = 0; g <= 4; g++) {
      const y = padT + plotH - (plotH * g) / 4;
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText(taka(Math.round((niceMax * g) / 4)), 2, y - 3);
    }

    data.forEach((d, i) => {
      const h = (d.total / niceMax) * plotH;
      const x = i * slot + (slot - barW) / 2;
      const y = padT + plotH - h;
      ctx.fillStyle = d.total > 0 ? "#059669" : "#f1f5f9";
      ctx.fillRect(x, y, barW, h);
      const label = d.date.slice(8);
      ctx.fillStyle = i % 2 === 0 ? "#64748b" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(label, i * slot + slot / 2, cssH - 8);
    });
  }, [data]);

  return <canvas ref={ref} className="h-[220px] w-full" aria-label="Sales per day chart" />;
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/reports/summary")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const total14 = data?.days.reduce((s, d) => s + d.total, 0) || 0;
  const maxCat = Math.max(...(data?.categories.map((c) => c.total) || [1]), 1);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">Last 14 days of the store</p>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Today's sales</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{data ? taka(data.today.total) : "—"}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Today's invoices</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{data ? data.today.count : "—"}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Items sold today</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{data ? data.today.items : "—"}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">14-day total</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{data ? taka(total14) : "—"}</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Sales per day</h2>
        {data ? <BarChart data={data.days} /> : <div className="h-[220px] text-sm text-slate-400">Loading…</div>}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">By category</h2>
          {!data && <div className="mt-3 text-sm text-slate-400">Loading…</div>}
          {data?.categories.length === 0 && <div className="mt-3 text-sm text-slate-400">No sales in the last 14 days</div>}
          <div className="mt-4 space-y-3">
            {data?.categories.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{c.category}</span>
                  <span className="text-slate-500">
                    {taka(c.total)} · {c.qty} items
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Top products</h2>
          {!data && <div className="mt-3 text-sm text-slate-400">Loading…</div>}
          {data?.topProducts.length === 0 && <div className="mt-3 text-sm text-slate-400">No sales in the last 14 days</div>}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data?.topProducts.map((p, i) => (
                <tr key={p.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-700">
                    <span className="mr-2 text-xs text-slate-400">{i + 1}</span>
                    {p.name}
                  </td>
                  <td className="py-2 text-slate-500">{p.qty}</td>
                  <td className="py-2 text-right font-medium text-slate-800">{taka(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}