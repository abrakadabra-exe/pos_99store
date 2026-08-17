import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import LogoCanvas from "../components/LogoCanvas.jsx";
import { connectPrinter, disconnectPrinter, sendToPrinter, usePrinter } from "../printer.js";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

const MAX_W = 336;
const MAX_H = 120;

function imageToBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const widthBytes = Math.ceil(w / 8);
        const bitmap = Array.from({ length: h * widthBytes }, () => 0);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const alpha = data[i + 3] / 255;
            const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
            const black = alpha === 0 ? 0 : lum < 0.5 ? 1 : 0;
            if (black) bitmap[y * widthBytes + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
          }
        }
        resolve({ width: w, height: h, bitmap });
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

function PrinterRow({ kind, title, detail, webUsbSupported }) {
  const conn = usePrinter(kind);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      await connectPrinter(kind);
      setMsg({ kind: "success", text: `${title} connected` });
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api("/print/test");
      await sendToPrinter(kind, kind === "receipt" ? t.receipt : t.label);
      setMsg({ kind: "success", text: "Test page sent to the printer" });
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{detail}</div>
          <div className="mt-1 text-xs">
            {conn ? (
              <span className="font-medium text-emerald-700">Connected — {conn.name}</span>
            ) : (
              <span className="text-slate-400">Not connected</span>
            )}
          </div>
          {msg && (
            <div className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
              {msg.text}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {conn ? (
            <>
              <button
                onClick={test}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? "Printing…" : "Test print"}
              </button>
              <button
                onClick={() => disconnectPrinter(kind)}
                disabled={busy}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={busy || !webUsbSupported}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              title={webUsbSupported ? "Opens the browser device picker" : "WebUSB needs Chrome or Edge"}
            >
              {busy ? "Connecting…" : "Connect via WebUSB"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerUsbRow() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function test(kind) {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api("/print/test");
      const data = kind === "receipt" ? t.receipt : t.label;
      await api(`/print/${kind}`, { method: "POST", body: { data } });
      setMsg({ kind: "success", text: `${kind === "receipt" ? "Receipt" : "Label"} printed via server USB` });
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="font-semibold text-slate-800">Server USB printing (driver fallback)</div>
      <p className="mt-1 text-xs text-slate-500">
        Prints through the computer running the server. On Windows this needs the printer installed with the
        Generic / Text Only driver — the app will find it automatically, or set its USB vendor/product IDs below.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => test("receipt")}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Printing…" : "Test receipt"}
        </button>
        <button
          onClick={() => test("label")}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Printing…" : "Test label"}
        </button>
      </div>
      {msg && (
        <div className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

function ChangePin() {
  const [f, setF] = useState({ oldPin: "", newPin: "", confirmPin: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (f.newPin !== f.confirmPin) {
      setMsg({ kind: "error", text: "New PINs do not match" });
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-pin", { method: "POST", body: { oldPin: f.oldPin, newPin: f.newPin } });
      setF({ oldPin: "", newPin: "", confirmPin: "" });
      setMsg({ kind: "success", text: "PIN changed" });
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800">Change my PIN</h2>
      <p className="mt-1 text-sm text-slate-500">This changes the PIN you sign in with.</p>
      <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Current PIN</label>
          <input className={field} type="password" inputMode="numeric" value={f.oldPin} onChange={(e) => setF({ ...f, oldPin: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">New PIN (4-8 digits)</label>
            <input className={field} type="password" inputMode="numeric" value={f.newPin} onChange={(e) => setF({ ...f, newPin: e.target.value })} required />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Confirm new PIN</label>
            <input className={field} type="password" inputMode="numeric" value={f.confirmPin} onChange={(e) => setF({ ...f, confirmPin: e.target.value })} required />
          </div>
        </div>
        {msg && (
          <p className={`text-sm ${msg.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>{msg.text}</p>
        )}
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Changing…" : "Change PIN"}
        </button>
      </form>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const webUsbSupported = typeof navigator !== "undefined" && !!navigator.usb;
  const [settings, setSettings] = useState(null);
  const [storeName, setStoreName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    api("/settings").then((d) => {
      setSettings(d);
      setStoreName(d.store_name);
    }).catch(() => {});
  }, [isAdmin]);

  const notify = (kind, text) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  };

  async function save() {
    setBusy(true);
    try {
      const body = { store_name: storeName };
      if (settings?.logo) body.logo = settings.logo;
      const d = await api("/settings", { method: "PUT", body });
      setSettings(d);
      setStoreName(d.store_name);
      notify("success", "Settings saved");
    } catch (err) {
      notify("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickLogo(file) {
    setLogoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Choose an image file (PNG works best)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image is too large (max 2 MB)");
      return;
    }
    try {
      const logo = await imageToBitmap(file);
      const d = await api("/settings", { method: "PUT", body: { store_name: storeName, logo } });
      setSettings(d);
      setStoreName(d.store_name);
      notify("success", "Logo saved — receipts will print it in black & white");
    } catch (err) {
      setLogoError(err.message);
    }
  }

  async function removeLogo() {
    setBusy(true);
    try {
      const d = await api("/settings", { method: "PUT", body: { store_name: storeName, logo: null } });
      setSettings(d);
      notify("success", "Logo removed — store name will be printed");
    } catch (err) {
      notify("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdmin ? "Store details and printing preferences" : "Your sign-in preferences"}
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Store details</h2>
          <p className="mt-1 text-sm text-slate-500">
            The store name is printed at the top of every receipt — unless a logo is uploaded.
          </p>

          {msg && (
            <div className={`mt-4 rounded-lg px-4 py-2 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
              {msg.text}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="max-w-sm">
              <label className="text-xs font-medium text-slate-600">Store name</label>
              <input className={field} value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={60} />
              <p className="mt-1 text-xs text-slate-400">Shown on receipts and labels. Max 60 characters.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Receipt logo (optional)</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => pickLogo(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {settings?.logo ? "Replace logo…" : "Upload logo…"}
                </button>
                {settings?.logo && (
                  <button onClick={removeLogo} className="text-xs font-medium text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>
              {logoError && <p className="mt-1 text-sm text-red-600">{logoError}</p>}
              <p className="mt-1 text-xs text-slate-400">
                Converted to black & white and scaled to fit the printer (up to 336 dots wide, 120 tall).
              </p>
              {settings?.logo && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold text-slate-700 mb-2">
                    Black & white preview ({settings.logo.width}×{settings.logo.height} dots):
                  </div>
                  <LogoCanvas logo={settings.logo} width="240px" />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={save}
            disabled={busy}
            className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save store details"}
          </button>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">Printers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect the receipt and label printers from this browser. Until the hardware arrives, every print
          button also works in simulator mode.
        </p>
        <div className="mt-4 space-y-4">
          <PrinterRow
            kind="receipt"
            title="Receipt printer — Xprinter XP-Q807K"
            detail="80mm thermal, ESC/POS"
            webUsbSupported={webUsbSupported}
          />
          <PrinterRow
            kind="label"
            title="Label printer — Gprinter GP-3120TUD"
            detail="40×30 mm labels, TSPL"
            webUsbSupported={webUsbSupported}
          />
        </div>
      </div>

      <ServerUsbRow />

      <ChangePin />
    </div>
  );
}