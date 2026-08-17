// apps/web/src/components/AppLayout.tsx
// Sidebar shell for authenticated routes (248px sticky). Tailwind
// arbitrary-value utilities, matching how the rest of packages/ui already
// consumes the CSS-variable tokens — except the sidebar background itself,
// which is pinned to #090F1A (not --lr-night-900) to match the dark surface
// logo.svg (transparent background) was designed against.
//
// issues.md #38 (responsivo): below `md` the 248px side rail has nowhere to
// go, so it's replaced by a fixed bottom tab bar (`<nav>` at the end of this
// file) — same nav items, icon-only. The avatar/logout footer has no mobile
// equivalent of its own; "Perfil" in the bottom bar covers the avatar's job
// (opens Settings) and a dedicated tab covers logout, since Settings had no
// other sign-out affordance for a screen where the sidebar doesn't exist.
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import packageJson from "../../package.json";
import { useAuth } from "../auth/AuthContext";
import {
  AccountsNavIcon,
  AdminNavIcon,
  ConnectionsNavIcon,
  DashboardNavIcon,
  ImportNavIcon,
  LogoutIcon,
  RecurringNavIcon,
  TimelineNavIcon,
} from "./AppLayoutIcons";
import { UpdatesBanner } from "./UpdatesBanner";

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
  { to: "/imports", label: "Importar", icon: <ImportNavIcon /> },
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.to === "/connections" && user && !user.flags.connections) {
      return false;
    }
    return true;
  });

  async function handleLogout() {
    await logout();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-[var(--lr-bg)]">
      <aside className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col bg-[#090F1A] px-4 py-6 text-[var(--lr-ivory-100)] md:flex">
        <div className="w-full flex items-center justify-center pb-4">
          <img src="/logo.svg" alt="Lurem" className="w-full" />
        </div>

        <nav className="flex flex-col gap-0.5">
          {visibleNavItems.map((item) => {
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

      {/* No overflow-x-hidden here (or on any wrapper around <Outlet />):
          the CSS overflow-3 spec silently promotes the OTHER axis to "auto"
          whenever one axis is set to a non-visible value, so an
          overflow-x-hidden ancestor — even one that never actually shows a
          scrollbar — registers as a scroll container and breaks any
          `position: sticky` descendant (e.g. TimelinePage's balance
          sidebar sticks to that ancestor instead of the window). Routes
          that risk horizontal overflow (long tables, wide rows) should
          scope overflow-x-hidden to their own non-sticky wrapper instead of
          relying on the shell for it — see TimelinePage.tsx's feed column. */}
      <main className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="px-4 pt-4">
          <UpdatesBanner />
        </div>
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--lr-night-700)] bg-[#090F1A] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {visibleNavItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={[
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[.625rem] no-underline",
                isActive
                  ? "text-[var(--lr-ivory-100)]"
                  : "text-[var(--lr-night-300)]",
              ].join(" ")}
            >
              {item.icon}
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        {user?.role === "admin" ? (
          <Link
            to="/admin"
            aria-label="Admin"
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[.625rem] no-underline",
              location.pathname.startsWith("/admin")
                ? "text-[var(--lr-ivory-100)]"
                : "text-[var(--lr-night-300)]",
            ].join(" ")}
          >
            <AdminNavIcon />
            <span className="truncate">Admin</span>
          </Link>
        ) : null}
        {user ? (
          <>
            <button
              type="button"
              aria-label="Perfil e configurações"
              onClick={() => navigate({ to: "/settings" })}
              className={[
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[.625rem]",
                location.pathname.startsWith("/settings")
                  ? "text-[var(--lr-ivory-100)]"
                  : "text-[var(--lr-night-300)]",
              ].join(" ")}
            >
              <div className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--lr-night-700)] text-[.5625rem] text-[var(--lr-ivory-100)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">Perfil</span>
            </button>
            <button
              type="button"
              aria-label="Sair"
              onClick={() => void handleLogout()}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[.625rem] text-[var(--lr-night-300)]"
            >
              <LogoutIcon />
              <span className="truncate">Sair</span>
            </button>
          </>
        ) : null}
      </nav>
    </div>
  );
}
