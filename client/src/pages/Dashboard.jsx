import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function Dashboard() {
  const [lowCount, setLowCount] = useState(null);

  useEffect(() => {
    api("/products?low=1")
      .then((d) => setLowCount(d.lowCount))
      .catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Milestone 2: inventory is live. Sales, receipts, labels, and reports arrive in the next builds.
      </p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Today's sales</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">—</div>
        </div>
        <Link to="/products?low=1" className="rounded-xl bg-white p-5 shadow-sm hover:shadow-md block">
          <div className="text-sm text-slate-500">Low stock products</div>
          <div className={`mt-2 text-2xl font-bold ${lowCount && lowCount > 0 ? "text-red-600" : "text-slate-800"}`}>
            {lowCount === null ? "…" : lowCount}
          </div>
        </Link>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Profit today</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">—</div>
        </div>
      </div>
    </div>
  );
}