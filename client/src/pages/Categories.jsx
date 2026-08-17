import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import Modal from "../components/Modal.jsx";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const btn =
  "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";

function CategoryDialog({ title, initial, busy, error, onChange, onSubmit, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Category name</label>
          <input
            className={field}
            value={initial}
            onChange={onChange}
            placeholder="e.g. Snacks"
            maxLength="40"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Categories() {
  const [categories, setCategories] = useState(null);
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    api("/categories")
      .then((d) => setCategories(d.categories))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  function openAdd() {
    setName("");
    setError("");
    setModal("add");
  }

  function openRename(c) {
    setName(c.name);
    setError("");
    setModal(c);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (modal === "add") {
        await api("/categories", { method: "POST", body: { name } });
      } else {
        await api(`/categories/${modal.id}`, { method: "PATCH", body: { name } });
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/categories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      load();
    } catch (err) {
      setError(err.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Categories</h1>
          <p className="mt-1 text-sm text-slate-500">
            {categories === null
              ? "Loading…"
              : `${categories.length} categor${categories.length === 1 ? "y" : "ies"} · products must belong to one`}
          </p>
        </div>
        <button onClick={openAdd} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          + Add category
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Products</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories === null && (
              <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {categories?.length === 0 && (
              <tr>
                <td colSpan="3" className="px-4 py-10 text-center">
                  <div className="text-slate-500 font-medium">No categories yet</div>
                  <p className="mt-1 text-sm text-slate-400">
                    Create your first category — products are added into categories, so this comes first.
                  </p>
                  <button onClick={openAdd} className={`${btn} mt-4 bg-emerald-600 text-white hover:bg-emerald-700`}>
                    + Add category
                  </button>
                </td>
              </tr>
            )}
            {categories?.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-3 text-right text-slate-600">{c.product_count}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link to={`/products?category=${c.id}`} className="text-emerald-700 hover:underline text-xs font-medium">
                    View items
                  </Link>
                  <span className="mx-1.5 text-slate-300">|</span>
                  <button onClick={() => openRename(c)} className="text-slate-600 hover:underline text-xs">
                    Rename
                  </button>
                  <span className="mx-1.5 text-slate-300">|</span>
                  <button
                    onClick={() => setDeleting(c)}
                    disabled={c.product_count > 0}
                    className="text-red-600 hover:underline text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title={c.product_count > 0 ? `Has ${c.product_count} product${c.product_count === 1 ? "" : "s"} — move them first` : "Delete this category"}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CategoryDialog
          title={modal === "add" ? "Add category" : `Rename "${modal.name}"`}
          initial={name}
          busy={busy}
          error={error}
          onChange={(e) => setName(e.target.value)}
          onSubmit={submit}
          onClose={() => setModal(null)}
        />
      )}

      {deleting && (
        <Modal title={`Delete "${deleting.name}"?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">
            This category is empty, so deleting it is safe. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
              Cancel
            </button>
            <button onClick={confirmDelete} disabled={busy} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}