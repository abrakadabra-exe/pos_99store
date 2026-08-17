import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const taka = (n) => "৳" + Number(n).toFixed(2);

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const btn =
  "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";

function ProductForm({ initial, onDone, onError }) {
  const [f, setF] = useState({
    barcode: initial?.barcode || "",
    name_en: initial?.name_en || "",
    name_bn: initial?.name_bn || "",
    category: initial?.category || "",
    cost_price: initial?.cost_price ?? "",
    sale_price: initial?.sale_price ?? "",
    low_stock_threshold: initial?.low_stock_threshold ?? "",
    stock: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f };
      if (initial) delete body.stock;
      const data = await api(initial ? `/products/${initial.id}` : "/products", {
        method: initial ? "PATCH" : "POST",
        body,
      });
      onDone(data.product);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Barcode (leave empty to auto-generate)</label>
          <input className={field} value={f.barcode} onChange={set("barcode")} placeholder="e.g. 6933046200012" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Category</label>
          <input className={field} value={f.category} onChange={set("category")} placeholder="e.g. Snacks" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600">Name (English)</label>
          <input className={field} value={f.name_en} onChange={set("name_en")} placeholder="e.g. Biscuit Khaja 100g" required />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600">Name (Bangla, optional)</label>
          <input className={field} value={f.name_bn} onChange={set("name_bn")} placeholder="বিস্কুট খাজা" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Cost price (৳)</label>
          <input className={field} type="number" min="0" step="0.01" value={f.cost_price} onChange={set("cost_price")} required />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Sale price (৳)</label>
          <input className={field} type="number" min="0" step="0.01" value={f.sale_price} onChange={set("sale_price")} required />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Low-stock alert at (pieces)</label>
          <input className={field} type="number" min="0" step="0.01" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">{initial ? "Current stock" : "Initial stock (optional)"}</label>
          <input
            className={`${field} ${initial ? "bg-slate-100" : ""}`}
            type="number"
            min="0"
            step="0.01"
            value={initial ? initial.stock : f.stock}
            onChange={initial ? undefined : set("stock")}
            disabled={!!initial}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}

function StockInForm({ product, onDone, onError }) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api(`/products/${product.id}/stock-in`, { method: "POST", body: { qty, note } });
      onDone(data.product);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600">
        <span className="font-medium">{product.name_en}</span> · current stock:{" "}
        <span className="font-bold">{product.stock}</span>
      </p>
      <div>
        <label className="text-xs font-medium text-slate-600">Quantity to add</label>
        <input className={field} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Note (optional)</label>
        <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier restock" />
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? "Adding…" : "Add stock"}
        </button>
      </div>
    </form>
  );
}

