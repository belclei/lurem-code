// apps/api/src/transactions/serialize.ts
// Resposta de transação — campos que a lista (US-3.9, TransactionRow) e as ações
// (US-3.7) consomem. Sinal do dinheiro vem de kind/transferDirection, nunca do
// valor (§1.4): amountCents/amountBRLCents são sempre positivos.
import type { Transaction } from "@lurem/db";

export interface InstallmentDetail {
  originalAmountCents: number;
  originalDate: string;
  installmentNumber: number;
  installmentTotal: number;
  paidCount: number;
  paidAmountCents: number;
  remainingCount: number;
  remainingAmountCents: number;
  nextInstallmentDate: string;
  payoffDate: string;
}

export interface TransactionResponse {
  id: string;
  kind: Transaction["kind"];
  source: Transaction["source"];
  description: string;
  transactionDate: string;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  currency: string;
  amountCents: number;
  amountBRLCents: number;
  isScheduled: boolean;
  transferPairId: string | null;
  transferDirection: Transaction["transferDirection"];
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentPurchaseAmountCents: number | null;
  recurringTransactionId: string | null;
  createdAt: string;
  installmentDetails?: InstallmentDetail;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateInstallmentDetails(
  tx: Transaction,
  allTxByGroupId: Map<string, Transaction[]>,
): InstallmentDetail | undefined {
  if (!tx.installmentGroupId || !tx.installmentNumber || !tx.installmentTotal) {
    return undefined;
  }

  const groupTxs = allTxByGroupId.get(tx.installmentGroupId) ?? [];
  if (groupTxs.length === 0) return undefined;

  const original = groupTxs.find((t) => t.installmentNumber === 1);
  if (!original) return undefined;

  const installmentNumber = tx.installmentNumber ?? 0;
  const paidCount = groupTxs.filter(
    (t) => (t.installmentNumber ?? 0) < installmentNumber && !t.isScheduled,
  ).length;
  const paidAmountCents = paidCount * tx.amountCents;
  const installmentTotal = tx.installmentTotal ?? 0;
  const remainingCount = installmentTotal - paidCount - 1;
  const remainingAmountCents = remainingCount * tx.amountCents;

  const nextDate = new Date(tx.transactionDate);
  nextDate.setMonth(nextDate.getMonth() + 1);

  const originalInstallmentTotal = original.installmentTotal ?? 0;
  const payoffDate = new Date(original.transactionDate);
  payoffDate.setMonth(payoffDate.getMonth() + originalInstallmentTotal - 1);

  return {
    originalAmountCents: original.amountCents,
    originalDate: ymd(original.transactionDate),
    installmentNumber: tx.installmentNumber,
    installmentTotal: tx.installmentTotal,
    paidCount,
    paidAmountCents,
    remainingCount,
    remainingAmountCents,
    nextInstallmentDate: ymd(nextDate),
    payoffDate: ymd(payoffDate),
  };
}

export function toTransactionResponse(
  tx: Transaction,
  installmentsByGroupId?: Map<string, Transaction[]>,
): TransactionResponse {
  const details = installmentsByGroupId
    ? calculateInstallmentDetails(tx, installmentsByGroupId)
    : undefined;

  return {
    id: tx.id,
    kind: tx.kind,
    source: tx.source,
    description: tx.description,
    transactionDate: ymd(tx.transactionDate),
    accountId: tx.accountId,
    creditCardId: tx.creditCardId,
    categoryId: tx.categoryId,
    currency: tx.currency,
    amountCents: tx.amountCents,
    amountBRLCents: tx.amountBRLCents,
    isScheduled: tx.isScheduled,
    transferPairId: tx.transferPairId,
    transferDirection: tx.transferDirection,
    installmentGroupId: tx.installmentGroupId,
    installmentNumber: tx.installmentNumber,
    installmentTotal: tx.installmentTotal,
    installmentPurchaseAmountCents: tx.installmentPurchaseAmountCents,
    recurringTransactionId: tx.recurringTransactionId,
    createdAt: tx.createdAt.toISOString(),
    ...(details ? { installmentDetails: details } : {}),
  };
}
