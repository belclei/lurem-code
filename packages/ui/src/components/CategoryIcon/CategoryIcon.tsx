import type { ReactNode } from "react";

export interface CategoryIconProps {
  slug: string; // ex: "hm-cat-alimentacao"
  className?: string;
}

// All 14 category SVG icons + fallback, stroke-based with viewBox="0 0 24 24"
const ICONS: Record<string, ReactNode> = {
  "hm-cat-alimentacao": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M6 3 V8" />
        <path d="M9 3 V8" />
        <path d="M3 3 V8" />
        <path d="M3 8 H9" />
        <path d="M6 8 V21" />
        <path d="M17 3.5 C19.8 5.5 19.8 9.5 17 11.5 Z" />
        <path d="M17 11.5 V21" />
      </g>
      <circle cx="6" cy="21" r="1.5" fill="currentColor" />
      <circle cx="17" cy="21" r="1.5" fill="currentColor" />
    </svg>
  ),
  "hm-cat-moradia": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M2 11 L12 3 L22 11" />
        <path d="M5 11 V21 H19 V11" />
        <path d="M10 21 V15 H14 V21" />
      </g>
      <circle cx="12" cy="3" r="1.7" fill="currentColor" />
    </svg>
  ),
  "hm-cat-transporte": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M5 11.5 L7.5 6 H16.5 L19 11.5" />
        <path d="M2.5 11.5 H21.5 V16 H2.5 Z" />
      </g>
      <circle cx="7" cy="17.5" r="2.1" fill="currentColor" />
      <circle cx="17" cy="17.5" r="2.1" fill="currentColor" />
    </svg>
  ),
  "hm-cat-saude": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M9.5 3 H14.5 V9.5 H21 V14.5 H14.5 V21 H9.5 V14.5 H3 V9.5 H9.5 Z"
        fill="none"
      />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  ),
  "hm-cat-lazer": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M3 7 H21 V10.4 A1.8 1.8 0 0 0 21 13.6 V17 H3 V13.6 A1.8 1.8 0 0 0 3 10.4 Z" />
        <path d="M15 8.6 V10.4" />
        <path d="M15 13.6 V15.4" />
      </g>
      <circle cx="8.5" cy="12" r="1.7" fill="currentColor" />
    </svg>
  ),
  "hm-cat-servicos": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(12,12) scale(0.6667)">
        <circle cx="0" cy="0" r="8.5" fill="none" />
        <circle cx="0" cy="0" r="2.6" fill="currentColor" />
        <g fill="currentColor">
          <circle cx="0" cy="-13.5" r="2.2" />
          <circle cx="9.5" cy="-9.5" r="2.2" />
          <circle cx="13.5" cy="0" r="2.2" />
          <circle cx="9.5" cy="9.5" r="2.2" />
          <circle cx="0" cy="13.5" r="2.2" />
          <circle cx="-9.5" cy="9.5" r="2.2" />
          <circle cx="-13.5" cy="0" r="2.2" />
          <circle cx="-9.5" cy="-9.5" r="2.2" />
        </g>
      </g>
    </svg>
  ),
  "hm-cat-compras": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M4 8.5 H20 L18.5 21 H5.5 Z" />
        <path d="M9 8.5 V6 A3 3 0 0 1 15 6 V8.5" />
      </g>
      <circle cx="4" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="20" cy="8.5" r="1.6" fill="currentColor" />
    </svg>
  ),
  "hm-cat-renda": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M12 3 V13" />
        <path d="M8 9.5 L12 13.5 L16 9.5" />
        <path d="M3 16 V20 H21 V16" />
      </g>
      <circle cx="12" cy="3" r="1.7" fill="currentColor" />
    </svg>
  ),
  "hm-cat-impostos": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M2 9 L12 3 L22 9" />
        <path d="M6 11 V18" />
        <path d="M10 11 V18" />
        <path d="M14 11 V18" />
        <path d="M18 11 V18" />
        <path d="M3 21 H21" />
      </g>
      <circle cx="12" cy="3" r="1.7" fill="currentColor" />
    </svg>
  ),
  "hm-cat-dividas": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <g strokeWidth="1.4">
        <path d="M6.5 8 V16" />
        <path d="M9 8 V16" />
        <path d="M11.5 8 V16" />
        <path d="M15 8 V16" />
        <path d="M17.5 8 V16" />
      </g>
    </svg>
  ),
  "hm-cat-poupanca": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <ellipse cx="11" cy="13" rx="8" ry="6.4" />
        <path d="M7 7 L8.8 3.6 L11.6 7.4" />
        <path d="M8 19.2 V21" />
        <path d="M15 19.2 V21" />
        <path d="M9.6 6.6 H14.2" />
      </g>
      <circle cx="18.6" cy="13" r="1.7" fill="currentColor" />
      <circle cx="14.6" cy="11" r="1.2" fill="currentColor" />
    </svg>
  ),
  "hm-cat-doacoes": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M12 20.5 C3 14 3 8.5 6.5 6.5 C9 5 11.5 6.5 12 9 C12.5 6.5 15 5 17.5 6.5 C21 8.5 21 14 12 20.5 Z"
        fill="none"
      />
      <circle cx="12" cy="11" r="1.7" fill="currentColor" />
    </svg>
  ),
  "hm-cat-assinaturas": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M20 12 A8 8 0 1 1 17 5.8" />
        <path d="M12.5 5.4 L17.6 5.9 L17.1 11" />
      </g>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  ),
  "hm-cat-transferencia": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g>
        <path d="M3 9 H20" />
        <path d="M17 6 L20 9 L17 12" />
        <path d="M21 16 H4" />
        <path d="M7 13 L4 16 L7 19" />
      </g>
      <circle cx="3" cy="9" r="1.5" fill="currentColor" />
      <circle cx="21" cy="16" r="1.5" fill="currentColor" />
    </svg>
  ),
  "hm-cat-sem-categoria": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(12,12) scale(0.6667)">
        <circle cx="0" cy="0" r="11" fill="none" strokeDasharray="3 4" />
        <circle cx="0" cy="0" r="2.2" fill="currentColor" />
      </g>
    </svg>
  ),
};

export function CategoryIcon({ slug, className }: CategoryIconProps) {
  const icon = ICONS[slug] ?? ICONS["hm-cat-sem-categoria"];
  return (
    <span aria-hidden="true" className={className || "h-5 w-5 flex-none"}>
      {icon}
    </span>
  );
}
