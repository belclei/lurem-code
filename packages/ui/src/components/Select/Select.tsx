import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { FieldMessage } from "../shared/FieldMessage";
import { ChevronDownIcon } from "../shared/icons";

export interface SelectOption {
  value: string;
  label: string;
  /** Leading icon (index.html id="select": each category item in the open menu carries one). Always rendered `aria-hidden` — `label` is the accessible name. */
  icon?: ReactNode;
  /** Renders per `.hmc-menu__item.is-disabled` (index.html id="select", "Investimentos (em breve)"): dimmed, unreachable by click or keyboard. */
  disabled?: boolean;
}

/**
 * A non-selectable divider between groups of options (index.html id="select",
 * `.hmc-menu__sep`). Purely visual — rendered `aria-hidden` rather than given
 * an ARIA role, since `role="separator"` isn't a valid child of `role="listbox"`
 * (only `option`/`group` are) and this component's listbox is real ARIA, not decorative.
 */
export interface SelectSeparator {
  separator: true;
}

export type SelectItem = SelectOption | SelectSeparator;

function isSeparator(item: SelectItem): item is SelectSeparator {
  return "separator" in item && item.separator === true;
}

export interface SelectProps {
  /** Visible label — every select must have one. */
  label: string;
  options: SelectItem[];
  /** Currently selected value, or `null`/`undefined` for none. Controlled by the caller. */
  value?: string | null;
  /** Called with the newly chosen option's value. This component never owns the selection. */
  onChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  /** Copy shown when the search query matches nothing. */
  emptyMessage?: string;
  /** Starts the listbox open — exists only to make the "open" state reachable in Storybook/tests. */
  defaultOpen?: boolean;
}

/**
 * Lurem's searchable dropdown (combobox pattern, WAI-ARIA 1.2). Open/closed
 * and the search query are local UI state, not business logic: the component
 * never decides *what* the options are or what selecting one means.
 */
