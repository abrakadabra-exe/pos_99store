import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { initPrinters } from "../printer.js";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/pos", label: "POS", icon: "🛒" },
  { to: "/sales", label: "Sales", icon: "🧾" },
  { to: "/products", label: "Products", icon: "🏷️" },
  { to: "/reports", label: "Reports (coming soon)", icon: "📊", disabled: true },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

const linkClass = ({ isActive }) =>
  "block px-4 py-2.5 text-sm " + (isActive ? "bg-slate-800 text-emerald-400" : "text-slate-300 hover:bg-slate-800 hover:text-white");

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), []);
  useEffect(() => {
    initPrinters();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const sidebar = (
    <div className="flex flex-col bg-slate-900 text-slate-200">
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="font-extrabold text-emerald-400">99tk POS</div>
        <div className="text-xs text-slate-400">Inventory & Billing</div>
      </div>
      <nav className="flex-1 py-2">
        {NAV.map((item) =>
          item.disabled ? (
            <div
              key={item.to}
              className="px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
              title="Coming in a later build"
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass} onClick={() => setOpen(false)}>
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      <div className="px-4 py-3 border-t border-slate-700 text-sm">
        <div className="font-medium text-slate-200">{user?.name}</div>
        <div className="text-xs text-slate-400">
          {user?.username} · {user?.role}
        </div>
        <button onClick={handleLogout} className="mt-2 text-xs text-red-400 hover:text-red-300">
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-slate-900 px-4 text-slate-200 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg px-2 py-1 text-xl leading-none hover:bg-slate-800"
        >
          ☰
        </button>
        <span className="font-extrabold text-emerald-400">99tk POS</span>
        <span className="ml-auto truncate text-xs text-slate-400">{user?.name}</span>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 transform transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="px-4 sm:px-6 pb-4 pt-6 text-center text-[10px] text-slate-400">
          Developed by Megamind Bangladesh
        </footer>
      </main>
    </div>
  );
}