function History({ product }) {
  const [moves, setMoves] = useState(null);
  useEffect(() => {
    api(`/products/${product.id}`).then((d) => setMoves(d.moves)).catch(() => setMoves([]));
  }, [product.id]);

  return (
    <div className="text-sm">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-2">When</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {!moves && <tr><td colSpan="4" className="py-3 text-slate-400">Loading…</td></tr>}
          {moves?.length === 0 && <tr><td colSpan="4" className="py-3 text-slate-400">No stock movements yet</td></tr>}
          {moves?.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-500">{m.created_at}</td>
              <td className="py-2">{m.type}</td>
              <td className="py-2 font-medium">+{m.qty}</td>
              <td className="py-2 text-slate-500">{m.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportCsv({ onDone, onError }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await api("/products/import", { method: "POST", body: { csv: await file.text() } });
      onDone(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
        <div className="text-xs font-bold text-slate-700 mb-2">CSV format — your file must have exactly these columns:</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-emerald-700">
              {["barcode", "name_en", "category", "cost_price", "sale_price", "stock", "low_stock_threshold"].map((c) => (
                <th key={c} className="px-1 py-1 border border-emerald-200 bg-emerald-50 font-mono">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {["6933046200012", "Shampoo Sachet 20ml", "Personal Care", "9", "99", "200", "50"].map((c, i) => (
                <td key={i} className="px-1 py-1 border border-slate-200 text-slate-600">{c}</td>
              ))}
            </tr>
            <tr>
              {["", "Biscuit Khaja 100g", "Snacks", "40", "99", "300", "60"].map((c, i) => (
                <td key={i} className="px-1 py-1 border border-slate-200 text-slate-600">{c || "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          <li>• Empty <span className="font-mono">barcode</span> → a barcode is auto-generated.</li>
          <li>• Existing barcode → row updates that product; its <span className="font-mono">stock</span> column is <b>added</b> to current stock.</li>
          <li>• New barcode → product created with that opening stock.</li>
          <li>• Wrong columns or any invalid row → the whole file is rejected.</li>
        </ul>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" required className="text-sm" />
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? "Importing…" : "Import file"}
        </button>
      </div>
    </form>
  );
}

export default function Products() {
  const [products, setProducts] = useState(null);
  const [lowCount, setLowCount] = useState(0);
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [stocking, setStocking] = useState(null);
  const [history, setHistory] = useState(null);
  const [msg, setMsg] = useState(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("low") === "1") setOnlyLow(true);
  }, [searchParams]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (onlyLow) params.set("low", "1");
    api(`/products?${params}`)
      .then((d) => {
        setProducts(d.products);
        setLowCount(d.lowCount);
      })
      .catch((err) => setMsg({ kind: "error", text: err.message }));
  }, [q, onlyLow]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const notify = (kind, text) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            {products === null ? "Loading…" : `${products.length} shown · ${lowCount} low stock`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal("import")} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Import CSV
          </button>
          <button onClick={() => setModal("add")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            + Add product
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mt-4 rounded-lg px-4 py-2 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <input
          className={`${field} max-w-xs`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, barcode, category…"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="accent-emerald-600" />
          Low stock only
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Sale</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products === null && (
              <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {products?.length === 0 && (
              <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-400">No products found</td></tr>
            )}
            {products?.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.barcode}</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {p.name_en}
                  {p.name_bn && <span className="ml-2 text-slate-400">{p.name_bn}</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.category}</td>
                <td className="px-4 py-3 text-right text-slate-600">{taka(p.cost_price)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{taka(p.sale_price)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{p.stock}</td>
                <td className="px-4 py-3">
                  {p.low_stock ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">LOW</span>
                  ) : (
                    <span className="text-xs text-slate-400">ok</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => { setStocking(p); }} className="text-emerald-700 hover:underline text-xs font-medium">+ Stock</button>
                  <span className="mx-1.5 text-slate-300">|</span>
                  <button onClick={() => { setEditing(p); }} className="text-slate-600 hover:underline text-xs">Edit</button>
                  <span className="mx-1.5 text-slate-300">|</span>
                  <button onClick={() => { setHistory(p); }} className="text-slate-600 hover:underline text-xs">History</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "add" && (
        <Modal title="Add product" onClose={() => setModal(null)}>
          <ProductForm
            onDone={(p) => { setModal(null); notify("success", `"${p.name_en}" created — barcode ${p.barcode}`); load(); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="Import products from CSV" onClose={() => setModal(null)}>
          <ImportCsv
            onDone={(r) => { setModal(null); notify("success", `Imported ${r.imported} rows (${r.created} created, ${r.updated} updated)`); load(); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit ${editing.name_en}`} onClose={() => setEditing(null)}>
          <ProductForm
            initial={editing}
            onDone={() => { setEditing(null); notify("success", "Product updated"); load(); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
      {stocking && (
        <Modal title="Add stock" onClose={() => setStocking(null)}>
          <StockInForm
            product={stocking}
            onDone={(p) => { setStocking(null); notify("success", `Stock added — now ${p.stock}`); load(); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
      {history && (
        <Modal title={`Stock history — ${history.name_en}`} onClose={() => setHistory(null)}>
          <History product={history} />
        </Modal>
      )}
    </div>
  );
}