export function Select({
  label,
  options,
  value = null,
  onChange,
  placeholder = "Selecione…",
  hint,
  error,
  disabled = false,
  id,
  emptyMessage = "Nenhuma opção encontrada",
  defaultOpen = false,
}: SelectProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-listbox`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;

  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectableOptions = useMemo(
    () => options.filter((item): item is SelectOption => !isSeparator(item)),
    [options],
  );
  const selectedOption =
    selectableOptions.find((o) => o.value === value) ?? null;
  const hasError = Boolean(error);

  const filteredItems = useMemo(() => {
    if (!query) return options;
    const q = query.toLocaleLowerCase("pt-BR");
    return options.filter(
      (item) =>
        isSeparator(item) || item.label.toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [options, query]);

  // Keyboard nav and aria-activedescendant only ever target selectable
  // (non-separator, non-disabled) options — index.html id="select": a
  // disabled item ("Investimentos (em breve)") is unreachable by keyboard,
  // same as it is by click.
  const navigableOptions = useMemo(
    () =>
      filteredItems.filter(
        (item): item is SelectOption => !isSeparator(item) && !item.disabled,
      ),
    [filteredItems],
  );

  function commit(optionValue: string) {
    onChange?.(optionValue);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else
          setHighlighted((h) =>
            Math.min(h + 1, Math.max(navigableOptions.length - 1, 0)),
          );
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case "Enter": {
        const target = navigableOptions[highlighted];
        event.preventDefault();
        if (open && target) commit(target.value);
        else setOpen(true);
        break;
      }
      case "Escape":
        setOpen(false);
        setQuery("");
        break;
      default:
        break;
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
      setQuery("");
    }
  }

  const activeOption = open ? navigableOptions[highlighted] : undefined;

  return (
    <div className="grid gap-1.5" ref={containerRef} onBlur={handleBlur}>
      <label
        htmlFor={inputId}
        className="text-[.9375rem] font-medium text-[var(--lr-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeOption ? `${baseId}-opt-${activeOption.value}` : undefined
          }
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : (selectedOption?.label ?? "")}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={[
            "w-full min-h-11 rounded-[var(--lr-r-md)] pr-9 text-[.9375rem]",
            selectedOption?.icon ? "pl-12" : "pl-3.5",
            "bg-[var(--lr-surface)] text-[var(--lr-text)] border transition-colors duration-150",
            "placeholder:text-[var(--lr-text-secondary)]",
            "disabled:bg-[var(--lr-surface-sunken)] disabled:text-[var(--lr-text-secondary)]",
            "disabled:cursor-not-allowed disabled:pointer-events-none",
            hasError
              ? "border-[var(--lr-negative)]"
              : open
                ? "border-[var(--lr-night-300)]"
                : "border-[var(--lr-border)] hover:border-[var(--lr-night-300)]",
          ].join(" ")}
        />
        {selectedOption?.icon && !open ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 inline-flex h-[24px] w-[24px] flex-none -translate-y-1/2 overflow-hidden rounded-[var(--lr-r-sm)] text-[var(--lr-petrol-700)] dark:text-[var(--lr-petrol-300)] [&>svg]:h-full [&>svg]:w-full"
          >
            {selectedOption.icon}
          </span>
        ) : null}
        <ChevronDownIcon
          className={[
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lr-text-secondary)]",
            "transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        />

        {open ? (
          // This is the WAI-ARIA 1.2 "editable combobox with list autocomplete"
          // pattern (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
          // <div role="listbox">/<div role="option"> (not <ul>/<li> — those
          // carry list semantics that don't match "listbox" either, and
          // trip Biome's noNoninteractiveElementToInteractiveRole the same
          // way a heading would) is intentional, and real DOM focus
          // intentionally never leaves the <input> above — aria-activedescendant
          // is how the highlighted option is communicated to assistive tech,
          // not tabIndex on each option. useSemanticElements' suggestion of a
          // native <select> doesn't apply: <option> can't be styled or
          // positioned as a floating, searchable panel. Verified with
          // axe-core (zero violations) and manual keyboard testing
          // (Arrow/Enter/Escape) — see Sprint 1′ report.
          <div
            id={listId}
            // biome-ignore lint/a11y/useSemanticElements: a native <select>/<option> can't be styled as a floating searchable listbox
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            className={[
              "absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-[var(--lr-r-md)]",
              "border border-[var(--lr-border)] bg-[var(--lr-surface)] py-1 shadow-[var(--lr-e2)]",
            ].join(" ")}
          >
            {navigableOptions.length === 0 ? (
              <div className="px-3.5 py-2 text-sm text-[var(--lr-text-secondary)]">
                {emptyMessage}
              </div>
            ) : (
              filteredItems.map((item, itemIndex) => {
                if (isSeparator(item)) {
                  // index.html id="select", `.hmc-menu__sep`: a pure visual
                  // divider — aria-hidden rather than role="separator",
                  // which isn't a valid child of role="listbox".
                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: separators carry no identity of their own
                      key={`sep-${itemIndex}`}
                      aria-hidden="true"
                      className="my-1.5 h-px bg-[var(--lr-border)]"
                    />
                  );
                }

                const option = item;
                const isSelected = option.value === value;
                const isHighlighted = activeOption?.value === option.value;
                const navIndex = navigableOptions.indexOf(option);

                return (
                  <div
                    key={option.value}
                    id={`${baseId}-opt-${option.value}`}
                    // biome-ignore lint/a11y/useSemanticElements: a native <option> can't be styled/positioned inside this floating panel
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (option.disabled) return;
                      commit(option.value);
                    }}
                    onMouseEnter={() => {
                      if (option.disabled) return;
                      setHighlighted(navIndex);
                    }}
                    className={[
                      "flex items-center gap-2.5 px-3.5 py-2 text-[.9375rem]",
                      option.disabled
                        ? "pointer-events-none opacity-45"
                        : "cursor-pointer",
                      // index.html id="select": selected keeps its blue-100
                      // wash even while highlighted (the reference's CSS
                      // declares `.is-selected` after `.is-highlighted`, so
                      // it wins) — highlighted-only gets the plain sunken hover tint.
                      // REBRAND (Task 1.3): blue-100/700 -> petrol-100/700 —
                      // DESIGN_SYSTEM.md §1.2 explicitly lists "componentes
                      // selecionados" as a Petrol application, so this one is
                      // spec-backed, not an open product question (unlike the
                      // blue->graphite info/link sites elsewhere in this rebrand).
                      isSelected
                        ? "bg-[var(--lr-petrol-100)] font-bold text-[var(--lr-text)] dark:bg-[var(--lr-petrol-700)]/30"
                        : isHighlighted
                          ? "bg-[var(--lr-surface-sunken)] text-[var(--lr-text)]"
                          : "text-[var(--lr-text)]",
                    ].join(" ")}
                  >
                    {option.icon ? (
                      <span
                        aria-hidden="true"
                        className="inline-flex h-[24px] w-[24px] flex-none overflow-hidden rounded-[var(--lr-r-sm)] text-[var(--lr-petrol-700)] dark:text-[var(--lr-petrol-300)] [&>svg]:h-full [&>svg]:w-full"
                      >
                        {option.icon}
                      </span>
                    ) : null}
                    {option.label}
                  </div>
                );
              })
            )}
          </div>
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
