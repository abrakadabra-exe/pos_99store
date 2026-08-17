import { useEffect, useState } from "react";
import { api } from "../api.js";
import LabelPreview from "./LabelPreview.jsx";
import { getConnection, sendToPrinter } from "../printer.js";

export default function LabelModal({ product, onClose }) {
  const [data, setData] = useState(null);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [printed, setPrinted] = useState(false);
  const [printNote, setPrintNote] = useState("");

  useEffect(() => {
    api("/labels", { method: "POST", body: { product_id: product.id, copies: 1 } })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [product.id]);

  async function simulate() {
    setBusy(true);
    setError("");
    try {
      const d = await api("/labels", { method: "POST", body: { product_id: product.id, copies } });
      setData(d);
      setPrinted(true);
      setPrintNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    setBusy(true);
    setError("");
    setPrintNote("");
    try {
      const d = await api("/labels", { method: "POST", body: { product_id: product.id, copies } });
      setData(d);
      const conn = getConnection("label");
      if (conn) {
        await sendToPrinter("label", d.tspl);
        setPrintNote(`sent to GP-3120TUD — ${copies} label${copies === 1 ? "" : "s"}`);
      } else {
        setPrinted(true);
        setPrintNote("No printer connected — showing what the GP-3120TUD would receive (simulated)");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tsplText = data ? atob(data.tspl) : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Print label — {product.name_en}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-bold text-slate-700 mb-2">Label preview (40 × 30 mm)</div>
          <LabelPreview label={data?.label} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600">Copies</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCopies((c) => Math.max(1, c - 1))}
              className="h-8 w-8 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              max="99"
              value={copies}
              onChange={(e) => setCopies(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
              className="w-14 rounded-lg border border-slate-300 py-1 text-center text-sm"
            />
            <button
              onClick={() => setCopies((c) => Math.min(99, c + 1))}
              className="h-8 w-8 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={simulate}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Shows the exact TSPL commands the printer would receive"
            >
              {busy ? "…" : "Simulate"}
            </button>
            <button
              onClick={print}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Prints via WebUSB, or falls back to simulation"
            >
              {busy ? "Printing…" : "Print"}
            </button>
          </div>
        </div>

        {printNote && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50">
            {printNote}
          </div>
        )}

        {(printed || printNote) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-900 p-3">
            <div className="text-xs font-bold text-emerald-400">TSPL for GP-3120TUD:</div>
            <pre className="mt-2 overflow-x-auto text-[11px] leading-snug text-slate-300">{tsplText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}