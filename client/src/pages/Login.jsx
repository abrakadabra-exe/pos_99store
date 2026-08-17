import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupDone, setSetupDone] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/auth/setup/status", { auth: false })
      .then(({ setupDone }) => {
        setSetupDone(setupDone);
        if (!setupDone) navigate("/setup", { replace: true });
      })
      .catch(() => {})
      .finally(() => setCheckingSetup(false));
  }, [navigate]);

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">
        Checking setup status…
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), pin);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6">
        <div className="text-center">
          <div className="text-2xl font-extrabold text-emerald-700">99tk POS</div>
          <p className="mt-1 text-sm text-slate-500">Sign in with your username and PIN</p>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Username</label>
            <input
              className={field}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">PIN</label>
            <input
              className={field}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
        {!setupDone && (
          <p className="mt-4 text-center text-sm text-slate-500">
            First time?{" "}
            <Link to="/setup" className="font-medium text-emerald-700 hover:underline">
              Create your store account
            </Link>
          </p>
        )}
      </form>
      <p className="mt-4 text-center text-[10px] text-slate-400">Developed by Megamind Bangladesh</p>
    </div>
  );
}