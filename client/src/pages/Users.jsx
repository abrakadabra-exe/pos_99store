import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl p-5 max-h-[85vh] overflow-y-auto"
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

function CreateUser({ onDone, onError }) {
  const [f, setF] = useState({ username: "", name: "", role: "staff", pin: "", confirmPin: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (f.pin !== f.confirmPin) {
      onError("PINs do not match");
      return;
    }
    setBusy(true);
    try {
      const data = await api("/users", { method: "POST", body: { username: f.username, name: f.name, role: f.role, pin: f.pin } });
      onDone(data.user);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-600">Username (3-30 chars, letters/numbers/._-)</label>
        <input className={field} value={f.username} onChange={set("username")} placeholder="e.g. karim" required autoFocus />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Display name</label>
        <input className={field} value={f.name} onChange={set("name")} placeholder="e.g. Karim Uddin" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Role</label>
        <select className={field} value={f.role} onChange={set("role")}>
          <option value="staff">Staff (can sell, manage products)</option>
          <option value="admin">Admin (can also manage users & settings)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">PIN (4-8 digits)</label>
          <input className={field} type="password" inputMode="numeric" value={f.pin} onChange={set("pin")} required />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Confirm PIN</label>
          <input className={field} type="password" inputMode="numeric" value={f.confirmPin} onChange={set("confirmPin")} required />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

function ResetPin({ user, onDone, onError }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pin !== confirmPin) {
      onError("PINs do not match");
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${user.id}/reset-pin`, { method: "POST", body: { pin } });
      onDone(user);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600">
        New PIN for <span className="font-medium">{user.username}</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">PIN (4-8 digits)</label>
          <input className={field} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Confirm PIN</label>
          <input className={field} type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} required />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Resetting…" : "Reset PIN"}
        </button>
      </div>
    </form>
  );
}

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [modal, setModal] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    api("/users").then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);

  useEffect(load, [load]);

  const notify = (kind, text) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Only the admin can manage users.
        </div>
      </div>
    );
  }

  async function toggleActive(u) {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { active: u.active ? 0 : 1 } });
      notify("success", u.active ? `"${u.username}" deactivated` : `"${u.username}" activated`);
      load();
    } catch (err) {
      notify("error", err.message);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Staff log in with their username and PIN</p>
        </div>
        <button
          onClick={() => setModal("create")}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Add user
        </button>
      </div>

      {msg && (
        <div className={`mt-4 rounded-lg px-4 py-2 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {users?.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">No users yet</td></tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.username}
                  {u.id === user.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.role === "admin" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="text-xs text-slate-500">active</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{u.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setResetTarget(u)} className="text-emerald-700 hover:underline text-xs font-medium">
                    Reset PIN
                  </button>
                  {u.id !== user.id && (
                    <>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <button onClick={() => toggleActive(u)} className="text-slate-600 hover:underline text-xs">
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "create" && (
        <Modal title="Add user" onClose={() => setModal(null)}>
          <CreateUser
            onDone={(u) => { setModal(null); notify("success", `"${u.username}" created`); load(); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
      {resetTarget && (
        <Modal title={`Reset PIN — ${resetTarget.username}`} onClose={() => setResetTarget(null)}>
          <ResetPin
            user={resetTarget}
            onDone={() => { setResetTarget(null); notify("success", "PIN reset"); }}
            onError={(m) => notify("error", m)}
          />
        </Modal>
      )}
    </div>
  );
}