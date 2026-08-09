import type { ReactNode } from "react";
import { Button } from "../Button/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "../shared/icons";

export type CalendarMode = "single" | "range";
export type CalendarDayStatus = "real" | "scheduled";
export interface CalendarRange {
  from?: Date;
  to?: Date;
}

export interface CalendarProps {
  /** Accessible name for the day grid (e.g. "Selecione uma data"). */
  label: string;
  mode?: CalendarMode;
  /** Any Date within the currently displayed month — controlled by the caller alongside `onMonthChange`, so "next/prev month" has no hidden state here. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** `mode="single"`: a `Date` or `null`. `mode="range"`: `{ from, to }`. */
  selected?: Date | CalendarRange | null;
  onSelect?: (value: Date | CalendarRange) => void;
  /**
   * Which days carry the "has movement" dot, and whether it's confirmed or
   * scheduled (index.html id="calendario": "cheio é transação real, vazado
   * com traço é agendada" — the same real/estimate distinction the rest of
   * the system never blurs). The calendar never shows amounts, only "when".
   */
  dayStatus?: (date: Date) => CalendarDayStatus | undefined;
  isDisabled?: (date: Date) => boolean;
  today?: Date;
  /** e.g. "Hoje"/"Limpar" or "Este mês"/"Últimos 90 dias" — supplied via composition (`Button`), never hardcoded here. */
  footer?: ReactNode;
  className?: string;
}

