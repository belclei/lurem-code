// apps/api/src/accounts/serialize.ts
// Shared balance/isOverLimit derivation (IMPLEMENTACAO.md §2.1/§2.3) for the
// account list/detail responses. Reuses packages/core — never recomputes the
// formula locally (single source of truth for "what is the real balance").
import { balance } from "@lurem/core";
import type { Account, Institution, Transaction } from "@lurem/db";
import { institutionLogoUrl } from "../institutions/logo-url.js";

/** Rows já escopadas a esta conta (ambas as pernas de transfer) → contrato do core. */
function toTransactionLike(tx: Transaction) {
  return {
    id: tx.id,
    kind: tx.kind,
    transferDirection: tx.transferDirection ?? undefined,
    amountBRLCents: tx.amountBRLCents,
    transactionDate: tx.transactionDate,
    isScheduled: tx.isScheduled,
    recurringTransactionId: tx.recurringTransactionId ?? undefined,
  };
}

export interface AccountResponse {
  id: string;
  institutionId: string | null;
  institutionName: string;
  logoUrl?: string;
  name: string | null;
  type: Account["type"];
  currency: string;
  balanceCents: number;
  overdraftLimitCents: number;
  isOverLimit: boolean;
  isActive: boolean;
  archivedAt: string | null;
  /** Derived from the same `transactions` the caller already scoped to this
   * account (§2.1 pattern) — lets the frontend gate the "Excluir" (hard
   * delete) action without an extra round trip: DELETE only hard-deletes
   * when there's no history to lose (BACKLOG.md "Arquivar conta/cartão"). */
  hasTransactions: boolean;
}

// Since Sprint 5 (US-3.5) transactions exist; the caller passes the rows scoped
// to this account so the balance reflects them. Defaults to [] for a fresh
// account (POST) that has no history yet.
export function toAccountResponse(
  account: Account,
  institution: Institution | null,
  transactions: Transaction[] = [],
): AccountResponse {
  const money = balance({
    account: {
      id: account.id,
      type: account.type,
      openingBalanceCents: account.openingBalanceCents,
      overdraftLimitCents: account.overdraftLimitCents,
      isActive: account.isActive,
    },
    transactions: transactions.map(toTransactionLike),
    asOf: new Date(),
  });

  return {
    id: account.id,
    institutionId: account.institutionId,
    institutionName:
      account.type === "cash" ? "Em Espécie" : (institution?.name ?? ""),
    logoUrl: institutionLogoUrl(institution),
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceCents: money.valueCents,
    overdraftLimitCents: account.overdraftLimitCents,
    isOverLimit: money.valueCents < -account.overdraftLimitCents,
    isActive: account.isActive,
    archivedAt: account.archivedAt ? account.archivedAt.toISOString() : null,
    hasTransactions: transactions.length > 0,
  };
}
