import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "../shared/Spinner";

// "link" is additive over IMPLEMENTACAO.md §10.1a's 4-variant list
// (primary/secondary/tertiary/danger) — brand/design-system/index.html's
// button section (id="botao") documents 5 variants, the 5th being a
// text-link style action (e.g. "De onde vem esse número?") with no
// background/padding, underlined, at --hm-blue-700 (now --lr-graphite-700,
// see the variant map below for the rebrand substitution note). Kept alongside
// `tertiary` rather than renamed/merged: `tertiary` already renders
// identically to the reference's `ghost` (padded, bordered-transparent
// button), which is a *different* affordance than an inline text link.
// Flagged for whoever owns IMPLEMENTACAO.md: the spec's variant list is
// now one short of the reference's.
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "link";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  /** Visual style of the button. */
  variant?: ButtonVariant;
  /** Size preset — mirrors the `sm`/`md`/`lg` scale already established in the brand's reference design system. */
  size?: ButtonSize;
  /** Shows a spinner and puts the button in a busy, non-interactive state. Purely presentational — callers own the async logic. */
  loading?: boolean;
};

export type ButtonProps =
  | (ButtonBaseProps & {
      /**
       * Icon rendered alone, with no label — the button becomes a square
       * icon-only trigger (formerly the separate `IconButton` component,
       * merged in here so a design has one button, not two). Always
       * `aria-hidden`; without visible text, `aria-label` is the button's
       * only accessible name, so TypeScript requires it at the call site
       * instead of leaving it to a lint rule or a runtime check.
       */
      icon: ReactNode;
      children?: never;
      "aria-label": string;
    })
  | (ButtonBaseProps & {
      /**
       * Icon rendered before the label (index.html "com ícone" example,
       * id="botao"). Always `aria-hidden` — the label is the accessible
       * name. There is no trailing-icon slot: the reference only ever shows
       * a leading icon on this component.
       */
      icon?: ReactNode;
      children: ReactNode;
      "aria-label"?: string;
    });

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Dark theme redefines --lr-bg to var(--lr-night-900) too (see
  // lurem-tokens.css's [data-theme="dark"] block) — with no dark-mode
  // override, a --lr-night-900 button on a --lr-night-900 page is nearly
  // invisible. brand/design-system/lurem-components.css has this same gap
  // (.hmc-btn--primary is never overridden for dark). Fixed here by
  // stepping the whole light-mode ramp (900→700→800) up one notch in dark
  // mode (700→600→800) so the button never matches the page background.
  primary:
    "bg-[var(--lr-night-900)] text-[var(--lr-ivory-000)] border border-transparent " +
    "hover:bg-[var(--lr-night-700)] active:bg-[var(--lr-night-800)] " +
    "dark:bg-[var(--lr-night-700)] dark:hover:bg-[var(--lr-night-600)] dark:active:bg-[var(--lr-night-800)]",
  // active:bg-[var(--lr-ivory-100)] is a raw light-tint token with no dark
  // redefinition — in dark mode --lr-text also resolves to --lr-ivory-100
  // (lurem-tokens.css's [data-theme="dark"] block), so the active
  // background and the button's own text became the same color, making the
  // label disappear. dark:active: steps to --lr-night-700 (one tick lighter
  // than --lr-surface's ink-800), same "never match dark text" fix already
  // applied to primary above.
  secondary:
    "bg-[var(--lr-surface)] text-[var(--lr-text)] border border-[var(--lr-border)] " +
    "hover:bg-[var(--lr-surface-sunken)] hover:border-[var(--lr-night-300)] " +
    "active:bg-[var(--lr-ivory-100)] dark:active:bg-[var(--lr-night-700)]",
  // active: text-2 (#5f6c80) measured 4.12:1 against the active background
  // (border/40 over the page bg) — short of AA's 4.5:1. Verified with axe-core;
  // switching to full-strength text on active (matches the hover treatment)
  // clears it.
  tertiary:
    "bg-transparent text-[var(--lr-text-secondary)] border border-transparent " +
    "hover:bg-[var(--lr-surface-sunken)] hover:text-[var(--lr-text)] " +
    "active:bg-[var(--lr-border)]/40 active:text-[var(--lr-text)]",
  // --lr-negative-700/800 mirror the hover/active shades already hardcoded in
  // brand/design-system/lurem-components.css — promoted to real tokens
  // (v1.2) instead of living as one-off hex here.
  danger:
    "bg-[var(--lr-negative)] text-white border border-transparent " +
    "hover:bg-[var(--lr-negative-700)] active:bg-[var(--lr-negative-800)]",
  // index.html lines ~63-67 of lurem-components.css (`.hmc-btn--link`):
  // background none, padding 0, min-height 0, underlined, hover → --lr-night-900.
  // REBRAND (Task 1.3): the Lurem palette has no dedicated "info/link" hue —
  // Night/Petrol/Ivory/Gold/Graphite/Terracota only. --lr-graphite-{700,300}
  // is the settled mapping (DESIGN.md's neutral-by-default rule; no info/link
  // token is defined there, so graphite is the answer, not a placeholder).
  // Contrast verified: graphite-700 on the page surface clears ~11-13:1
  // (comfortably AA), dark mode steps to graphite-300/ivory-100.
  link:
    "bg-transparent text-[var(--lr-graphite-700)] dark:text-[var(--lr-graphite-300)] border border-transparent " +
    "underline underline-offset-[3px] decoration-1 " +
    "hover:text-[var(--lr-night-900)] dark:hover:text-[var(--lr-ivory-100)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-[.8125rem] px-3.5 py-2 min-h-9 rounded-[var(--lr-r-sm)]",
  md: "text-sm px-4 py-2.5 min-h-11 rounded-[var(--lr-r-md)]",
  lg: "text-base px-7 py-4 min-h-13 rounded-[var(--lr-r-md)]",
};