const WEEKDAY_LABELS = ["d", "s", "t", "q", "q", "s", "s"];
const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildMonthGrid(month: Date): Date[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function isBetween(date: Date, from?: Date, to?: Date): boolean {
  if (!from || !to) return false;
  return date > from && date < to;
}

function formatDayLabel(date: Date, isToday: boolean): string {
  const label = `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
  return isToday ? `${label}, hoje` : label;
}

/**
 * Lurem's calendar (index.html id="calendario", origin react-day-picker).
 * Locale pt-BR only (week starts Sunday, lowercase names, no i18n
 * abstraction — this product has no other locale, see PRODUCT.md). A dumb,
 * controlled component: `month` and `selected` are both owned by the
 * caller; `dayStatus`/`isDisabled` are pure callbacks, never a business rule
 * computed in here.
 *
 * Known gap: days are independently tabbable buttons (fully operable via
 * Tab/Enter) but this does not implement the full APG "date picker grid"
 * 2D arrow-key roving-tabindex pattern — flagged rather than silently
 * skipped.
 */
export function Calendar({
  label,
  mode = "single",
  month,
  onMonthChange,
  selected,
  onSelect,
  dayStatus,
  isDisabled,
  today = new Date(),
  footer,
  className = "",
}: CalendarProps) {
  const grid = buildMonthGrid(month);
  const todayStart = startOfDay(today);
  const selectedSingle = mode === "single" ? (selected as Date | null) : null;
  const selectedRange =
    mode === "range" ? ((selected as CalendarRange | null) ?? {}) : {};

  function handleDayClick(date: Date) {
    if (isDisabled?.(date)) return;
    if (mode === "single") {
      onSelect?.(date);
      return;
    }
    if (!selectedRange.from || (selectedRange.from && selectedRange.to)) {
      onSelect?.({ from: date, to: undefined });
    } else {
      const { from } = selectedRange;
      onSelect?.(date < from ? { from: date, to: from } : { from, to: date });
    }
  }

  return (
    <div
      className={[
        "w-[300px] rounded-[var(--lr-r-md)] border border-[var(--lr-border)]",
        "bg-[var(--lr-surface)] p-[var(--lr-s2)] shadow-[var(--lr-e2)]",
        className,
      ].join(" ")}
    >
      <div className="mb-[var(--lr-s2)] flex items-center justify-between">
        <Button
          variant="tertiary"
          size="sm"
          icon={<ChevronLeftIcon />}
          aria-label="Mês anterior"
          onClick={() => onMonthChange(addMonths(month, -1))}
        />
        <span className="font-mono text-[.875rem] text-[var(--lr-text)]">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <Button
          variant="tertiary"
          size="sm"
          icon={<ChevronRightIcon />}
          aria-label="Próximo mês"
          onClick={() => onMonthChange(addMonths(month, 1))}
        />
      </div>

      <div
        // biome-ignore lint/a11y/useSemanticElements: a native <fieldset> groups form controls with a <legend>, not a day-grid widget — role="group" + aria-label is the correct APG substitute here
        role="group"
        aria-label={label}
        className="grid grid-cols-7 gap-0.5"
      >
        {WEEKDAY_LABELS.map((weekday, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-item static list, no identity beyond position
            key={index}
            aria-hidden="true"
            className="pb-1.5 text-center text-[.625rem] tracking-[.1em] text-[var(--lr-label)] uppercase"
          >
            {weekday}
          </span>
        ))}
        {grid.map((date) => {
          const outside = date.getMonth() !== month.getMonth();
          const isToday = isSameDay(date, todayStart);
          const isSelected = Boolean(
            mode === "single"
              ? selectedSingle && isSameDay(date, selectedSingle)
              : (selectedRange.from && isSameDay(date, selectedRange.from)) ||
                  (selectedRange.to && isSameDay(date, selectedRange.to)),
          );
          const isRangeStart = Boolean(
            mode === "range" &&
              selectedRange.from &&
              isSameDay(date, selectedRange.from),
          );
          const isRangeEnd = Boolean(
            mode === "range" &&
              selectedRange.to &&
              isSameDay(date, selectedRange.to),
          );
          const inRange =
            mode === "range" &&
            isBetween(date, selectedRange.from, selectedRange.to);
          const disabled = isDisabled?.(date) ?? false;
          const status = dayStatus?.(date);
          // Exactly one text-color utility per button: Tailwind gives
          // same-specificity utilities equal precedence, so the winner is
          // whichever lands last in the compiled stylesheet — not whichever
          // comes last in this class list. Stacking e.g. the default
          // text-[var(--lr-text)] alongside a conditional text-[var(--lr-ivory-000)]
          // let the base class silently win in the built CSS, which made
          // selected days (ink-900 bg) render their digit in --lr-text
          // (also ink-900) — invisible. Compute one winner up front instead.
          const textColorClass = disabled
            ? "text-[var(--lr-night-300)]"
            : isSelected
              ? "text-[var(--lr-ivory-000)]"
              : outside
                ? "text-[var(--lr-night-300)]"
                : "text-[var(--lr-text)]";

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => handleDayClick(date)}
              aria-label={formatDayLabel(date, isToday)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={[
                "relative aspect-square min-h-9 cursor-pointer border border-transparent",
                "font-mono text-[.8125rem] transition-colors duration-150",
                textColorClass,
                isSelected || inRange
                  ? ""
                  : "hover:bg-[var(--lr-surface-sunken)]",
                isToday ? "border-[var(--lr-gold-600)]" : "",
                // REBRAND (Task 1.3): blue-100/700 -> petrol-100/700, same
                // DESIGN_SYSTEM.md §1.2 "componentes selecionados" -> Petrol
                // spec basis as Select.tsx's selected-item treatment.
                inRange
                  ? "rounded-none bg-[var(--lr-petrol-100)] dark:bg-[var(--lr-petrol-700)]/30"
                  : "rounded-[var(--lr-r-sm)]",
                isRangeStart ? "rounded-r-none" : "",
                isRangeEnd ? "rounded-l-none" : "",
                // dark:bg-ink-700 alone measures 1.29:1 against this card's
                // --lr-surface (ink-800) — Button's primary variant made the
                // same ink-900→ink-700 dark-mode step, but that one sits
                // directly on --lr-bg (ink-900 page), not a --lr-surface
                // card, so its fill/background gap survives. The border
                // gives the same 3:1 boundary Card/Dialog/Sheet already lean
                // on for definition against --lr-surface, without touching
                // the fill (bone-000 text on ink-700 is already 10.7:1, no
                // need to trade that away for a lighter fill).
                isSelected
                  ? "bg-[var(--lr-night-900)] dark:border-[var(--lr-night-500)] dark:bg-[var(--lr-night-700)]"
                  : "",
                disabled ? "cursor-not-allowed hover:bg-transparent" : "",
              ].join(" ")}
            >
              {date.getDate()}
              {status ? (
                <span
                  aria-hidden="true"
                  className={[
                    "absolute bottom-[5px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                    status === "scheduled"
                      ? isSelected
                        ? "border border-[var(--lr-ivory-000)] bg-transparent"
                        : "border border-[var(--lr-estimate)] bg-transparent"
                      : isSelected
                        ? "bg-[var(--lr-ivory-000)]"
                        : "bg-[var(--lr-night-600)]",
                  ].join(" ")}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {footer ? (
        <div className="mt-[var(--lr-s2)] flex gap-2 border-t border-[var(--lr-border)] pt-[var(--lr-s2)]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
