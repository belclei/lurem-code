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
  dueDate,
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
export function findOpenInvoiceMonth(
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

export interface NextInvoiceMilestones {
  nextClosingDate: Date;
  /** (year, month) index whose `sumCardTransactionsForInvoiceMonth` total matches `nextClosingDate` — the period that is about to close. */
  nextClosingMonth: { year: number; month: number };
  nextDueDate: Date;
  /** (year, month) index whose `sumCardTransactionsForInvoiceMonth` total matches `nextDueDate` — NOT necessarily the calendar month `nextDueDate` falls in (dueDate can land in the month after its own index, see dates.ts). */
  nextDueMonth: { year: number; month: number };
}

/**
 * Next occurrence of "invoice closes" / "invoice becomes due" for a card,
 * strictly after `asOf` — feeds the Timeline's future-day projection
 * (aggregate.ts's `synthesizeStructuralDates`), which needs to show these
 * dates before invoice-events-job.ts fires the real `card.invoice_closed`/
 * `card.invoice_due` DomainEvent on the day itself. Reuses the same
 * closing/open-month resolution this file already does for `usedCents` —
 * no second date-math implementation.
 *
 * `nextClosingDate` = closingDate of the currently open period
 * (`findOpenInvoiceMonth` already guarantees this is strictly in the
 * future — see its own doc comment). `nextDueDate` = the due date closest
 * to `asOf`: the already-closed invoice's due date when one is awaiting
 * payment (nearer), otherwise the open period's own due date (which only
 * happens after `nextClosingDate`).
 */
export function nextInvoiceMilestones(
  card: CreditCardLike,
  asOf: Date = new Date(),
): NextInvoiceMilestones {
  const today = todayAsDate(asOf);
  const closedMonth = findClosedNotDueInvoiceMonth(card, today);
  const openMonth = findOpenInvoiceMonth(card, today);

  const nextDueMonth = closedMonth ?? openMonth;

  return {
    nextClosingDate: closingDate(card, openMonth.year, openMonth.month),
    nextClosingMonth: openMonth,
    nextDueDate: dueDate(card, nextDueMonth.year, nextDueMonth.month),
    nextDueMonth,
  };
}
