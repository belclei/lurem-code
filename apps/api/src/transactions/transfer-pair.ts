// apps/api/src/transactions/transfer-pair.ts
// §6.6 — as duas pernas de uma transferência, ligadas por um transferPairId
// comum. Extraído de routes.ts para o fluxo de importação (imports/routes.ts,
// confirmLine) poder criar o mesmo par ao confirmar uma linha kind=transfer —
// antes disso, uma linha de transferência importada virava uma Transaction
// solta, sem a perna espelhada.
//
// A validação de posse (findOwnedAccount/findOwnedCard) fica com quem chama:
// as mensagens de erro diferem entre os dois call-sites (o fluxo manual tem
// field errors por campo do formulário, a confirmação de importação não tem
// formulário).
import { randomUUID } from "node:crypto";
import type { Prisma, Transaction } from "@lurem/db";

export interface CreateTransferPairParams {
  userId: string;
  /** Transferência SEMPRE sai de uma conta — nunca de um cartão. */
  sourceAccountId: string;
  /** Exatamente um dos dois destinos deve vir preenchido. */
  destAccountId?: string | null;
  destCreditCardId?: string | null;
  description: string;
  transactionDate: Date;
  currency: string;
  amountCents: number;
  amountBRLCents: number;
  isScheduled: boolean;
  source: "manual" | "import";
}

export async function createTransferPair(
  client: Prisma.TransactionClient,
  params: CreateTransferPairParams,
): Promise<{ out: Transaction; inLeg: Transaction }> {
  const transferPairId = randomUUID();
  const common = {
    userId: params.userId,
    kind: "transfer" as const,
    source: params.source,
    description: params.description,
    transactionDate: params.transactionDate,
    currency: params.currency,
    amountCents: params.amountCents,
    amountBRLCents: params.amountBRLCents,
    isScheduled: params.isScheduled,
    transferPairId,
  };

  const out = await client.transaction.create({
    data: {
      ...common,
      accountId: params.sourceAccountId,
      transferDirection: "out",
    },
  });
  const inLeg = await client.transaction.create({
    data: {
      ...common,
      accountId: params.destAccountId ?? null,
      creditCardId: params.destCreditCardId ?? null,
      transferDirection: "in",
    },
  });

  return { out, inLeg };
}
