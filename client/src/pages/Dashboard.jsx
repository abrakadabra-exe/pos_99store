import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const taka = (n) => "৳" + Number(n).toFixed(2);

export default function Dashboard() {
  const [lowCount, setLowCount] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api("/products?low=1").then((d) => setLowCount(d.lowCount)).catch(() => {});
    api("/sales/today/summary").then(setSummary).catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        {summary ? `Today (${summary.date}): ${summary.count} sale${summary.count === 1 ? "" : "s"}` : "Loading today's numbers…"}
      </p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Today's sales</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">
            {summary === null ? "…" : taka(summary.total)}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Profit today</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">
            {summary === null ? "…" : taka(summary.profit)}
          </div>
        </div>
        <Link to="/products?low=1" className="rounded-xl bg-white p-5 shadow-sm hover:shadow-md block">
          <div className="text-sm text-slate-500">Low stock products</div>
          <div className={`mt-2 text-2xl font-bold ${lowCount && lowCount > 0 ? "text-red-600" : "text-slate-800"}`}>
            {lowCount === null ? "…" : lowCount}
          </div>
        </Link>
      </div>
      {summary?.byMethod?.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summary.byMethod.map((m) => (
            <div key={m.payment_method} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">
                {{ cash: "Cash", bkash: "bKash", nagad: "Nagad" }[m.payment_method] || m.payment_method}
              </div>
              <div className="mt-2 text-xl font-bold text-slate-800">
                {taka(m.total)}
                <span className="ml-2 text-xs font-normal text-slate-400">{m.count} sale{m.count === 1 ? "" : "s"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}