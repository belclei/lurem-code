// apps/web/src/routes/timeline/dateHelpers.ts
// Date/format helpers extracted from TimelinePage.tsx — Timeline-specific
// display logic (`formatDate` in packages/ui is scoped to dd/mm/aaaa only),
// not generic enough for the design system.
import type { CalendarRange } from "@lurem/ui";

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}`;
}

export function thisMonthRange(): CalendarRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

/** True when `range` is exactly the current calendar month — lets the
 * filter bar's trigger read "Este mês" (§3) instead of a raw date range
 * when the user hasn't touched the period filter from its default. */
export function isThisMonthRange(range: CalendarRange): boolean {
  if (!range.from || !range.to) return false;
  const expected = thisMonthRange();
  return (
    toYmd(range.from) === toYmd(expected.from as Date) &&
    toYmd(range.to) === toYmd(expected.to as Date)
  );
}

export function periodLabel(range: CalendarRange): string {
  if (!range.from) return "Período";
  if (isThisMonthRange(range)) return "Este mês";
  if (!range.to) return shortDate(range.from);
  return `${shortDate(range.from)} – ${shortDate(range.to)}`;
}

/** Header greeting (§6.12) — time-of-day salutation + full pt-BR date,
 * both derived from the same `now` so they can't disagree (e.g. greeting
 * says "Boa noite" off a stale render while the date already rolled over). */
export function greetingAndDate(): { greeting: string; dateLabel: string } {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const rawDateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  // toLocaleDateString's pt-BR weekday/month names come back lowercase
  // ("quinta-feira, 01 de agosto de 2026") — capitalize just the leading
  // letter, not every word (a blanket `capitalize` class would also
  // uppercase "de" mid-string, which isn't correct Portuguese).
  const dateLabel =
    rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);

  return { greeting, dateLabel };
}

export function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

export function isToday(dateYmd: string): boolean {
  return dateYmd === todayYmd();
}

export function dayOfWeek(dateYmd: string): string {
  // Fixed-width "YYYY-MM-DD" (en-CA locale format, same as todayYmd()) —
  // slice() avoids noUncheckedIndexedAccess noise from array destructuring.
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  const date = new Date(year, month - 1, day);
  const long = date.toLocaleDateString("pt-BR", { weekday: "long" });
  // "terça-feira" → "Terça" (TIMELINE.md §5.1's own example). Intl's
  // pt-BR "long" weekday always appends "-feira" except sábado/domingo,
  // which have none — splitting on "-" and keeping the first segment
  // handles both uniformly instead of a 7-entry lookup table.
  const firstWord = long.split("-")[0] as string;
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

/** "21 de julho" (day + full month, no year) — TIMELINE.md §5.1's day
 * header. */
export function longDayMonth(dateYmd: string): string {
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

export const GOOGLE_PLACEHOLDER_BIRTH_DATE = "1970-01-01";

/** True when `dateYmd` falls in the 7-day run-up to `birthDate`'s next
 * anniversary (inclusive of the day itself) — compares month/day only, so
 * the year on `birthDate` (and any year mismatch between the two) never
 * matters. Checks both "this year" and "next year" candidates for the
 * anniversary so a birthday in early January still lights up during the
 * last week of December. `birthDate` is the Google-signup placeholder
 * (`apps/api/src/auth/routes.ts`) for accounts that never filled in a real
 * one — never treated as a real birthday. */
export function isBirthdayWindow(dateYmd: string, birthDate: string): boolean {
  const iso = birthDate.slice(0, 10);
  if (!iso || iso === GOOGLE_PLACEHOLDER_BIRTH_DATE) return false;
  const birthMonth = Number(iso.slice(5, 7));
  const birthDay = Number(iso.slice(8, 10));
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  const current = new Date(year, month - 1, day);
  for (const candidateYear of [year, year + 1]) {
    const anniversary = new Date(candidateYear, birthMonth - 1, birthDay);
    const diffDays = Math.round(
      (anniversary.getTime() - current.getTime()) / 86_400_000,
    );
    if (diffDays >= 0 && diffDays <= 7) return true;
  }
  return false;
}
