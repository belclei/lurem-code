// IMPLEMENTACAO.md §3.2 — disponivelHoje (Dinheiro Livre Real), fórmula canônica corrigida.
//
// disponivelHoje(asOf) =
//     Σ balance(account, asOf)                    // contas líquidas: checking + cash, ativas
//   − Σ faturaFechadaNaoVencida(card, asOf)        // cartões SEM débito automático provisionado
//   − Σ tx.amountBRLCents                          // agendadas do mês (isScheduled=true, transactionDate ≤ fimDoMes)
//   − Σ occ.referenceAmountBRLCents                 // recorrências de despesa AINDA NÃO materializadas do mês
//
// ⚠⚠ Trava da dupla contagem (era um bug real da v0.5, §3.2): uma ocorrência
// recorrente, ao ser materializada como transação agendada, passa a ser
// contada SÓ pela linha das agendadas — nunca também pela linha de
// recorrências pendentes. Ver o teste "does not double-count".
//
// ⚠ NOTA DE DECISÃO (ver relatório final): o texto normativo de §3.2 escreve
// a linha de agendadas como "Σ tx.amountBRLCents para tx com isScheduled=true"
// sem filtrar por `kind` — lido ao pé da letra, uma RECEITA agendada também
// seria SUBTRAÍDA do Disponível Hoje, o que contradiz o princípio "Dinheiro
// Livre Real" (conservador: só desconta o que é certo que vai sair, nunca
// desconta dinheiro que ainda vai entrar). Toda a filosofia do produto
// (ARQUITETURA.md §6.9, "piso garantido") e os únicos exemplos dados (boleto,
// aluguel) são de despesa. Interpretamos isso como uma lacuna editorial da
// fórmula e filtramos por kind='expense' aqui. Ficou registrado — não foi
// uma mudança silenciosa.

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
import { clampDay, compareDates, endOfMonth, saoPauloYMD } from "./dates.js";
import { faturaFechadaNaoVencida } from "./invoice.js";

export interface DisponivelHojeInput {
  /** Todas as contas do usuário (qualquer tipo) — a função filtra checking+cash internamente. */
  accounts: Array<{ account: AccountLike; transactions: TransactionLike[] }>;
  /** Todos os cartões — a função filtra os SEM autoDebitAccountId internamente. */
  cards: Array<{ card: CreditCardLike; transactions: TransactionLike[] }>;
  /** Todas as transações agendadas (isScheduled=true) do usuário, de qualquer conta/cartão. */
  scheduledTransactions: TransactionLike[];
  /** Todas as recorrências de despesa ativas do usuário. */
  recurringTransactions: RecurringTransactionLike[];
  /** Todos os RecurringFulfillment do usuário. */
  fulfillments: RecurringFulfillmentLike[];
}

function isFulfilledThisMonth(
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

function isAlreadyScheduledThisMonth(
  recurring: RecurringTransactionLike,
  scheduledTransactions: TransactionLike[],
  year: number,
  month: number,
): boolean {
  return scheduledTransactions.some((tx) => {
    if (tx.recurringTransactionId !== recurring.id || !tx.isScheduled)
      return false;
    // transactionDate é data-calendário pura (UTC-midnight) — lemos os componentes
    // UTC diretamente (ver dates.ts), não via saoPauloYMD (que é só para instantes).
    return (
      tx.transactionDate.getUTCFullYear() === year &&
      tx.transactionDate.getUTCMonth() + 1 === month
    );
  });
}

export function disponivelHoje(input: DisponivelHojeInput, asOf: Date): Money {
  const { year, month, day } = saoPauloYMD(asOf);
  const lastDayOfMonth = endOfMonth(asOf);

  const breakdown: BreakdownLine[] = [];

  // Σ balance(account, asOf) — contas líquidas: toda conta bancária + cash,
  // ativas. "savings" foi unificado a "checking" (2026-08-08): não existe
  // mais uma conta bancária não-líquida.
  for (const { account, transactions } of input.accounts) {
    if (!account.isActive) continue;
    const accountBalance = balance({ account, transactions, asOf });
    breakdown.push(...accountBalance.breakdown);
  }

  // − Σ faturaFechadaNaoVencida(card, asOf) — cartões SEM débito automático provisionado.
  for (const { card, transactions } of input.cards) {
    if (!card.isActive || card.autoDebitAccountId) continue;
    const invoice = faturaFechadaNaoVencida({ card, transactions, asOf });
    if (invoice.valueCents !== 0) {
      breakdown.push({
        label: "closed_invoice",
        valueCents: -invoice.valueCents,
        kind: "closed_invoice",
        sourceRef: { type: "CreditCard", id: card.id },
        isEstimate: false,
      });
    }
  }

  // − Σ tx.amountBRLCents — agendadas do mês (isScheduled=true, transactionDate ≤ fimDoMes).
  // Ver nota de decisão no topo do arquivo: filtramos kind='expense'.
  for (const tx of input.scheduledTransactions) {
    if (!tx.isScheduled || tx.kind !== "expense") continue;
    if (compareDates(tx.transactionDate, lastDayOfMonth) > 0) continue;
    breakdown.push({
      label: "scheduled_tx",
      valueCents: -tx.amountBRLCents,
      kind: "scheduled_tx",
      sourceRef: { type: "Transaction", id: tx.id },
      isEstimate: false,
    });
  }

  // − Σ occ.referenceAmountBRLCents — recorrências de despesa do mês corrente que:
  //   (a) não têm RecurringFulfillment(série, ano, mês), E
  //   (b) não têm transação agendada correspondente já criada, E
  //   (c) dayOfMonth ≥ diaDe(asOf)
  for (const recurring of input.recurringTransactions) {
    if (!recurring.isActive || recurring.kind !== "expense") continue;
    const clampedDay = clampDay(year, month, recurring.dayOfMonth);
    if (clampedDay < day) continue; // (c)
    if (isFulfilledThisMonth(recurring, input.fulfillments, year, month))
      continue; // (a)
    if (
      isAlreadyScheduledThisMonth(
        recurring,
        input.scheduledTransactions,
        year,
        month,
      )
    )
      continue; // (b)

    breakdown.push({
      label: "recurring_expense",
      valueCents: -recurring.referenceAmountBRLCents,
      kind: "recurring_expense",
      sourceRef: { type: "RecurringTransaction", id: recurring.id },
      isEstimate: recurring.isVariableAmount,
    });
  }

  const valueCents = breakdown.reduce((sum, line) => sum + line.valueCents, 0);
  return { valueCents, breakdown };
}
