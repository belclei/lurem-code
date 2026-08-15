// apps/web/src/components/AppLayoutIcons.tsx
// One icon per nav item/action in AppLayout's sidebar — app-shell specific,
// not reusable design-system glyphs, so they live here rather than
// packages/ui. Previously inline in AppLayout.tsx's NAV_ITEMS array.

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

export function TimelineNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  );
}

export function DashboardNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 19 V10" />
      <path d="M10 19 V5" />
      <path d="M16 19 V13" />
      <path d="M3 19 H21" />
    </svg>
  );
}

export function AccountsNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function RecurringNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 12 A8 8 0 0 1 18 6.5 L20 8" />
      <path d="M20 4 V8 H16" />
      <path d="M20 12 A8 8 0 0 1 6 17.5 L4 16" />
      <path d="M4 20 V16 H8" />
    </svg>
  );
}

export function ConnectionsNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="8" cy="9" r="3.2" />
      <circle cx="16" cy="9" r="3.2" />
      <path d="M3.5 19 C3.5 15.5 6 14 8 14 C10 14 12.5 15.5 12.5 19" />
      <path d="M12.5 14.2 C13.4 14 14.6 14 15.5 14.2 C18 14.8 20.5 16 20.5 19" />
    </svg>
  );
}

export function ImportNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 15 V4" />
      <path d="M7 9 L12 4 L17 9" />
      <path d="M4 15 V18 A2 2 0 0 0 6 20 H18 A2 2 0 0 0 20 18 V15" />
    </svg>
  );
}

export function AdminNavIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 3 L20 6.5 V12 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 12 V6.5 Z" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M15 4 H19 A1 1 0 0 1 20 5 V19 A1 1 0 0 1 19 20 H15" />
      <path d="M10 12 H3" />
      <path d="M6 8 L3 12 L6 16" />
    </svg>
  );
}
