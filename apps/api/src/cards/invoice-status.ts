// apps/api/src/cards/invoice-status.ts
// ARQUITETURA.md §6.4 — "uso do limite" = fatura fechada (aguardando
// vencimento) + fatura aberta (ciclo em andamento), somadas. packages/core
// only exposes the "closed, not yet due" invoice and a per-(year,month) sum —
// this file composes those two primitives to find the *currently open*
// invoice month; it invents no money math of its own (§0: core is the only
// place amounts get computed).
import {
  closingDate,
  compareDates,
  faturaFechadaNaoVencida,
  findClosedNotDueInvoiceMonth,
  sumCardTransactionsForInvoiceMonth,
  todayAsDate,
} from "@lurem/core";
import type { CreditCardLike, Money, TransactionLike } from "@lurem/domain";

export interface CardInvoiceStatus {
  usedCents: number;
  invoiceStatus: "open" | "closed_awaiting_payment";
}

function nextYearMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

/**
 * The period whose closing date has not happened yet — always exactly one.
 *
 * Strictly-after (`> 0`, not `>= 0`): `faturaPeriodo`'s window is
 * `(previous closing, this closing]` — inclusive of the closing date itself
 * (invoice.ts). So on the closing day, that period is already closed (and
 * `findClosedNotDueInvoiceMonth` picks it up) — treating it as still "open"
 * here too double-counted every transaction dated on the closing day itself
 * (once via the closed sum, once via the open sum).
 */
function findOpenInvoiceMonth(
  card: CreditCardLike,
  today: Date,
): { year: number; month: number } {
  const base = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const candidates = [base, nextYearMonth(base.year, base.month)];
  for (const candidate of candidates) {
    if (
      compareDates(closingDate(card, candidate.year, candidate.month), today) >
      0
    ) {
      return candidate;
    }
  }
  return nextYearMonth(base.year, base.month);
}

export function cardInvoiceStatus(
  card: CreditCardLike,
  transactions: TransactionLike[],
  asOf: Date = new Date(),
): CardInvoiceStatus {
  const today = todayAsDate(asOf);
  const closedMonth = findClosedNotDueInvoiceMonth(card, today);
  const closed: Money = faturaFechadaNaoVencida({ card, transactions, asOf });

  const openMonth = findOpenInvoiceMonth(card, today);
  const open = sumCardTransactionsForInvoiceMonth(
    card,
    transactions,
    openMonth.year,
    openMonth.month,
  );

  return {
    usedCents: closed.valueCents + open.valueCents,
    invoiceStatus: closedMonth ? "closed_awaiting_payment" : "open",
  };
}
