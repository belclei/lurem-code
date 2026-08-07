// apps/web/src/lib/money.ts
// Shared by every create/edit form that collects a reais amount from a text
// field (TransactionsPage, AccountsPage, TimelinePage's wallet activation
// card) — money math itself stays backend-only (§0), this is just the
// text-input parsing step before a value ever reaches the API.

/** Normalizes a pt-BR money string to a plain numeric string ("1234.56").
 * pt-BR convention is comma-as-decimal, period-as-thousands ("1.200,00"),
 * but a numpad's decimal key emits "." even under a pt-BR OS/keyboard
 * layout — so with no comma present, a single period followed by 1-2
 * digits ("1000.5", "1000.50") is read as a decimal point rather than
 * thousands grouping. A period followed by exactly 3 digits ("1.200") is
 * still grouping, since a reais amount never carries 3 decimal places. */
function normalizeReais(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes(",")) {
    return trimmed.replace(/\./g, "").replace(",", ".");
  }
  if (/^\d+\.\d{1,2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/\./g, "");
}

/** "1.200,00" / "1200.00" / "1000.50" (numpad decimal) → 120000 centavos.
 * null if not a valid number > 0 — for fields where zero/blank isn't a
 * legitimate value (a transaction's amount, a card's limit). */
export function reaisToCentsPositive(input: string): number | null {
  const value = Number(normalizeReais(input));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** Same parsing, but blank/zero is legitimate (an opening balance or overdraft limit can genuinely be R$ 0) — blank input resolves to 0 rather than an error. */
export function reaisToCentsOrZero(input: string): number | null {
  if (!input.trim()) return 0;
  const value = Number(normalizeReais(input));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
