import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import LogoCanvas from "../components/LogoCanvas.jsx";

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

      <ChangePin />
    </div>
  );
}