import type { ReactNode } from "react";
import { CloseIconThin } from "../shared/icons";

export type BadgeStatus =
  | "active"
  | "inactive"
  | "pending"
  | "alert"
  | "estimate";
export type BadgeCategoryColor = "ink" | "blue" | "sage" | "sand" | "clay";

interface BadgeCommonProps {
  children: ReactNode;
  className?: string;
}

export interface BadgeStatusProps extends BadgeCommonProps {
  kind: "status";
  status: BadgeStatus;
}

export interface BadgeCategoryProps extends BadgeCommonProps {
  kind: "category";
  /** Category color is decided by the caller (e.g. from the category record's own `color` field) — the Badge just paints it. Ignored when `none` is set. */
  color: BadgeCategoryColor;
  icon?: ReactNode;
  /**
   * "Sem categoria" — index.html id="badge": category is optional on a
   * transaction (§6.5), so this is a legitimate, deliberately muted state,
   * not an error. Overrides `color`/`icon` to the neutral dashed treatment.
   */
  none?: boolean;
  /**
   * AI-suggested, not yet confirmed by a human — index.html id="badge" rule:
   * "Sugestão da IA vem sempre tracejada até o humano confirmar." Adds a
   * dashed border on top of the normal `color` styling; ignored when `none`
   * is set (an unconfirmed suggestion is never simultaneously "no category").
   */
  suggested?: boolean;
  /** Renders a trailing × affordance; called when the user removes this category from the record. */
  onRemove?: () => void;
  /** Accessible label for the remove button. Defaults to "Remover categoria". */
  removeLabel?: string;
}

export type BadgeProps = BadgeStatusProps | BadgeCategoryProps;

// bg/text pairs use the v1.1 AA-checked text tokens from lurem-tokens.css
// (--lr-*-700, or --lr-negative-on-tint on clay-100) rather than the older
// hardcoded hex in brand/design-system/lurem-components.css, which
// predates that AA correction — see Sprint report for the flag.
// Same dark-mode gap as Alert: the raw --lr-*-100 tints and --lr-*-700 text
// tones are only checked for a light page, so they get a dark: override
// each (translucent wash of the base hue + the ~300-tier lighter text).
//
// blue-700/sage-700 fail axe-core's color-contrast check on their *own*
// -100 chip background (4.32:1 / 4.35:1, short of 4.5:1) even though they
// pass against the neutral page — a badge/chip is exactly the "text on its
// own tint" case lurem-tokens.css's v1.1 pass never covered. --hm-blue-on-tint
// / --lr-positive-on-tint (v1.2) are that same hue nudged darker until it clears
// 4.5:1 against these exact backgrounds. (Rebrand note: blue's on-tint hack
// is now moot — the graphite substitution below doesn't need one, see its
// own comment.) The dark-mode clay chip had the
// same problem (clay-500 on the clay-700/20 wash measured 3.34:1); uses
// --lr-negative, the brand's token for "clay tone readable on a dark
// surface" (also --lr-money-out's dark value).
const STATUS_STYLES: Record<
  BadgeStatus,
  { bg: string; text: string; dot: string; label: string; border?: string }
