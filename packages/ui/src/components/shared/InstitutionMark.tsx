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
   * Distinguishes a bank account from a credit card. A landscape-vs-square
   * box shape was tried first and dropped (2026-08): most institution SVGs
   * already sit on their own internal padding/aspect ratio, so squeezing
   * the box into a landscape shape barely changed what rendered — account
   * and card marks kept reading as identical. This instead pins a small
   * glyph badge to the mark's corner, which stays legible regardless of
   * the logo's own shape since it sits outside the logo's bounds entirely.
   */
  kind?: InstitutionMarkKind;
  className?: string;
}

const SIZE_BOX_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "h-7 w-7",
  md: "h-12 w-12",
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

const BADGE_SIZE_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
};

const BADGE_GLYPH_SIZE_CLASSES: Record<InstitutionMarkSize, string> = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
};

/** Physical-card glyph: body + a filled stripe near the top, the same
 * silhouette every card icon collapses to once it's small — legible even
 * at the badge's ~10px rendered size, unlike a thin outline would be. */
function CardGlyph({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
      />
      <rect x="2" y="9" width="20" height="3.5" fill="currentColor" />
    </svg>
  );
}

/** Bank glyph: roof + base, the classic "conta" pictogram — pairs with
 * `CardGlyph` so the two read as an opposed pair, not "marked vs. unmarked". */
function AccountGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4.5 9.5v9M19.5 9.5v9" />
      <path d="M2.5 19.5h19" />
    </svg>
  );
}

/** Corner badge marking a mark as an account or card leg — see `kind`'s
 * doc for why this replaced the earlier box-shape approach. Sits outside
 * the mark's own box (overlapping the corner) with a solid ring so it
 * stays readable against any logo, and duplicates the sr-only label as
 * its own accessible name in case the mark's img alt ever changes. */
function KindBadge({
  kind,
  size,
}: { kind: InstitutionMarkKind; size: InstitutionMarkSize }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "absolute -bottom-1 -right-1 flex flex-none items-center justify-center rounded-[var(--lr-r-full)] ring-2 ring-[var(--lr-surface)]",
        BADGE_SIZE_CLASSES[size],
        "bg-[var(--lr-night-900)] text-[var(--lr-ivory-000)] dark:bg-[var(--lr-night-700)]",
      ].join(" ")}
    >
      {kind === "card" ? (
        <CardGlyph className={BADGE_GLYPH_SIZE_CLASSES[size]} />
      ) : (
        <AccountGlyph className={BADGE_GLYPH_SIZE_CLASSES[size]} />
      )}
    </span>
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
  const boxClass = SIZE_BOX_CLASSES[size];
  // Screen-reader users get the same conta/cartão fact via this text —
  // the badge itself is aria-hidden. Only rendered when a caller
  // explicitly passes `kind`: call sites that don't (e.g. TransferPairCard's
  // legs, the Timeline aside's account list) haven't been taught which one
  // applies here, and asserting "Conta" by default would be wrong for a
  // card leg — silence beats a confident lie.
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
        {kind ? <KindBadge kind={kind} size={size} /> : null}
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
      {kind ? <KindBadge kind={kind} size={size} /> : null}
      {kindLabel ? <span className="sr-only">{kindLabel}</span> : null}
    </span>
  );
}
