// apps/api/src/cards/serialize.ts
import type { CreditCard, Institution, Transaction } from "@lurem/db";
import { institutionLogoUrl } from "../institutions/logo-url.js";
import { cardInvoiceStatus } from "./invoice-status.js";

export interface CardResponse {
  id: string;
  institutionId: string;
  institutionName: string;
  logoUrl?: string;
  name: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  autoDebitAccountId: string | null;
  currency: string;
  isActive: boolean;
  usedCents: number;
  isOverLimit: boolean;
  invoiceStatus: "open" | "closed_awaiting_payment";
}

// `transactions` must be pre-scoped to this card by the caller (§6.1's
// ownership rule) — mirrors accounts/serialize.ts's toAccountResponse.
// Bug fixed here (Sprint 10, US-6.1): every caller in cards/routes.ts used
// to call this with no transactions argument at all, so `usedCents` was
// silently 0 for every card since the moment transactions started existing
// in Sprint 5 — this file's own outdated comment predicted the wiring would
// happen "the moment transactions exist" and nobody came back to do it.
// isOverLimit is new in this sprint: the Timeline alert banner (§6.12) needs
// it server-side the same way accounts already expose it.
export function toCardResponse(
  card: CreditCard,
  institution: Institution,
  transactions: Transaction[] = [],
): CardResponse {
  const { usedCents, invoiceStatus } = cardInvoiceStatus(
    {
      id: card.id,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      autoDebitAccountId: card.autoDebitAccountId,
      isActive: card.isActive,
    },
    transactions.map((tx) => ({
      id: tx.id,
      kind: tx.kind,
      transferDirection: tx.transferDirection ?? undefined,
      amountBRLCents: tx.amountBRLCents,
      transactionDate: tx.transactionDate,
      isScheduled: tx.isScheduled,
      recurringTransactionId: tx.recurringTransactionId,
    })),
  );

  return {
    id: card.id,
    institutionId: card.institutionId,
    institutionName: institution.name,
    logoUrl: institutionLogoUrl(institution),
    name: card.name,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    autoDebitAccountId: card.autoDebitAccountId,
    currency: card.currency,
    isActive: card.isActive,
    usedCents,
    isOverLimit: usedCents > card.limitCents,
    invoiceStatus,
  };
}
