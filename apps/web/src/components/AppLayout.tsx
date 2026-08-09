// apps/web/src/components/AppLayout.tsx
// Sidebar shell for authenticated routes (248px sticky). Tailwind
// arbitrary-value utilities, matching how the rest of packages/ui already
// consumes the CSS-variable tokens — except the sidebar background itself,
// which is pinned to #0D1420 (not --lr-night-900) to exactly match
// logo.png's baked-in background so the image blends in seamlessly.
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import packageJson from "../../package.json";
import { useAuth } from "../auth/AuthContext";
import {
  AccountsNavIcon,
  AdminNavIcon,
  ConnectionsNavIcon,
  DashboardNavIcon,
  LogoutIcon,
  RecurringNavIcon,
  TimelineNavIcon,
} from "./AppLayoutIcons";

interface NavItemConfig {
  to: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItemConfig[] = [
  { to: "/timeline", label: "Timeline", icon: <TimelineNavIcon /> },
  { to: "/dashboard", label: "Análise", icon: <DashboardNavIcon /> },
  {
    to: "/accounts",
    label: "Contas e cartões",
    icon: <AccountsNavIcon />,
  },
  { to: "/recurring", label: "Recorrências", icon: <RecurringNavIcon /> },
  { to: "/connections", label: "Conexões", icon: <ConnectionsNavIcon /> },
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-[var(--lr-bg)]">
      <aside className="sticky top-0 flex h-screen w-[248px] flex-none flex-col bg-[#0D1420] px-4 py-6 text-[var(--lr-ivory-100)]">
        <div className="px-2 pt-2 pb-7 w-full flex items-center justify-center">
          <img src="/logo.png" alt="Lurem" className="w-[168px]" />
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  "flex w-full items-center gap-3 rounded-[var(--lr-r-md)] px-3 py-2.5 text-[0.9375rem] no-underline",
                  isActive
                    ? "bg-[var(--lr-night-800)] text-[var(--lr-ivory-100)] shadow-[var(--lr-e1)]"
                    : "text-[var(--lr-night-300)] hover:bg-[var(--lr-night-800)] hover:text-[var(--lr-ivory-100)]",
                ].join(" ")}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
          {user?.role === "admin" ? (
            <Link
              to="/admin"
              className={[
                "flex w-full items-center gap-3 rounded-[var(--lr-r-md)] px-3 py-2.5 text-[0.9375rem] no-underline",
                location.pathname.startsWith("/admin")
                  ? "bg-[var(--lr-night-800)] text-[var(--lr-ivory-100)] shadow-[var(--lr-e1)]"
                  : "text-[var(--lr-night-300)] hover:bg-[var(--lr-night-800)] hover:text-[var(--lr-ivory-100)]",
              ].join(" ")}
            >
              <AdminNavIcon />
              Admin
            </Link>
          ) : null}
        </nav>

        {user ? (
          <div className="mt-auto flex items-center gap-1 rounded-[var(--lr-r-sm)] p-1 hover:bg-[var(--lr-night-800)]">
            <button
              type="button"
              onClick={() => navigate({ to: "/settings" })}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--lr-r-sm)] p-1 text-left text-inherit"
            >
              <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--lr-night-700)] text-[var(--lr-ivory-100)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9375rem]">{user.name}</div>
                <div className="truncate text-[0.75rem] text-[var(--lr-night-300)]">
                  Conta pessoal
                </div>
                <div className="truncate text-[0.65rem] text-[var(--lr-night-400)]">
                  v{packageJson.version}
                </div>
              </div>
            </button>
            <button
              type="button"
              title="Sair"
              aria-label="Sair"
              onClick={() => void handleLogout()}
              className="flex-none rounded-[var(--lr-r-sm)] p-1 text-[var(--lr-night-300)] hover:text-[var(--lr-ivory-100)]"
            >
              <LogoutIcon />
            </button>
          </div>
        ) : null}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