// `link` ignores the sm/md/lg padding/min-height scale entirely (reference
// has no such combination — a text link has no touch-target box to size);
// only the font-size still tracks the requested size.
const LINK_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-[.8125rem] p-0 min-h-0",
  md: "text-sm p-0 min-h-0",
  lg: "text-base p-0 min-h-0",
};

// Square, matching the sm/md/lg height scale above (36/44/52px) rather than
// the old standalone IconButton's fixed 40×40 — so an icon-only and a
// labeled button of the same `size` always line up edge-to-edge.
const ICON_ONLY_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-9 w-9 p-0 rounded-[var(--lr-r-sm)]",
  md: "h-11 w-11 p-0 rounded-[var(--lr-r-md)]",
  lg: "h-13 w-13 p-0 rounded-[var(--lr-r-md)]",
};

/**
 * Lurem's base action trigger. A dumb, presentational component: it never
 * fetches data or knows what clicking it does — that is entirely up to the
 * `onClick` handler passed in by the caller. Covers both a labeled button
 * and an icon-only square button (pass `icon` with no `children`).
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  icon,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isLink = variant === "link";
  const isIconOnly = children == null;

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "relative inline-flex cursor-pointer items-center justify-center gap-2 font-sans font-bold",
        "transition-colors duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        isIconOnly
          ? ICON_ONLY_SIZE_CLASSES[size]
          : isLink
            ? LINK_SIZE_CLASSES[size]
            : SIZE_CLASSES[size],
        className,
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex items-center gap-2",
          loading ? "opacity-0" : "opacity-100",
        ].join(" ")}
      >
        {icon ? (
          <span
            aria-hidden="true"
            className={[
              "inline-flex flex-none [&>svg]:h-full [&>svg]:w-full",
              isIconOnly ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]",
            ].join(" ")}
          >
            {icon}
          </span>
        ) : null}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 m-auto flex h-4 w-4 items-center justify-center opacity-70">
          <Spinner size="sm" label="Carregando…" />
        </span>
      ) : null}
    </button>
  );
}
