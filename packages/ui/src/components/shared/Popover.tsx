import { type ReactNode, useRef } from "react";
import { ChevronDownIcon } from "./icons";

export interface PopoverProps {
  /** Accessible name for the trigger button. */
  label: string;
  /** Visible text on the trigger button. */
  triggerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Compact trigger-button + floating panel — same open/blur-to-close idiom
 * as `Select`/`AffixMenu` (ref + `onBlur` checking `relatedTarget`, no
 * portal), just without a search input: a plain button trigger for a
 * toolbar filter, not a combobox. Promoted out of TimelinePage's own
 * page-local `FilterPopover` — the pattern (trigger + absolute panel + a
 * chevron that rotates when open) has no Timeline-specific logic in it.
 */
export function Popover({
  label,
  triggerLabel,
  open,
  onOpenChange,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="relative"
      ref={ref}
      onBlur={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node)) {
          onOpenChange(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => onOpenChange(!open)}
        className={[
          "flex items-center gap-2 rounded-[var(--lr-r-md)] border px-3.5 py-2 text-[.875rem]",
          "bg-[var(--lr-surface)] text-[var(--lr-text)] transition-colors duration-150",
          open
            ? "border-[var(--lr-night-300)]"
            : "border-[var(--lr-border)] hover:border-[var(--lr-night-300)]",
        ].join(" ")}
      >
        {triggerLabel}
        <ChevronDownIcon
          className={[
            "h-3.5 w-3.5 flex-none text-[var(--lr-text-secondary)] transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1.5">{children}</div>
      ) : null}
    </div>
  );
}
