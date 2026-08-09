import { type FocusEvent, useId, useRef, useState } from "react";
import { Calendar } from "../Calendar/Calendar";
import { FieldMessage } from "../shared/FieldMessage";
import { formatDate } from "../shared/formatDate";

export interface DateFieldProps {
  /** Visible label — every field must have one; there is no `placeholder`-only mode. */
  label: string;
  /** ISO `AAAA-MM-DD`, or `""` for no selection. Controlled by the caller. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
}

function parseIsoLocal(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const CALENDAR_ICON = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4"
  >
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" strokeLinecap="round" />
  </svg>
);

/**
 * Date field: an `Input`-styled trigger that opens a single-date `Calendar`
 * in an absolute-positioned panel — same open/close idiom as `Select`'s
 * listbox (ref + onBlur checking `relatedTarget`, no portal; this codebase
 * has no portal anywhere, see `Select.tsx`/`AffixMenu.tsx`). Replaces the
 * free-text `Input type="text" hint="AAAA-MM-DD"` pattern used for every
 * date field before this component existed.
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  disabled = false,
  required,
  id,
  placeholder = "Selecione uma data",
  className = "",
}: DateFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const hasError = Boolean(error);

  const [open, setOpen] = useState(false);
  const selected = parseIsoLocal(value);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div className="grid gap-1.5" ref={containerRef} onBlur={handleBlur}>
      <label
        htmlFor={fieldId}
        className="text-[.9375rem] font-medium text-[var(--lr-text)]"
      >
        {label}
        {required ? (
          <span className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div className="relative">
        <button
          id={fieldId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          onClick={() => setOpen((current) => !current)}
          className={[
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--lr-r-md)] px-3.5 text-[.9375rem]",
            "bg-[var(--lr-surface)] text-left transition-colors duration-150",
            value ? "text-[var(--lr-text)]" : "text-[var(--lr-text-secondary)]",
            "border",
            "disabled:bg-[var(--lr-surface-sunken)] disabled:text-[var(--lr-text-secondary)]",
            "disabled:cursor-not-allowed disabled:pointer-events-none",
            hasError
              ? "border-[var(--lr-negative)]"
              : open
                ? "border-[var(--lr-night-300)]"
                : "border-[var(--lr-border)] hover:border-[var(--lr-night-300)]",
            className,
          ].join(" ")}
        >
          {value ? formatDate(value) : placeholder}
          <span
            aria-hidden="true"
            className="flex-none text-[var(--lr-text-secondary)]"
          >
            {CALENDAR_ICON}
          </span>
        </button>

        {open ? (
          <Calendar
            className="absolute z-10 mt-1.5"
            label={label}
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(next) => {
              const date = next as Date;
              onChange(toIso(date));
              setMonth(date);
              setOpen(false);
            }}
          />
        ) : null}
      </div>
      <FieldMessage
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
      />
    </div>
  );
}
