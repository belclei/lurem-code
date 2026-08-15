// apps/api/src/imports/serialize.ts
import type { ExtractedTransaction, ImportedDocument } from "@lurem/db";

export interface ImportedDocumentResponse {
  id: string;
  type: ImportedDocument["type"];
  accountId: string | null;
  creditCardId: string | null;
  status: ImportedDocument["status"];
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface ExtractedTransactionResponse {
  id: string;
  importedDocumentId: string;
  status: ExtractedTransaction["status"];
  kind: ExtractedTransaction["kind"];
  transactionDate: string;
  amountCents: number;
  currency: string;
  description: string;
  suggestedCategoryId: string | null;
  confidence: number;
  cardHolderRaw: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  confirmedTransactionId: string | null;
}

export function toImportedDocumentResponse(
  doc: ImportedDocument,
): ImportedDocumentResponse {
  return {
    id: doc.id,
    type: doc.type,
    accountId: doc.accountId,
    creditCardId: doc.creditCardId,
    status: doc.status,
    errorMessage: doc.errorMessage,
    createdAt: doc.createdAt.toISOString(),
    processedAt: doc.processedAt ? doc.processedAt.toISOString() : null,
  };
}

export function toExtractedTransactionResponse(
  line: ExtractedTransaction,
): ExtractedTransactionResponse {
  return {
    id: line.id,
    importedDocumentId: line.importedDocumentId,
    status: line.status,
    kind: line.kind,
    transactionDate: line.transactionDate.toISOString().slice(0, 10),
    amountCents: line.amountCents,
    currency: line.currency,
    description: line.description,
    suggestedCategoryId: line.suggestedCategoryId,
    confidence: line.confidence,
    cardHolderRaw: line.cardHolderRaw,
    installmentNumber: line.installmentNumber,
    installmentTotal: line.installmentTotal,
    confirmedTransactionId: line.confirmedTransactionId,
  };
}
