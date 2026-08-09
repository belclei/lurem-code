// IMPLEMENTACAO.md §3.3 — fluxoDeCaixaFuturo, projeção 12 meses, corrigida no mês corrente.
//
// saldo[0] = Σ balance(conta líquida, asOf)
// saldo[1] (mês corrente, N=1) = saldo[0] + receitas/despesas recorrentes NÃO
//   cumpridas e NÃO já confirmadas − agendadas não-recorrentes restantes do
//   mês − faturas fechadas não pagas com vencimento ≤ fimDoMes (auto-débito
//   ou não).
// saldo[N≥2] = saldo[N−1] + receitas recorrentes ativas no mês N − despesas
//   recorrentes ativas no mês N − faturas previstas com vencimento no mês N
//   (SÓ para cartões com auto-débito).
//
// ⚠ Retorno: um array de 12 Money, `result[i]` corresponde a `saldo[i+1]`.
// `result[0]` é o card "Previsão de fim do mês" do dashboard (ARQUITETURA.md §6.9).
//
// ⚠ Trava da dupla contagem (idêntica a disponivelHoje, §3.2/§3.3): uma
// ocorrência recorrente já cumprida (RecurringFulfillment) ou já materializada
// como transação agendada não entra de novo na linha de recorrências do mês
// corrente — ela já está dentro de saldo[0] (fulfillment) ou será contada pela
// própria linha de agendadas restantes... na verdade uma agendada VINCULADA a
// uma recorrência não é somada na linha "agendadas não-recorrentes" (ela é
// filtrada por `recurringTransactionId == null`) — o valor dela só volta a
// aparecer quando ela for confirmada e cair em saldo[0]. Ver teste
// "does not double-count".
//
// ⚠ Assimetria intencional (ver relatório final): faturas do mês corrente
// (N=1) entram para QUALQUER cartão (auto-débito ou não) — é uma fatura já
// fechada, valor certo. Para meses futuros (N≥2), só cartões COM auto-débito
// contam: prever gasto de cartão sem débito automático meses à frente não é
// um compromisso garantido (o usuário pode pagar de outro jeito, ou a compra
// pode não se repetir) — o "piso garantido" do produto (ARQUITETURA.md §6.9)
// só inclui o que é certo que vai sair de uma conta líquida automaticamente.

import type {
  AccountLike,
  BreakdownLine,
  CreditCardLike,
  Money,
  RecurringFulfillmentLike,
  RecurringTransactionLike,
  TransactionLike,
} from "@lurem/domain";
import { balance } from "./balance.js";
import {
  addMonths,
  clampDay,
  compareDates,
  daysInMonth,
  endOfMonth,
  makeDate,
  saoPauloYMD,
} from "./dates.js";
import { dueDate, sumCardTransactionsForInvoiceMonth } from "./invoice.js";

const HORIZON_MONTHS = 12;

export interface FluxoDeCaixaFuturoInput {
  /** Todas as contas (qualquer tipo) — a função filtra checking+cash internamente. */
  accounts: Array<{ account: AccountLike; transactions: TransactionLike[] }>;
  /** Todos os cartões. */
  cards: Array<{ card: CreditCardLike; transactions: TransactionLike[] }>;
  recurringTransactions: RecurringTransactionLike[];
  fulfillments: RecurringFulfillmentLike[];
  /** Todas as transações agendadas (recorrentes e não-recorrentes). */
  scheduledTransactions: TransactionLike[];
}

function isFulfilled(
  recurring: RecurringTransactionLike,
  fulfillments: RecurringFulfillmentLike[],
  year: number,
  month: number,
): boolean {
  return fulfillments.some(
    (f) =>
      f.recurringTransactionId === recurring.id &&
      f.year === year &&
      f.month === month,
  );
}

function isAlreadyScheduled(
  recurring: RecurringTransactionLike,
  scheduled: TransactionLike[],
  year: number,
  month: number,
): boolean {
  return scheduled.some(
    (tx) =>
      tx.recurringTransactionId === recurring.id &&
      tx.isScheduled &&
      tx.transactionDate.getUTCFullYear() === year &&
      tx.transactionDate.getUTCMonth() + 1 === month,
  );
}

