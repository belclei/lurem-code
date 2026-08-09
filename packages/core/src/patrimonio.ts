// IMPLEMENTACAO.md §3.5 — patrimonioTotal.
//
// patrimonioTotal(asOf) = Σ balance(todas as contas, asOf) − Σ faturas de
// cartão em aberto (+ investimentos quando o módulo chegar, §1.8).
// "savings" foi unificado a "checking" (2026-08-08) — toda conta bancária
// já entra aqui E em Disponível Hoje, sem distinção de liquidez entre elas.
//
// ⚠ NOTA DE DECISÃO (ver relatório final): "faturas de cartão em aberto" é
// mais amplo do que a janela "fechada e não vencida" de faturaFechadaNaoVencida
// (§3.4/§3.2) — patrimônio precisa refletir TODA a dívida do cartão (inclusive
// a fatura ainda em formação, que já é dívida real mesmo antes de fechar),
// não só a próxima fatura a vencer. Como o schema não rastreia pagamento
// (mesma lacuna documentada em invoice.ts), aproximamos "em aberto" como a
// soma de TODAS as transações do cartão com transactionDate ≤ asOf — o melhor
// proxy computável com os dados disponíveis hoje.

import type {
  AccountLike,
  BreakdownLine,
  CreditCardLike,
  Money,
  TransactionLike,
} from "@lurem/domain";
import { balance } from "./balance.js";
import { compareDates, todayAsDate } from "./dates.js";

export interface PatrimonioTotalInput {
  /** Todas as contas do usuário, qualquer tipo (checking, cash, savings). */
  accounts: Array<{ account: AccountLike; transactions: TransactionLike[] }>;
  /** Todos os cartões do usuário. */
  cards: Array<{ card: CreditCardLike; transactions: TransactionLike[] }>;
}

/**
 * kind='transfer' é filtrado antes de chegar aqui (§3.1) — o type guard torna
 * essa garantia explícita no tipo em vez de um branch `default: return 0`
 * estruturalmente inalcançável (ver a mesma decisão em invoice.ts).
 */
function isIncomeOrExpense(
  tx: TransactionLike,
): tx is TransactionLike & { kind: "income" | "expense" } {
  return tx.kind === "income" || tx.kind === "expense";
}

function cardDelta(
  tx: TransactionLike & { kind: "income" | "expense" },
): number {
  return tx.kind === "expense" ? tx.amountBRLCents : -tx.amountBRLCents;
}

export function patrimonioTotal(
  input: PatrimonioTotalInput,
  asOf: Date,
): Money {
  const today = todayAsDate(asOf);
  const breakdown: BreakdownLine[] = [];

  for (const { account, transactions } of input.accounts) {
    if (!account.isActive) continue;
    breakdown.push(...balance({ account, transactions, asOf }).breakdown);
  }

  for (const { card, transactions } of input.cards) {
    if (!card.isActive) continue;
    const debtCents = transactions
      .filter((tx) => compareDates(tx.transactionDate, today) <= 0)
      .filter(isIncomeOrExpense)
      .reduce((sum, tx) => sum + cardDelta(tx), 0);
    if (debtCents !== 0) {
      breakdown.push({
        label: "card_debt",
        valueCents: -debtCents,
        kind: "closed_invoice",
        sourceRef: { type: "CreditCard", id: card.id },
        isEstimate: false,
      });
    }
  }

  const valueCents = breakdown.reduce((sum, line) => sum + line.valueCents, 0);
  return { valueCents, breakdown };
}
