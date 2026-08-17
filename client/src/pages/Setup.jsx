import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Setup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", name: "", storeName: "", pin: "", confirmPin: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    api("/auth/setup/status", { auth: false })
      .then(({ setupDone }) => {
        if (setupDone) navigate("/login", { replace: true });
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [navigate]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.pin !== form.confirmPin) {
      setError("PINs do not match");
      return;
    }
    try {
      const result = await api("/auth/setup", {
        method: "POST",
        auth: false,
        body: {
          username: form.username,
          name: form.name,
          store_name: form.storeName,
          pin: form.pin,
        },
      });
      setDone(result);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">
        Checking setup status…
      </div>
    );
  }

  if (done) {
    return (
<div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-xl font-bold text-slate-800">Admin account created</h1>
          <p className="mt-2 text-sm text-slate-600">
            Store this <strong>one-time emergency recovery code</strong> somewhere safe, offline.
            It is the only way to regain admin access if the admin PIN is ever lost.
          </p>
          <div className="mt-4 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-center">
            <div className="text-2xl font-mono font-bold tracking-widest text-amber-800">
              {done.recoveryCode}
            </div>
            <div className="mt-1 text-xs text-amber-700">Write this down. It will not be shown again.</div>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="mt-5 w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            I have stored it — go to login
          </button>
        </div>
        <p className="mt-4 text-center text-[10px] text-slate-400">Developed by Megamind Bangladesh</p>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-xl font-bold text-slate-800">First-time setup</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create the admin (owner) account. Only the admin can create users and reset PINs.
        </p>
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Username</label>
            <input
              className={field}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. owner"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Display name</label>
            <input
              className={field}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Shop Owner"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Store name (optional)</label>
            <input
              className={field}
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              placeholder="e.g. 99tk Store"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">PIN (4–8 digits)</label>
            <input
              className={field}
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Confirm PIN</label>
            <input
              className={field}
              type="password"
              inputMode="numeric"
              value={form.confirmPin}
              onChange={(e) => setForm({ ...form, confirmPin: e.target.value })}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700">
            Create admin account
          </button>
        </div>
      </form>
      <p className="mt-4 text-center text-[10px] text-slate-400">Developed by Megamind Bangladesh</p>
    </div>
  );
}