> = {
  active: {
    bg: "bg-[var(--lr-petrol-100)] dark:bg-[var(--lr-petrol-700)]/20",
    text: "text-[var(--lr-positive-on-tint)] dark:text-[var(--lr-petrol-300)]",
    dot: "bg-[var(--lr-petrol-700)] dark:bg-[var(--lr-petrol-300)]",
    label: "Ativo",
  },
  // Was bg-[var(--lr-ivory-100)]: in light theme that token IS --lr-bg (the
  // page background itself, lurem-tokens.css line 47), so the pill was
  // literally invisible against the page and only its text floated. The
  // reference's neutral chip/badge (lurem-components.css .hmc-badge/.hmc-chip
  // base rule) uses --lr-surface-sunken + a real border instead — matches that.
  inactive: {
    bg: "bg-[var(--lr-surface-sunken)] dark:bg-white/10",
    text: "text-[var(--lr-text-secondary)]",
    dot: "bg-[var(--lr-night-500)] dark:bg-[var(--lr-night-300)]",
    label: "Inativo",
    border: "border border-[var(--lr-border)]",
  },
  pending: {
    bg: "bg-[var(--lr-gold-100)] dark:bg-[var(--lr-gold-700)]/20",
    text: "text-[var(--lr-gold-700)] dark:text-[var(--lr-gold-300)]",
    dot: "bg-[var(--lr-gold-600)] dark:bg-[var(--lr-gold-300)]",
    label: "Pendente",
  },
  alert: {
    bg: "bg-[var(--lr-negative-100)] dark:bg-[var(--lr-negative)]/20",
    text: "text-[var(--lr-negative-on-tint)] dark:text-[var(--lr-negative)]",
    dot: "bg-[var(--lr-negative-on-tint)] dark:bg-[var(--lr-negative)]",
    label: "Alerta",
  },
  // `--lr-estimate` already resolves per-theme via its own [data-theme="dark"]
  // override in lurem-tokens.css (#5a6a96 light / #8794a8 dark) — the color
  // itself changes per theme through the CSS custom property, so text/dot
  // need no separate `dark:` Tailwind class the way pending/alert/etc. do.
  // `bg`/`border` match STATUS_STYLES.inactive's neutral-surface treatment
  // (not a tinted color fill) since "agendada" needs to read as muted/
  // provisional, not as a fourth colored status alongside active/pending/alert
  // — the dashed border is what carries the "estimate, not confirmed" signal
  // (TIMELINE.md §9.2), same rule Mono's own `tone="estimate"` already follows.
  estimate: {
    bg: "bg-[var(--lr-surface-sunken)] dark:bg-white/10",
    text: "text-[var(--lr-estimate)]",
    dot: "bg-[var(--lr-estimate)]",
    label: "Agendada",
    border: "border border-dashed border-[var(--lr-border)]",
  },
};

const CATEGORY_STYLES: Record<
  BadgeCategoryColor,
  { bg: string; text: string; border?: string }
> = {
  // Same page-bg-collision bug as STATUS_STYLES.inactive above — bg-surface-sunken
  // + border matches the reference's neutral chip instead of the raw page-bg token.
  ink: {
    bg: "bg-[var(--lr-surface-sunken)] dark:bg-white/10",
    text: "text-[var(--lr-night-700)] dark:text-[var(--lr-night-200)]",
    border: "border border-[var(--lr-border)]",
  },
  // REBRAND (Task 1.3): no hue in the new Lurem palette plays "info" the
  // way blue did — substituted --lr-graphite-* at the matching numeric
  // stop (DESIGN_SYSTEM.md §1.1's neutral default), same open product
  // question flagged on Alert's info variant and Button's link variant
  // (see task-1.3 report — NOT a settled design decision).
  // `--hm-blue-on-tint` itself has no ported equivalent (blue was dropped
  // from the palette entirely, unlike sage/clay which kept bespoke
  // -on-tint tokens) — re-verified contrast for the text/bg pair below
  // rather than assuming the plain 700 stop still clears AA post-swap:
  // graphite-700 on graphite-100 measures ~8.8:1, well past 4.5:1 AA (the
  // old blue-on-tint hack only existed because plain blue-700 on blue-100
  // measured 4.32:1, just short — graphite doesn't have that problem, so
  // no bespoke hex is needed here, just the plain -700 stop).
  blue: {
    bg: "bg-[var(--lr-graphite-100)] dark:bg-[var(--lr-graphite-700)]/20",
    text: "text-[var(--lr-graphite-700)] dark:text-[var(--lr-graphite-300)]",
  },
  sage: {
    bg: "bg-[var(--lr-petrol-100)] dark:bg-[var(--lr-petrol-700)]/20",
    text: "text-[var(--lr-positive-on-tint)] dark:text-[var(--lr-petrol-300)]",
  },
  sand: {
    bg: "bg-[var(--lr-gold-100)] dark:bg-[var(--lr-gold-700)]/20",
    text: "text-[var(--lr-gold-700)] dark:text-[var(--lr-gold-300)]",
  },
  clay: {
    bg: "bg-[var(--lr-negative-100)] dark:bg-[var(--lr-negative)]/20",
    text: "text-[var(--lr-negative-on-tint)] dark:text-[var(--lr-negative)]",
  },
};

