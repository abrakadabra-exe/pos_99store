import { useEffect, useState } from "react";
import { api } from "../api.js";
import Receipt from "../components/Receipt.jsx";

const taka = (n) => "৳" + Number(n).toFixed(2);

export default function Sales() {
  const [sales, setSales] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () => {
    api("/sales")
      .then((d) => setSales(d.sales))
      .catch(() => {});
  };

  useEffect(load, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Today's sales</h1>
      <p className="mt-1 text-sm text-slate-500">Click a sale to reopen its receipt</p>

      <div className="mt-5 rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Cashier</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {!sales && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {sales?.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-400">No sales yet today</td></tr>
            )}
            {sales?.map((s) => (
              <tr
                key={s.id}
                onClick={() => api(`/sales/${s.id}`).then(setDetail).catch(() => {})}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-3 font-semibold text-slate-800">{s.invoice_no}</td>
                <td className="px-4 py-3 text-slate-600">{s.created_at.slice(11, 16)}</td>
                <td className="px-4 py-3 text-slate-600">{s.items_count}</td>
                <td className="px-4 py-3 text-slate-600">
                  {{ cash: "Cash", bkash: "bKash", nagad: "Nagad" }[s.payment_method] || s.payment_method}
                </td>
                <td className="px-4 py-3 text-slate-500">{s.payment_ref || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{s.user_name || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{taka(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div
            className="rounded-xl bg-slate-100 p-5 shadow-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-slate-700">{detail.sale.invoice_no} — receipt copy</div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
                ×
              </button>
            </div>
            <Receipt lines={detail.receipt} />
          </div>
        </div>
      )}
    </div>
  );
}