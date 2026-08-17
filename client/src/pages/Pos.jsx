import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Receipt from "../components/Receipt.jsx";
import { taka } from "../format.js";

const METHOD = {
  cash: { label: "Cash", note: "Enter amount received" },
  bkash: { label: "bKash", note: "Optional transaction ID" },
  nagad: { label: "Nagad", note: "Optional transaction ID" },
};

export default function Pos() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState(null);
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const scanRef = useRef(null);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  useEffect(() => {
    scanRef.current?.focus();
  }, [done, cart.length === 0]);

  function addToCart(p, qty = 1) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product_id === p.id ? { ...l, qty: Math.min(l.qty + qty, p.stock) } : l
        );
      }
      return [...prev, { product_id: p.id, name: p.name_en, price: p.sale_price, qty, max: p.stock }];
    });
    setPicks(null);
    setQuery("");
  }

  async function onScan(text) {
    const q = text.trim();
    if (!q) return;
    setError("");
    try {
      const { products } = await api(`/products?q=${encodeURIComponent(q)}`);
      if (products.length === 1) {
        addToCart(products[0]);
      } else if (products.length === 0) {
        setError(`No product found for "${q}"`);
      } else {
        setPicks(products);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function simulateScan() {
    const { products } = await api("/products");
    if (products.length === 0) {
      setError("No products to scan yet — add some in Products first");
      return;
    }
    const p = products[Math.floor(Math.random() * products.length)];
    scanRef.current?.focus();
    setQuery(p.barcode || p.name_en);
    await new Promise((r) => setTimeout(r, 350));
    addToCart(p);
  }

  function setQty(product_id, qty) {
    setCart((prev) =>
      prev.map((l) =>
        l.product_id === product_id ? { ...l, qty: Math.max(0, Math.min(qty, l.max ?? 9999)) } : l
      )
    );
  }

  function checkout() {
    if (cart.length === 0) return;
    const change = method === "cash" ? Number(received || 0) - subtotal : 0;
    if (method === "cash" && change < 0) {
      setError("Received amount is less than the total");
      return;
    }
    setBusy(true);
    setError("");
    api("/sales", {
      method: "POST",
      body: {
        items: cart.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        payment_method: method,
        payment_ref: ref,
        cash_received: Number(received || 0),
      },
    })
      .then((r) => setDone(r))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  function newSale() {
    setDone(null);
    setCart([]);
    setReceived("");
    setRef("");
    setError("");
    setMethod("cash");
  }

  if (done) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-md text-center">
          <div className="text-3xl font-bold text-emerald-600">Sale complete</div>
          <div className="mt-1 text-sm text-slate-500">
            {done.sale.invoice_no} · {taka(done.sale.total)} ·{" "}
            {{ cash: "Cash", bkash: "bKash", nagad: "Nagad" }[done.sale.payment_method]}
          </div>
          <div className="mt-5">
            <Receipt receipt={done.receipt} />
          </div>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={newSale}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
            >
              New sale
            </button>
            <button
              onClick={() => navigate("/sales")}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              View today's sales
            </button>
          </div>
        </div>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Point of sale</h1>
          <p className="mt-1 text-sm text-slate-500">Scan a barcode or search by name</p>
        </div>
        <button
          onClick={simulateScan}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          title="Simulates the Winson scanner while no real hardware is attached"
        >
          Simulate scan
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <div className="relative">
            <input
              ref={scanRef}
              className={`${field} py-3 text-base`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onScan(query)}
              placeholder="Scan or type barcode / product name…"
            />
            {picks && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {picks.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">
                      {p.name_en}
                      {p.name_bn && <span className="ml-2 text-slate-400">{p.name_bn}</span>}
                    </span>
                    <span className="font-semibold text-slate-600">{taka(p.sale_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-white shadow-sm">
            {cart.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-slate-400">
                Cart is empty — scan or search a product to begin
              </div>
            )}
            {cart.map((l) => (
              <div key={l.product_id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-slate-800">{l.name}</div>
                  <div className="text-xs text-slate-500">
                    {taka(l.price)} each · stock {l.max}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(l.product_id, l.qty - 1)}
                    className="h-8 w-8 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={l.qty}
                    onChange={(e) => setQty(l.product_id, Number(e.target.value))}
                    className="w-14 rounded-lg border border-slate-300 py-1 text-center text-sm"
                  />
                  <button
                    onClick={() => setQty(l.product_id, l.qty + 1)}
                    className="h-8 w-8 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    +
                  </button>
                </div>
                <div className="w-24 text-right font-semibold text-slate-800">{taka(l.price * l.qty)}</div>
                <button
                  onClick={() => setCart((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                  className="text-slate-300 hover:text-red-500"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            {cart.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-500">Subtotal</span>
                <span className="text-lg font-bold text-slate-800">{taka(subtotal)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">Payment</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Object.entries(METHOD).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setMethod(key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    method === key
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">{METHOD[method].note}</p>
            {method === "cash" ? (
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600">Amount received (৳)</label>
                <input
                  className={`${field} mt-1 text-lg`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-slate-500">Change due</span>
                  <span className={`font-bold ${Number(received || 0) - subtotal < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {taka(Math.max(0, Number(received || 0) - subtotal))}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600">Transaction ID (optional)</label>
                <input
                  className={`${field} mt-1`}
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="e.g. 8F2K1L9M"
                />
              </div>
            )}
            <button
              onClick={checkout}
              disabled={busy || cart.length === 0}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? "Processing…" : `Charge ${taka(subtotal)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}