function isRecurringActiveInMonth(
  recurring: RecurringTransactionLike,
  year: number,
  month: number,
): boolean {
  const monthStart = makeDate(year, month, 1);
  const monthEnd = makeDate(year, month, daysInMonth(year, month));
  if (compareDates(recurring.startDate, monthEnd) > 0) return false; // starts after this month
  if (recurring.endDate && compareDates(recurring.endDate, monthStart) < 0)
    return false; // ended before this month
  return true;
}

function recurringLine(recurring: RecurringTransactionLike): BreakdownLine {
  const sign = recurring.kind === "income" ? 1 : -1;
  return {
    label:
      recurring.kind === "income" ? "recurring_income" : "recurring_expense",
    valueCents: sign * recurring.referenceAmountBRLCents,
    kind:
      recurring.kind === "income" ? "recurring_income" : "recurring_expense",
    sourceRef: { type: "RecurringTransaction", id: recurring.id },
    isEstimate: recurring.isVariableAmount,
  };
}

function liquidBalanceLines(
  input: FluxoDeCaixaFuturoInput,
  asOf: Date,
): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  // "savings" was folded into "checking" (2026-08-08) — every bank account
  // now counts as liquid alongside cash, not just checking.
  for (const { account, transactions } of input.accounts) {
    if (!account.isActive) continue;
    lines.push(...balance({ account, transactions, asOf }).breakdown);
  }
  return lines;
}

/** saldo[1] (N=1, mês corrente): só o que FALTA acontecer. */
function currentMonthLines(
  input: FluxoDeCaixaFuturoInput,
  asOf: Date,
): BreakdownLine[] {
  const { year, month } = saoPauloYMD(asOf);
  const lastDayOfMonth = endOfMonth(asOf);
  const lines: BreakdownLine[] = [];

  for (const recurring of input.recurringTransactions) {
    if (!recurring.isActive) continue;
    if (isFulfilled(recurring, input.fulfillments, year, month)) continue;
    if (isAlreadyScheduled(recurring, input.scheduledTransactions, year, month))
      continue;
    lines.push(recurringLine(recurring));
  }

  // ⚠ NOTA DE DECISÃO (ver relatório final): o texto normativo de §3.3 fala em
  // "agendadas (NÃO-recorrentes) restantes do mês", o que, lido ao pé da
  // letra, excluiria uma transação agendada que se originou de uma recorrência
  // — mas essa mesma transação já foi excluída da linha de recorrências acima
  // (via isAlreadyScheduled), então lida literalmente essa combinação faria o
  // valor DESAPARECER da projeção inteira (nem conta como recorrente pendente,
  // nem conta como agendada) até o usuário confirmar a transação. Isso é uma
  // lacuna/bug real na composição das duas cláusulas do texto, não uma leitura
  // válida. Aqui somamos TODA transação agendada do mês (recorrente ou não) —
  // consistente com disponivelHoje (§3.2), que já soma todas as agendadas sem
  // esse filtro. Ver teste "does not double-count".
  for (const tx of input.scheduledTransactions) {
    if (!tx.isScheduled) continue;
    if (
      tx.transactionDate.getUTCFullYear() !== year ||
      tx.transactionDate.getUTCMonth() + 1 !== month
    )
      continue;
    lines.push({
      label: "scheduled_tx",
      valueCents: -tx.amountBRLCents,
      kind: "scheduled_tx",
      sourceRef: { type: "Transaction", id: tx.id },
      isEstimate: false,
    });
  }

  for (const { card, transactions } of input.cards) {
    if (!card.isActive) continue;
    // Fatura fechada e não vencida (qualquer cartão), cujo vencimento cai
    // dentro do mês corrente. Não usamos faturaFechadaNaoVencida diretamente
    // aqui porque também precisamos checar o vencimento <= fim do mês.
    const today = makeDate(year, month, saoPauloYMD(asOf).day);
    const candidates = [{ year, month }, addMonths({ year, month }, -1)];
    for (const candidate of candidates) {
      const due = dueDate(card, candidate.year, candidate.month);
      const closing = makeDate(
        candidate.year,
        candidate.month,
        clampDay(candidate.year, candidate.month, card.closingDay),
      );
      const isClosedNotDue =
        compareDates(closing, today) <= 0 && compareDates(today, due) < 0;
      if (isClosedNotDue && compareDates(due, lastDayOfMonth) <= 0) {
        const invoice = sumCardTransactionsForInvoiceMonth(
          card,
          transactions,
          candidate.year,
          candidate.month,
        );
        if (invoice.valueCents !== 0) {
          lines.push({
            label: "closed_invoice",
            valueCents: -invoice.valueCents,
            kind: "closed_invoice",
            sourceRef: { type: "CreditCard", id: card.id },
            isEstimate: false,
          });
        }
        break;
      }
    }
  }

  return lines;
}