/**
 * Lurem's small status/category pill. Dumb component: `status` and `color`
 * are enums the caller picks from data it already has — nothing here is
 * computed from business rules.
 */
export function Badge(props: BadgeProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-[var(--lr-r-full)] px-2.5 py-1 text-[.75rem] font-medium";

  if (props.kind === "status") {
    const s = STATUS_STYLES[props.status];
    return (
      <span
        className={[
          base,
          s.bg,
          s.text,
          s.border ?? "",
          props.className ?? "",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={["h-1.5 w-1.5 rounded-full", s.dot].join(" ")}
        />
        {props.children}
      </span>
    );
  }

  const c = CATEGORY_STYLES[props.color];
  // index.html id="badge", ".hmc-chip--none": neutral, dashed, transparent —
  // takes over from the normal per-color bg/text entirely.
  const noneClasses =
    "border border-dashed border-[var(--lr-border)] bg-transparent text-[var(--lr-text-secondary)]";
  // index.html id="badge", "sugerida pela IA": a dashed border layered on
  // top of the normal colored chip, in --hm-blue-500 — never combined with `none`.
  // REBRAND (Task 1.3): substituted --lr-graphite-500 (matching numeric
  // stop) per the same open blue->graphite product question flagged
  // elsewhere in this file — NOT settled. Flagging an additional, real
  // contrast concern found while re-verifying (not just assuming the swap
  // "worked" mechanically): graphite-500 clears ~3.2-3.7:1 against the
  // page surface (ok for the 3:1 non-text threshold), but measures only
  // ~2.6-3.0:1 against the category chips' own -100 tint backgrounds this
  // border sits directly on (graphite-100 and petrol-100 both ~2.6:1,
  // gold-100 ~2.9:1) — i.e. it may fail WCAG 1.4.11 non-text contrast
  // against the exact background it's drawn on for most category colors.
  // The old blue-500 was never verified against clay/sand/etc.'s own -100
  // either (per the original comment above, it was only "never combined
  // with `none`" — a usage note, not a contrast check), so this may be a
  // pre-existing gap, not one this rebrand introduced — but it's real and
  // worth a design pass regardless of the blue->graphite decision.
  const suggestedClasses =
    "border border-dashed border-[var(--lr-graphite-500)]";

  return (
    <span
      className={[
        base,
        props.none ? noneClasses : [c.bg, c.text, c.border ?? ""].join(" "),
        !props.none && props.suggested ? suggestedClasses : "",
        props.className ?? "",
      ].join(" ")}
    >
      {!props.none && props.icon ? (
        <span aria-hidden="true" className="h-3.5 w-3.5 flex-none">
          {props.icon}
        </span>
      ) : null}
      {props.children}
      {props.onRemove ? (
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={props.removeLabel ?? "Remover categoria"}
          className="-mr-1 ml-0.5 inline-flex h-3.5 w-3.5 flex-none cursor-pointer items-center justify-center text-[var(--lr-text-secondary)] hover:text-[var(--lr-text)]"
        >
          <CloseIconThin className="h-full w-full" />
        </button>
      ) : null}
    </span>
  );
}

/** Convenience defaults for the `status` kind's own copy (pt-BR), reused across stories. */
export const BADGE_STATUS_LABEL: Record<BadgeStatus, string> = {
  active: STATUS_STYLES.active.label,
  inactive: STATUS_STYLES.inactive.label,
  pending: STATUS_STYLES.pending.label,
  alert: STATUS_STYLES.alert.label,
  estimate: STATUS_STYLES.estimate.label,
};
