// Formas de entrada puras para packages/core. Não são os modelos Prisma —
// são o contrato que uma futura camada de repositório (packages/db) mapeia
// a partir das rows do banco. Mantidos deliberadamente enxutos: só os campos
// que as fórmulas de IMPLEMENTACAO.md §2-§3 realmente consultam.

export type TxKind = "income" | "expense" | "transfer";
export type AccountType = "checking" | "cash";

export interface AccountLike {
  id: string;
  type: AccountType;
  openingBalanceCents: number;
  overdraftLimitCents: number;
  isActive: boolean;
}

export interface CreditCardLike {
  id: string;
  /** 1..31 — clamp ao último dia do mês na hora do cálculo (§3.4). */
  closingDay: number;
  /** 1..31 — idem. */
  dueDay: number;
  autoDebitAccountId?: string | null;
  isActive: boolean;
  /** Manual invoice closure override — year of closed period, null if no override. */
  manualClosureYear?: number | null;
  /** Manual invoice closure override — month of closed period, null if no override. */
  manualClosureMonth?: number | null;
}

/**
 * ⚠ Nota de decisão (ver relatório final): o schema Prisma normativo
 * (IMPLEMENTACAO.md §1.4) não tem um campo explícito de direção para as duas
 * pernas de uma transferência (`transferPairId`) — cada perna tem seu próprio
 * `accountId`/`creditCardId` e `kind='transfer'`, mas nada no modelo indica
 * qual perna é a origem (−) e qual é o destino (+), embora §2.1 exija exatamente
 * essa distinção para o cálculo de saldo. Isso é uma ambiguidade real do
 * contrato de dados, não uma escolha deste pacote. Modelamos aqui o campo
 * `transferDirection` como parte do *contrato de entrada do core* (não do
 * schema Prisma) — a camada de repositório (fora do escopo desta sprint)
 * precisará decidir como derivá-lo (ex.: campo explícito na Transaction,
 * ou convenção de qual perna é criada primeiro) antes do Sprint 5 (US-3.6).
 */
export type TransferDirection = "in" | "out";

export interface TransactionLike {
  id: string;
  kind: TxKind;
  /** Obrigatório quando kind === 'transfer'; ausente/ignorado caso contrário. */
  transferDirection?: TransferDirection;
  /** Sempre positivo — o sinal vem de `kind` (+ `transferDirection` para transfer), nunca do valor (§0, §1.4). */
  amountBRLCents: number;
  /** Data da transação (sem hora) — interpretada em America/Sao_Paulo (§0). */
  transactionDate: Date;
  isScheduled: boolean;
  recurringTransactionId?: string | null;
}

export interface RecurringTransactionLike {
  id: string;
  /** transfer não recorre (§1.5). */
  kind: "income" | "expense";
  /** 1..31 — clamp ao último dia do mês (§3.4). */
  dayOfMonth: number;
  referenceAmountBRLCents: number;
  isVariableAmount: boolean;
  isActive: boolean;
  startDate: Date;
  endDate?: Date | null;
}

export interface RecurringFulfillmentLike {
  recurringTransactionId: string;
  year: number;
  /** 1..12 */
  month: number;
}
