import { type InputHTMLAttributes, useEffect, useId, useRef } from "react";
import { CheckIcon } from "../shared/icons";

export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "size" | "checked"
  > {
  /** Visible label — every checkbox must have one; there is no label-less mode. */
  label: string;
  checked?: boolean;
  /**
   * "Some, not all" (e.g. a header checkbox for a partially-selected list).
   * Native `indeterminate` isn't a settable HTML attribute — React can only
   * apply it as a DOM property, so this is pushed onto the input via a ref.
   */
  indeterminate?: boolean;
  /**
   * Border-only error state (index.html id="selecao") — there is no message
   * slot here; compose with a nearby `Alert`/`FieldMessage` if one is needed.
   */
  error?: boolean;
}

/** Lurem's checkbox. A dumb, controlled component — `checked` and `indeterminate` are owned entirely by the caller. */
export function Checkbox({
  label,
  checked = false,
  indeterminate = false,
  disabled = false,
  error = false,
  id,
  className = "",
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const isFilled = checked || indeterminate;

  return (
    <label
      htmlFor={inputId}
      className={[
        "inline-flex items-start gap-2.5 text-[.9375rem] text-[var(--lr-text)]",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      ].join(" ")}
    >
      <span className="relative mt-px inline-flex h-5 w-5 flex-none">
        <input
          {...rest}
          ref={inputRef}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--lr-r-sm)] border transition-colors duration-150",
            isFilled
              ? "border-[var(--lr-night-900)] bg-[var(--lr-night-900)] dark:border-[var(--lr-night-700)] dark:bg-[var(--lr-night-700)]"
              : error
                ? "border-[var(--lr-negative)] bg-[var(--lr-surface)]"
                : "border-[var(--lr-night-300)] bg-[var(--lr-surface)]",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--lr-focus-ring)]",
          ].join(" ")}
        >
          {indeterminate ? (
            <span className="h-0.5 w-2.5 rounded-full bg-[var(--lr-ivory-000)]" />
          ) : checked ? (
            <CheckIcon
              strokeWidth={3}
              className="h-3 w-3 text-[var(--lr-ivory-000)]"
            />
          ) : null}
        </span>
      </span>
      {label}
    </label>
  );
}
