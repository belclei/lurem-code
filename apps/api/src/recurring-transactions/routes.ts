// apps/api/src/recurring-transactions/routes.ts
// BACKLOG.md US-3.9b — gestão das séries de recorrência (§6.7). Criação direta
// (sem depender de uma transação existente), edição/pausa/encerramento/exclusão.
// Nunca cascateia sobre ocorrências passadas: as ocorrências são Transactions
// ligadas por recurringTransactionId — mexer na série não toca nelas.
import { clampDay, makeDate, saoPauloYMD } from "@lurem/core";
import type { Prisma, RecurringTransaction } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { NOT_FOUND } from "../errors.js";
import { createRecurringTransactionSeries } from "./create.js";

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.");

const CreateBody = z
  .object({
    description: z.string().min(1),
    kind: z.enum(["income", "expense"]),
    accountId: z.string().min(1).optional(),
    creditCardId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    referenceAmountCents: z.number().int().positive(),
    dayOfMonth: z.number().int().min(1).max(31),
    isVariableAmount: z.boolean().default(false),
    startDate: IsoDate,
    endDate: IsoDate.nullable().optional(),
  })
  .strict();

const UpdateBody = z
  .object({
    description: z.string().min(1).optional(),
    referenceAmountCents: z.number().int().positive().optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    accountId: z.string().min(1).nullable().optional(),
    creditCardId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    isVariableAmount: z.boolean().optional(),
    isActive: z.boolean().optional(),
    endDate: IsoDate.nullable().optional(),
  })
  .strict();

function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-");
  return makeDate(Number(y), Number(m), Number(d));
}

// Timeline structural events for the series' own lifecycle (§6.7/§6.12) —
// TimelineEventRow/EVENT_TEXT (@lurem/ui) already has copy for these 3
// types ("Nova recorrência cadastrada"/"pausada"/"encerrada"); this route
// just never wrote the DomainEvent that GET /v1/timeline reads.
async function fireEvent(
  fastify: FastifyInstance,
  userId: string,
  type: string,
  aggregateId: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await fastify.prisma.domainEvent.create({
    data: {
      userId,
      type,
      aggregateType: "RecurringTransaction",
      aggregateId,
      payload,
    },
  });
}

function serialize(r: RecurringTransaction) {
  return {
    id: r.id,
    description: r.description,
    kind: r.kind,
    accountId: r.accountId,
    creditCardId: r.creditCardId,
    categoryId: r.categoryId,
    referenceAmountCents: r.referenceAmountCents,
    referenceAmountBRLCents: r.referenceAmountBRLCents,
    currency: r.currency,
    dayOfMonth: r.dayOfMonth,
    isVariableAmount: r.isVariableAmount,
    isActive: r.isActive,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
  };
}

