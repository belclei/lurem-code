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
  addMonths,
  closingDate,
  compareDates,
  dueDate,
  faturaPeriodo,
  periodIndexForDate,
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

/** Ordinal comparável de um (ano, mês) — só para ordenar/contar períodos. */
function periodOrdinal({
  year,
  month,
}: { year: number; month: number }): number {
  return year * 12 + (month - 1);
}

/** Soma só as transações que caem dentro do período (year, month), sem herdar nada. */
function periodOwnTotal(
  card: CreditCardLike,
  transactions: TransactionLike[],
  year: number,
  month: number,
): BreakdownLine[] {
  const period = faturaPeriodo(card, year, month);
  return transactions
    .filter((tx) => isWithinPeriod(tx.transactionDate, period))
    .filter(countsTowardInvoice)
    .map((tx) => ({
      label:
        tx.kind === "transfer"
          ? "closed_invoice_payment"
          : "closed_invoice_transaction",
      valueCents: delta(tx),
      kind: "closed_invoice" as const,
      sourceRef: { type: "Transaction", id: tx.id },
      isEstimate: false,
    }));
}

/**
 * Total da fatura (year, month) do cartão, **cumulativo**: herda o saldo a
 * favor (resto negativo) das faturas anteriores, iterando do período do
 * lançamento mais antigo do cartão até o período pedido.
 *
 * Só crédito genuinamente novo carrega — e "genuinamente novo" exclui a
 * perna de pagamento (transfer-in). Quando dueDay > closingDay (o caso
 * comum), o vencimento cai DEPOIS do fechamento, então um pagamento datado
 * do vencimento cai na fatura SEGUINTE: fatura de julho fecha 10/jul, vence
 * 20/jul, e um pagamento em 20/jul cai no período de agosto. Esse pagamento
 * quita uma dívida que já foi contabilizada na fatura de julho — carregá-lo
 * como "crédito" descontaria a mesma dívida de novo, indefinidamente, na
 * fatura seguinte. Mesma lógica de "resto positivo não carrega" (ele
 * "continua sendo cobrado como a sua própria fatura fechada" — comentário
 * abaixo), só que aplicada à quitação dessa cobrança, não à cobrança em si.
 * Um estorno (income) não tem essa contrapartida: é crédito novo de fato, e
 * esse continua carregando.
 *
 * Por isso o carry usa uma "base" separada do valor retornado: o valor
 * devolvido por um período (`own`, via `total`) sempre inclui a perna de
 * pagamento — o dinheiro realmente se moveu naquele período. Só o que
 * ALIMENTA o carry da fatura seguinte (`carryBasis`) exclui as linhas
 * `closed_invoice_payment`.
 *
 * Um resto positivo (fatura fechada não paga) também NÃO é somado à fatura
 * seguinte — ele continua sendo cobrado como a sua própria fatura fechada,
 * que é o comportamento que o app sempre teve (o schema não rastreia
 * pagamento; ver a nota no topo deste arquivo). Carregar dívida adiante
 * inflaria a próxima fatura com algo que já está sendo cobrado.
 *
 * O crédito herdado entra no breakdown como uma linha `carried_credit`
 * própria, para o invariante de ouro (§3.0: valueCents === Σ breakdown)
 * continuar valendo e para a decomposição na UI mostrar de onde veio o
 * abatimento.
 */
export function sumCardTransactionsForInvoiceMonth(
  card: CreditCardLike,
  transactions: TransactionLike[],
  year: number,
  month: number,
): Money {
  if (transactions.length === 0) {
    return { valueCents: 0, breakdown: [] };
  }

  const targetOrdinal = periodOrdinal({ year, month });

  // .reduce() sem seed devolve T (não T | undefined) mesmo com
  // noUncheckedIndexedAccess — ao contrário de indexar transactions[0], que
  // o TS não consegue provar não-vazio só a partir do `if` de length acima.
  const earliest = transactions
    .map((tx) => periodIndexForDate(card, tx.transactionDate))
    .reduce((min, candidate) =>
      periodOrdinal(candidate) < periodOrdinal(min) ? candidate : min,
    );
  const earliestOrdinal = periodOrdinal(earliest);

  // Fatura anterior ao primeiro lançamento do cartão: nada aconteceu ainda.
  if (targetOrdinal < earliestOrdinal) {
    return { valueCents: 0, breakdown: [] };
  }

  // Quantos períodos ANTES do pedido precisam ser percorridos só para
  // acumular o carry — um limite fixo, calculado uma única vez antes do
  // loop, em vez de um `for (;;)` que só para quando um contador de período
  // bate no alvo por igualdade. Isso torna a terminação estrutural: mesmo
  // que `earliest` viesse de uma data inválida (NaN), `i < NaN` nunca é
  // verdadeiro e o loop simplesmente não roda, em vez de girar para sempre.
  const periodsBeforeTarget = targetOrdinal - earliestOrdinal;

  let carry = 0;
  let current = earliest;
  for (let i = 0; i < periodsBeforeTarget; i++) {
    const lines = periodOwnTotal(
      card,
      transactions,
      current.year,
      current.month,
    );
    // Só as linhas de income/expense entram na base do carry — a perna de
    // pagamento (closed_invoice_payment) fica de fora (ver doc da função).
    const carryBasis =
      lines
        .filter((line) => line.label === "closed_invoice_transaction")
        .reduce((sum, line) => sum + line.valueCents, 0) + carry;
    carry = Math.min(0, carryBasis);
    current = addMonths(current, 1);
  }

  // `current` chegou exatamente no período pedido depois de `periodsBeforeTarget`
  // passos a partir de `earliest` — mas usar (year, month) direto, os
  // parâmetros originais da função, não depende dessa invariante do loop.
  const lines = periodOwnTotal(card, transactions, year, month);
  const own = lines.reduce((sum, line) => sum + line.valueCents, 0);
  const valueCents = own + carry;
  const breakdown =
    carry === 0
      ? lines
      : [
          {
            label: "carried_credit",
            valueCents: carry,
            kind: "closed_invoice" as const,
            isEstimate: false,
          },
          ...lines,
        ];
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

/**
 * Extrai o valor de uma fatura, clamped ao mínimo de 0. Um saldo a favor
 * (fatura negativa) não é caixa disponível — ele só se realiza como compras
 * futuras naquele cartão, não como dinheiro sacável.
 *
 * Usado por disponivelHoje e fluxoDeCaixaFuturo para evitar que créditos
 * acumulados inflassem o saldo de caixa livres de obrigações (§3.2/§3.3).
 */
export function invoiceAmountDueCents(invoice: Money): number {
  return Math.max(invoice.valueCents, 0);
}
