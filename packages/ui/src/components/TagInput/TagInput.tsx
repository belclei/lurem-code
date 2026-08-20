import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { Badge } from "../Badge/Badge";

export interface TagInputProps {
  /** Visible label — every field must have one, same rule as Input/Select. */
  label: string;
  /** Current tag names (free-form, always lowercase — see § tags spec). Controlled by the caller. */
  value: string[];
  onChange: (names: string[]) => void;
  /** The user's existing tag vocabulary, for autocomplete — not a closed list, just suggestions. */
  suggestions?: string[];
  hint?: string;
  disabled?: boolean;
  id?: string;
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Lurem's free-form #tag input (§ tags spec): removable chips (reusing
 * Badge's own onRemove affordance, same pattern already used for
 * AI-suggested category chips) + a text field that autocompletes against
 * the user's existing tag vocabulary but never forces a choice from it —
 * typing an unseen name and confirming (Enter/comma) creates it inline.
 */
export function TagInput({
  label,
  value,
  onChange,
  suggestions = [],
  hint,
  disabled = false,
  id,
}: TagInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const listId = `${inputId}-listbox`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filteredSuggestions = useMemo(() => {
    const q = normalize(query);
    return suggestions
      .filter((name) => !value.includes(name))
      .filter((name) => (q.length > 0 ? name.includes(q) : true))
      .slice(0, 8);
  }, [suggestions, value, query]);

  function addTag(raw: string) {
    const name = normalize(raw);
    if (name.length === 0 || value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
  }

  function removeTag(name: string) {
    onChange(value.filter((t) => t !== name));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (query.length > 0) addTag(query);
      return;
    }
    // Backspace on an empty field removes the last chip — same "editing the
    // list itself" affordance every chip-input pattern (email recipients,
    // etc.) already gives users, no extra click required.
    if (event.key === "Backspace" && query.length === 0 && value.length > 0) {
      removeTag(value[value.length - 1] as string);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={inputId}
        className="text-[.9375rem] font-medium text-[var(--lr-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <div
          className={[
            "flex min-h-11 flex-wrap items-center gap-1.5 rounded-[var(--lr-r-md)] border px-2.5 py-1.5",
            "bg-[var(--lr-surface)] transition-colors duration-150",
            "border-[var(--lr-border)] focus-within:border-[var(--lr-night-300)]",
            disabled ? "bg-[var(--lr-surface-sunken)] opacity-60" : "",
          ].join(" ")}
        >
          {value.map((name) => (
            <Badge
              key={name}
              kind="category"
              color="ink"
              onRemove={disabled ? undefined : () => removeTag(name)}
              removeLabel={`Remover tag #${name}`}
            >
              #{name}
            </Badge>
          ))}
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={hint ? hintId : undefined}
            autoComplete="off"
            disabled={disabled}
            placeholder={value.length === 0 ? "#tag" : ""}
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Confirms a half-typed tag on blur too — losing focus
              // shouldn't silently discard text the user already typed.
              if (query.length > 0) addTag(query);
              setOpen(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-[6rem] flex-1 bg-transparent text-[.9375rem] text-[var(--lr-text)] outline-none placeholder:text-[var(--lr-text-secondary)]"
          />
        </div>

        {open && filteredSuggestions.length > 0 ? (
          // Same floating-listbox pattern as Select.tsx (see its own comment):
          // real focus stays on the <input> above, this panel is reached via
          // aria-controls/aria-activedescendant-style interaction, not tab order.
          <div
            id={listId}
            // biome-ignore lint/a11y/useSemanticElements: a native <select>/<option> can't be styled as a floating searchable panel
            role="listbox"
            aria-label={`Tags sugeridas para ${label}`}
            tabIndex={-1}
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] py-1 shadow-[var(--lr-e2)]"
          >
            {filteredSuggestions.map((name) => (
              <div
                key={name}
                // biome-ignore lint/a11y/useSemanticElements: same floating-listbox rationale as Select.tsx
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(name);
                }}
                className="cursor-pointer px-3.5 py-2 text-[.9375rem] text-[var(--lr-text)] hover:bg-[var(--lr-surface-sunken)]"
              >
                #{name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {hint ? (
        <p
          id={hintId}
          className="text-[.8125rem] text-[var(--lr-text-secondary)]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
