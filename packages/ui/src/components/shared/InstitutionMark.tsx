export type InstitutionMarkTone = "petrol" | "gold";
export type InstitutionMarkSize = "sm" | "md";

export interface InstitutionMarkProps {
  /** Logo image URL — absent renders the initial-in-brand-color fallback (same rule as AccountCard's own institution mark, §6.4). */
  logoUrl?: string;
  /** Used for the fallback initial and the image's accessible context. */
  name: string;
  /** `gold` is reserved for cash/wallet accounts (TIMELINE.md §6 — "carteira usa quadrado dourado"); every other institution uses the default `petrol`. */
  tone?: InstitutionMarkTone;
  /** `sm` (28px, `.hmc-inst--sm` in the design handoff) for inline rows — TransferPairCard's account legs, the Timeline aside's per-account rows. `md` (48px, the default) matches AccountCard's own square. */
  size?: InstitutionMarkSize;
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
export function InstitutionMark({
  logoUrl,
  name,
  tone = "petrol",
  size = "md",
  className = "",
}: InstitutionMarkProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className={[
          "flex-none rounded-[var(--lr-r-md)] object-contain",
          SIZE_BOX_CLASSES[size],
          className,
        ].join(" ")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={[
        "flex flex-none items-center justify-center rounded-[var(--lr-r-md)] font-bold",
        SIZE_BOX_CLASSES[size],
        SIZE_TEXT_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      ].join(" ")}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
