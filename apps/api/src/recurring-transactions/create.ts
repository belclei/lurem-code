// apps/api/src/recurring-transactions/create.ts
// Shared series-creation logic (§6.7) — extracted so both
// POST /v1/recurring-transactions (dedicated management route) and
// POST /v1/transactions (recorrência marcada dentro do dialog de nova
// transação, §6.7/backlog "Recorrência integrada ao dialog") create a
// `RecurringTransaction` the exact same way. Never duplicate this: the XOR
// (account vs card) validation and the `recurring.created` DomainEvent must
// stay in sync between both call sites.
import type { Prisma, RecurringTransaction } from "@lurem/db";
import { VALIDATION_FAILED } from "../errors.js";

export interface CreateRecurringSeriesInput {
  description: string;
  kind: "income" | "expense";
  accountId?: string | null;
  creditCardId?: string | null;
  categoryId?: string | null;
  referenceAmountCents: number;
  dayOfMonth: number;
  isVariableAmount?: boolean;
  startDate: Date;
  endDate?: Date | null;
}

export async function createRecurringTransactionSeries(
  prisma: Prisma.TransactionClient,
  userId: string,
  input: CreateRecurringSeriesInput,
): Promise<RecurringTransaction> {
  const hasAccount = input.accountId != null;
  const hasCard = input.creditCardId != null;
  if (hasAccount === hasCard) {
    throw VALIDATION_FAILED([
      {
        field: "accountId",
        message: "A série pertence a uma conta ou a um cartão.",
      },
    ]);
  }
  const series = await prisma.recurringTransaction.create({
    data: {
      userId,
      description: input.description,
      kind: input.kind,
      accountId: input.accountId ?? null,
      creditCardId: input.creditCardId ?? null,
      categoryId: input.categoryId ?? null,
      referenceAmountCents: input.referenceAmountCents,
      referenceAmountBRLCents: input.referenceAmountCents,
      currency: "BRL",
      dayOfMonth: input.dayOfMonth,
      isVariableAmount: input.isVariableAmount ?? false,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    },
  });
  await fireRecurringCreatedEvent(prisma, userId, series);
  return series;
}

// Timeline structural events for the series' own lifecycle (§6.7/§6.12) —
// TimelineEventRow/EVENT_TEXT (@lurem/ui) already has copy for
// "recurring.created"; both call sites need to write it or the new series
// never shows up on the Timeline (see routes.test.ts's regression test).
async function fireRecurringCreatedEvent(
  prisma: Prisma.TransactionClient,
  userId: string,
  series: RecurringTransaction,
): Promise<void> {
  await prisma.domainEvent.create({
    data: {
      userId,
      type: "recurring.created",
      aggregateType: "RecurringTransaction",
      aggregateId: series.id,
      payload: { itemLabel: series.description } as Prisma.InputJsonValue,
    },
  });
}
