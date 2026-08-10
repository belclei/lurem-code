// IMPLEMENTACAO.md §3.4 — Fechamento e vencimento de fatura.
//
// issues.md ("Pagar agora"): uma transferência conta→cartão já é como o
// resto do app registra o pagamento de uma fatura (transactions/routes.ts,
// kind=transfer com toCreditCardId — "destino é outra conta ou um cartão
// (pagamento de fatura)") — não existe uma tabela de pagamento separada,
// então a perna "in" dessa transferência É o pagamento. Reduz o valor da
// fatura, simetricamente a income (estorno/refund). A perna "out" nunca
// aparece num cartão (não é possível transferir dinheiro para fora de um
// cartão de crédito) — se aparecer mesmo assim, é tratada como neutra (0),
// igual ao comportamento anterior a esta mudança.
//
// kind='income' (ex.: estorno/refund) reduz o valor da fatura, simetricamente
// a expense aumentando — trata a fatura como um mini-balanço a partir de zero
// (sem "saldo inicial").

import type {
  BreakdownLine,
  CreditCardLike,
  Money,
  TransactionLike,
} from "@lurem/domain";
import {
  closingDate,
  compareDates,
  dueDate,
  faturaPeriodo,
  todayAsDate,
} from "./dates.js";

export interface FaturaFechadaNaoVencidaParams {
  card: CreditCardLike;
  /** Transações já escopadas a este cartão. */
  transactions: TransactionLike[];
  asOf: Date;
}

function isWithinPeriod(
  date: Date,
  period: { start: Date; end: Date },
): boolean {
  // (start, end] — semiaberto: start excluído, end incluído.
  return (
    compareDates(date, period.start) > 0 && compareDates(date, period.end) <= 0
  );
}

function todayYearMonth(today: Date): { year: number; month: number } {
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

export function previousYearMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/**
 * Only income/expense/transfer-in count here — a transfer's "out" leg on a
 * card's own transaction list can't happen in practice (there's no way to
 * move money out of a credit card), but the type guard still excludes it
 * explicitly rather than falling through a `default: return 0` (which would
 * leave a branch structurally unreachable — §3 requires 100% coverage of
 * what's reachable, not of the impossible).
 */
function countsTowardInvoice(tx: TransactionLike): tx is TransactionLike & {
  kind: "income" | "expense" | "transfer";
} {
  if (tx.kind === "income" || tx.kind === "expense") return true;
  return tx.kind === "transfer" && tx.transferDirection === "in";
}

function delta(
  tx: TransactionLike & { kind: "income" | "expense" | "transfer" },
): number {
  if (tx.kind === "expense") return tx.amountBRLCents;
  // income (estorno) and a transfer's "in" leg (fatura sendo paga) both
  // reduce the invoice — same sign, same "mini-balanço a partir de zero".
  return -tx.amountBRLCents;
}

/** Soma as transações do cartão dentro do período de fatura (year, month), sem nenhum outro filtro de data. */
export function sumCardTransactionsForInvoiceMonth(
  card: CreditCardLike,
  transactions: TransactionLike[],
  year: number,
  month: number,
): Money {
  const period = faturaPeriodo(card, year, month);
  const inPeriod = transactions
    .filter((tx) => isWithinPeriod(tx.transactionDate, period))
    .filter(countsTowardInvoice);

  const breakdown: BreakdownLine[] = inPeriod.map((tx) => ({
    label:
      tx.kind === "transfer"
        ? "closed_invoice_payment"
        : "closed_invoice_transaction",
    valueCents: delta(tx),
    kind: "closed_invoice",
    sourceRef: { type: "Transaction", id: tx.id },
    isEstimate: false,
  }));

  const valueCents = breakdown.reduce((sum, line) => sum + line.valueCents, 0);
  return { valueCents, breakdown };
}

/** Encontra o mês de fatura M tal que closingDate(card,M) ≤ hoje < dueDate(card,M), se existir. */
export function findClosedNotDueInvoiceMonth(
  card: CreditCardLike,
  today: Date,
): { year: number; month: number } | undefined {
  const { year, month } = todayYearMonth(today);
  // A janela closing..due tem no máximo ~1 mês; checar o mês corrente e o anterior
  // cobre qualquer configuração de closingDay/dueDay.
  const candidates = [{ year, month }, previousYearMonth(year, month)];
  for (const candidate of candidates) {
    const closing = closingDate(card, candidate.year, candidate.month);
    const due = dueDate(card, candidate.year, candidate.month);
    if (compareDates(closing, today) <= 0 && compareDates(today, due) < 0) {
      return candidate;
    }
  }
  return undefined;
}

/** closingDate/dueDate re-exportados para uso por outras funções do core (ex.: fluxoDeCaixaFuturo). */
export { closingDate, dueDate };

export function faturaFechadaNaoVencida({
  card,
  transactions,
  asOf,
}: FaturaFechadaNaoVencidaParams): Money {
  const today = todayAsDate(asOf);
  const invoiceMonth = findClosedNotDueInvoiceMonth(card, today);

  if (!invoiceMonth) {
    return { valueCents: 0, breakdown: [] };
  }

  return sumCardTransactionsForInvoiceMonth(
    card,
    transactions,
    invoiceMonth.year,
    invoiceMonth.month,
  );
}
