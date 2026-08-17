import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/pos", label: "POS (coming soon)", icon: "🛒", disabled: true },
  { to: "/products", label: "Products", icon: "🏷️" },
  { to: "/reports", label: "Reports (coming soon)", icon: "📊", disabled: true },
  { to: "/users", label: "Users (coming soon)", icon: "👥", disabled: true },
  { to: "/settings", label: "Settings (coming soon)", icon: "⚙️", disabled: true },
];

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
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
              <Link
                key={item.to}
                to={item.to}
                className="block px-4 py-2.5 text-sm hover:bg-slate-800"
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
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
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}