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

interface NavItemConfig {
  to: string;
  label: string;
  icon: ReactNode;
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV_ITEMS: NavItemConfig[] = [
  {
    to: "/timeline",
    label: "Timeline",
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    to: "/dashboard",
    label: "Análise",
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M4 19 V10" />
        <path d="M10 19 V5" />
        <path d="M16 19 V13" />
        <path d="M3 19 H21" />
      </svg>
    ),
  },
  {
    to: "/accounts",
    label: "Contas e cartões",
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    to: "/recurring",
    label: "Recorrências",
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M4 12 A8 8 0 0 1 18 6.5 L20 8" />
        <path d="M20 4 V8 H16" />
        <path d="M20 12 A8 8 0 0 1 6 17.5 L4 16" />
        <path d="M4 20 V16 H8" />
      </svg>
    ),
  },
  {
    to: "/connections",
    label: "Conexões",
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <circle cx="8" cy="9" r="3.2" />
        <circle cx="16" cy="9" r="3.2" />
        <path d="M3.5 19 C3.5 15.5 6 14 8 14 C10 14 12.5 15.5 12.5 19" />
        <path d="M12.5 14.2 C13.4 14 14.6 14 15.5 14.2 C18 14.8 20.5 16 20.5 19" />
      </svg>
    ),
  },
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
              <svg {...ICON_PROPS} aria-hidden="true">
                <path d="M12 3 L20 6.5 V12 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 12 V6.5 Z" />
              </svg>
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
              <svg {...ICON_PROPS} aria-hidden="true">
                <path d="M15 4 H19 A1 1 0 0 1 20 5 V19 A1 1 0 0 1 19 20 H15" />
                <path d="M10 12 H3" />
                <path d="M6 8 L3 12 L6 16" />
              </svg>
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
