/**
 * Small, purely-decorative svgs that used to be duplicated inline across
 * multiple components. Each one is `aria-hidden` — never a component's own
 * accessible name — so composing them is just visual, no a11y contract.
 */

export interface IconProps {
  className?: string;
}

/** Disclosure chevron (Select's combobox, AffixMenu's menu button,
 * TransactionRow's installment expander, Timeline's FilterPopover) — same
 * path (`fillRule="evenodd"`, viewBox 20×20, fill=currentColor) in all four,
 * previously copy-pasted rather than shared. Caller controls size/rotation
 * via `className` (e.g. `"h-3.5 w-3.5 rotate-180"` when open). */
export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Rounded-glyph close/dismiss icon — Alert's own close button. Kept
 * separate from Badge's thinner stroke-based X (`CloseIconThin` below):
 * they're visually distinct styles tuned for their own component, not a
 * true duplicate — unifying their look is a design decision this pass
 * doesn't make on its own. */
export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

/** Thin stroke-based close/remove X — Badge's own icon, distinct from Alert's `CloseIcon` (see its comment). */
export function CloseIconThin({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Plus/add icon — "Nova transação" button. */
export function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Upload/import icon — "Importar transações" button. */
export function UploadIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  );
}

/** Bidirectional transfer arrows — TransferPairCard's header. */
export function TransferIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M7 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h10m-10 12h10a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1M7 5l-3 3m3-3l3 3m10 6l-3-3m3 3l-3-3" />
    </svg>
  );
}

/** Checkmark — Checkbox's checked state. */
export function CheckIcon({
  className = "h-4 w-4",
  strokeWidth = 2,
}: IconProps & { strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/** Left/right chevrons — Calendar's month navigation. */
export function ChevronLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Eye/eye-off toggle — Timeline's per-account visibility filter. */
export function EyeIcon({
  open,
  className = "h-4 w-4",
}: IconProps & { open: boolean }) {
  return open ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
    >
      <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.9 15.9 0 0 1-4.1 4.9M6.3 6.3A15.6 15.6 0 0 0 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4.6-1" />
      <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1" />
    </svg>
  );
}
