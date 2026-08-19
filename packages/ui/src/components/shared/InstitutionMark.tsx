export type InstitutionMarkTone = "petrol" | "gold";
export type InstitutionMarkSize = "sm" | "md";
export type InstitutionMarkKind = "account" | "card";

export interface InstitutionMarkProps {
  /** Logo image URL — absent renders the initial-in-brand-color fallback (same rule as AccountCard's own institution mark, §6.4). */
  logoUrl?: string;
  /** Used for the fallback initial and the image's accessible context. */
  name: string;
  /** `gold` is reserved for cash/wallet accounts (TIMELINE.md §6 — "carteira usa quadrado dourado"); every other institution uses the default `petrol`. */
  tone?: InstitutionMarkTone;
  /** `sm` (28px, `.hmc-inst--sm` in the design handoff) for inline rows — TransferPairCard's account legs, the Timeline aside's per-account rows. `md` (48px, the default) matches AccountCard's own square. */
  size?: InstitutionMarkSize;
  /**
   * Shape-only distinction between a bank account and a credit card — never
   * color, since petrol/gold are already reserved for other meanings
   * (transaction-card redesign, 2026-08). `"card"` swaps the square box for
   * a landscape one (credit-card-shaped); `"account"` (default) keeps the
   * square, unchanged from before this prop existed.
   */
  kind?: InstitutionMarkKind;
  className?: string;
}

const SIZE_BOX_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "h-7 w-7",
  md: "h-12 w-12",
};

/** Only `sm` gets a card shape today — `md` is AccountCard/CreditCardCard's
 * own square context, which has its own local (unrelated) InstitutionMark
 * and never passes `kind`. Landscape box, same area as the `sm` square
 * (~700px²) so a card row doesn't visibly grow next to an account row —
 * only the proportion changes. */
const CARD_SIZE_BOX_CLASSES: Partial<Record<InstitutionMarkSize, string>> = {
  sm: "h-[22px] w-8",
};

const SIZE_TEXT_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "text-[.6875rem]",
  md: "text-[1.0625rem]",
};

const TONE_CLASSES: Record<InstitutionMarkTone, string> = {
  petrol:
    "bg-[var(--lr-petrol-100)] text-[var(--lr-positive-on-tint)] dark:bg-[var(--lr-petrol-700)]/20 dark:text-[var(--lr-petrol-300)]",
  gold: "bg-[var(--lr-gold-100)] text-[var(--lr-gold-700)] dark:bg-[var(--lr-gold-700)]/20 dark:text-[var(--lr-gold-300)]",
};

/**
 * Institution logo chip: an image when `logoUrl` is set, otherwise a
 * brand-colored square with the name's initial. Factored out of
 * AccountCard's own local `InstitutionMark` (untouched — AccountCard is a
 * different screen, out of scope for this pass) so TransferPairCard and
 * the Timeline aside's per-account rows don't each reimplement the same
 * fallback rule (§6.4).
 */
const ICON_SIZE_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-6 w-6",
};

/** Cash/wallet accounts never have a real institution logo, so the `gold`
 * tone gets a banknote glyph instead of an initial — an initial reads as
 * "unknown institution", but cash isn't an institution at all. */
function CashIcon({ size }: { size: InstitutionMarkSize }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={ICON_SIZE_CLASSES[size]}
    >
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" strokeLinecap="round" />
    </svg>
  );
}

export function InstitutionMark({
  logoUrl,
  name,
  tone = "petrol",
  size = "md",
  kind,
  className = "",
}: InstitutionMarkProps) {
  const boxClass =
    kind === "card"
      ? (CARD_SIZE_BOX_CLASSES[size] ?? SIZE_BOX_CLASSES[size])
      : SIZE_BOX_CLASSES[size];
  // Decorative-only shape cue (aria-hidden below) — screen-reader users get
  // the same conta/cartão fact through this text instead. Only rendered
  // when a caller explicitly passes `kind`: call sites that don't (e.g.
  // TransferPairCard's legs, the Timeline aside's account list) haven't
  // been taught which one applies here, and asserting "Conta" by default
  // would be wrong for a card leg — silence beats a confident lie.
  const kindLabel =
    kind === "card" ? "Cartão" : kind === "account" ? "Conta" : undefined;

  if (logoUrl) {
    return (
      <span className="relative inline-flex flex-none">
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className={[
            "flex-none rounded-[var(--lr-r-md)] object-contain",
            boxClass,
            className,
          ].join(" ")}
        />
        {kindLabel ? <span className="sr-only">{kindLabel}</span> : null}
      </span>
    );
  }
  return (
    <span className="relative inline-flex flex-none">
      <span
        aria-hidden="true"
        className={[
          "flex flex-none items-center justify-center rounded-[var(--lr-r-md)] font-bold",
          boxClass,
          SIZE_TEXT_CLASSES[size],
          TONE_CLASSES[tone],
          className,
        ].join(" ")}
      >
        {tone === "gold" ? (
          <CashIcon size={size} />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      {kindLabel ? <span className="sr-only">{kindLabel}</span> : null}
    </span>
  );
}