export async function registerRecurringTransactionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const { prisma } = fastify;

  fastify.post(
    "/v1/recurring-transactions",
    { schema: { body: CreateBody }, preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const body = request.body as z.infer<typeof CreateBody>;
      const series = await createRecurringTransactionSeries(prisma, userId, {
        description: body.description,
        kind: body.kind,
        accountId: body.accountId,
        creditCardId: body.creditCardId,
        categoryId: body.categoryId,
        referenceAmountCents: body.referenceAmountCents,
        dayOfMonth: body.dayOfMonth,
        isVariableAmount: body.isVariableAmount,
        startDate: parseDate(body.startDate),
        endDate: body.endDate ? parseDate(body.endDate) : null,
      });
      return reply.code(201).send(serialize(series));
    },
  );

  fastify.get(
    "/v1/recurring-transactions",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const series = await prisma.recurringTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      return series.map(serialize);
    },
  );

  // Backlog: "Confirmar todo mês" (isVariableAmount, §6.7 comment "conta de
  // luz") — quando marcado, a ocorrência do mês NÃO é considerada confirmada
  // automaticamente (diferente do padrão): a partir do dia seguinte à data
  // prevista, se ainda não existe um RecurringFulfillment para (série,
  // ano, mês), a ocorrência fica "pendente de aprovação". Só olha o mês
  // corrente — uma série que ficou pendente há vários meses reaparece aqui
  // igual (não acumula um item por mês em atraso), recorte pragmático para
  // não precisar varrer todo o histórico da série a cada request.
  fastify.get(
    "/v1/recurring-transactions/pending",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const now = new Date();
      const { year, month, day } = saoPauloYMD(now);
      const todayDate = makeDate(year, month, day);

      const series = await prisma.recurringTransaction.findMany({
        where: { userId, isActive: true, isVariableAmount: true },
      });

      const pending: Array<{
        id: string;
        description: string;
        referenceAmountCents: number;
        dueDate: string;
        kind: string;
        accountId: string | null;
        creditCardId: string | null;
      }> = [];

      for (const s of series) {
        const dueDay = clampDay(year, month, s.dayOfMonth);
        const dueDate = makeDate(year, month, dueDay);
        if (s.startDate > dueDate) continue;
        if (s.endDate && s.endDate < dueDate) continue;
        // "A partir do dia seguinte à data de ocorrência" — estritamente
        // depois, não no próprio dia (ainda não venceu = não é pendente).
        if (todayDate <= dueDate) continue;
        const fulfilled = await prisma.recurringFulfillment.findUnique({
          where: {
            recurringTransactionId_year_month: {
              recurringTransactionId: s.id,
              year,
              month,
            },
          },
        });
        if (fulfilled) continue;
        pending.push({
          id: s.id,
          description: s.description,
          referenceAmountCents: s.referenceAmountCents,
          dueDate: dueDate.toISOString().slice(0, 10),
          kind: s.kind,
          accountId: s.accountId,
          creditCardId: s.creditCardId,
        });
      }
      return pending;
    },
  );

  async function findOwned(
    userId: string,
    id: string,
  ): Promise<RecurringTransaction> {
    const series = await prisma.recurringTransaction.findFirst({
      where: { id, userId },
    });
    if (!series) throw NOT_FOUND();
    return series;
  }

  fastify.patch(
    "/v1/recurring-transactions/:id",
    { schema: { body: UpdateBody }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateBody>;
      await findOwned(userId, id);
      const updated = await prisma.recurringTransaction.update({
        where: { id },
        data: {
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.referenceAmountCents !== undefined
            ? {
                referenceAmountCents: body.referenceAmountCents,
                referenceAmountBRLCents: body.referenceAmountCents,
              }
            : {}),
          ...(body.dayOfMonth !== undefined
            ? { dayOfMonth: body.dayOfMonth }
            : {}),
          ...(body.accountId !== undefined
            ? { accountId: body.accountId }
            : {}),
          ...(body.creditCardId !== undefined
            ? { creditCardId: body.creditCardId }
            : {}),
          ...(body.categoryId !== undefined
            ? { categoryId: body.categoryId }
            : {}),
          ...(body.isVariableAmount !== undefined
            ? { isVariableAmount: body.isVariableAmount }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.endDate !== undefined
            ? { endDate: body.endDate ? parseDate(body.endDate) : null }
            : {}),
        },
      });
      if (body.isActive === false) {
        await fireEvent(fastify, userId, "recurring.paused", id, {
          itemLabel: updated.description,
        });
      }
      if (body.endDate) {
        await fireEvent(fastify, userId, "recurring.ended", id, {
          itemLabel: updated.description,
        });
      }
      return serialize(updated);
    },
  );

  // Exclui a série. Ocorrências passadas (Transactions) ficam — só desliga o
  // vínculo para não deixar FK órfã apontando para uma série inexistente.
  fastify.delete(
    "/v1/recurring-transactions/:id",
    { preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      await findOwned(userId, id);
      await prisma.transaction.updateMany({
        where: { userId, recurringTransactionId: id },
        data: { recurringTransactionId: null },
      });
      await prisma.recurringTransaction.delete({ where: { id } });
      return reply.code(204).send();
    },
  );
}