/** saldo[N] para N ≥ 2: nenhuma ocorrência aconteceu ainda, todas contam. */
function futureMonthLines(
  input: FluxoDeCaixaFuturoInput,
  year: number,
  month: number,
): BreakdownLine[] {
  const lines: BreakdownLine[] = [];

  for (const recurring of input.recurringTransactions) {
    if (!recurring.isActive) continue;
    if (!isRecurringActiveInMonth(recurring, year, month)) continue;
    lines.push(recurringLine(recurring));
  }

  for (const { card, transactions } of input.cards) {
    if (!card.isActive || !card.autoDebitAccountId) continue; // só cartões com auto-débito (ver nota no topo)
    const candidates = [{ year, month }, addMonths({ year, month }, -1)];
    for (const candidate of candidates) {
      const due = dueDate(card, candidate.year, candidate.month);
      if (due.getUTCFullYear() === year && due.getUTCMonth() + 1 === month) {
        const invoice = sumCardTransactionsForInvoiceMonth(
          card,
          transactions,
          candidate.year,
          candidate.month,
        );
        if (invoice.valueCents !== 0) {
          lines.push({
            label: "closed_invoice",
            valueCents: -invoice.valueCents,
            kind: "closed_invoice",
            sourceRef: { type: "CreditCard", id: card.id },
            // Fatura ainda não fechou de fato (estamos projetando meses à
            // frente) — é uma previsão baseada em transações já conhecidas
            // (ex.: parcelas futuras já lançadas), não um valor fechado.
            isEstimate: true,
          });
        }
        break;
      }
    }
  }

  return lines;
}

export function fluxoDeCaixaFuturo(
  input: FluxoDeCaixaFuturoInput,
  asOf: Date,
): Money[] {
  const { year, month } = saoPauloYMD(asOf);
  const saldo0 = liquidBalanceLines(input, asOf).reduce(
    (sum, l) => sum + l.valueCents,
    0,
  );

  const results: Money[] = [];
  let previousValueCents = saldo0;

  for (let n = 1; n <= HORIZON_MONTHS; n++) {
    const target =
      n === 1 ? { year, month } : addMonths({ year, month }, n - 1);
    const monthLines =
      n === 1
        ? currentMonthLines(input, asOf)
        : futureMonthLines(input, target.year, target.month);
    const monthDelta = monthLines.reduce((sum, l) => sum + l.valueCents, 0);
    const valueCents = previousValueCents + monthDelta;

    const breakdown: BreakdownLine[] =
      n === 1
        ? [...liquidBalanceLines(input, asOf), ...monthLines]
        : [...monthLines];

    // Para N ≥ 2 o breakdown lista só a variação do mês (o carry-over de
    // saldo[N-1] não é uma "linha" nova — já está representado no saldo[N-1]
    // anterior). Para manter o invariante local (linhas somam ao valueCents
    // do próprio Money retornado), cada saldo[N] com N≥2 expõe seu valueCents
    // como o saldo ACUMULADO, mas o breakdown como a decomposição completa
    // seria enorme (12 meses de linhas empilhadas) — em vez disso, incluímos
    // uma linha sintética "saldo_anterior" explícita para que a soma bata.
    if (n > 1) {
      breakdown.unshift({
        label: "previous_month_balance",
        valueCents: previousValueCents,
        kind: "account_balance",
        isEstimate: n > 1,
      });
    }

    results.push({ valueCents, breakdown });
    previousValueCents = valueCents;
  }

  return results;
}
