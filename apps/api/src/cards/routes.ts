// apps/api/src/cards/routes.ts
// BACKLOG.md US-3.2 — GET/POST /v1/cards, PATCH/DELETE /v1/cards/:id,
// GET /v1/cards/:id/invoice?ref=YYYY-MM.
import { sumCardTransactionsForInvoiceMonth } from "@lurem/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { INTERNAL, NOT_FOUND, VALIDATION_FAILED } from "../errors.js";
import {
  assertInstitutionNicknameRule,
  assertUniqueNickname,
} from "../shared/nickname-rules.js";
import { toCardResponse } from "./serialize.js";

const CreateCardBody = z.object({
  institutionId: z.string().min(1),
  name: z.string().min(1).optional(),
  limitCents: z.number().int().min(0),
  // 1..31 — clamp ao último dia do mês acontece só no cálculo de fatura
  // (IMPLEMENTACAO.md §3.4), não na criação (US-3.2: closingDay=31 aceito).
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  autoDebitAccountId: z.string().min(1).optional(),
  currency: z.string().min(1).default("BRL"),
});

const UpdateCardBody = z.object({
  name: z.string().min(1).nullable().optional(),
  institutionId: z.string().min(1).optional(),
  limitCents: z.number().int().min(0).optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  autoDebitAccountId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  // See accounts/routes.ts's UpdateAccountBody.archived — same rationale.
  archived: z.boolean().optional(),
});

const InvoiceQuery = z.object({
  ref: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato esperado: YYYY-MM."),
});

export async function registerCardRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/cards",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const cards = await fastify.prisma.creditCard.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      // No Prisma relation is declared between CreditCard and Institution in
      // this schema (project convention: plain FK id columns, manual joins
      // in application code) — batch-fetch and map instead of `include`.
      const institutions = await fastify.prisma.institution.findMany({
        where: { id: { in: [...new Set(cards.map((c) => c.institutionId))] } },
      });
      const institutionById = new Map(institutions.map((i) => [i.id, i]));
      // usedCents/isOverLimit derive from this card's transactions (§2.1,
      // same pattern as accounts/routes.ts) — batch-fetch and group by
      // creditCardId instead of a per-card query.
      const txs = await fastify.prisma.transaction.findMany({
        where: { userId, creditCardId: { not: null } },
      });
      const txByCard = new Map<string, typeof txs>();
      for (const tx of txs) {
        if (!tx.creditCardId) continue;
        const list = txByCard.get(tx.creditCardId) ?? [];
        list.push(tx);
        txByCard.set(tx.creditCardId, list);
      }
      return cards.map((card) => {
        const institution = institutionById.get(card.institutionId);
        if (!institution) {
          // institutionId is NOT NULL on CreditCard — a miss here means the
          // referenced Institution row was deleted out from under it, a data
          // integrity issue, not a client-facing "not found".
          throw INTERNAL();
        }
        return toCardResponse(card, institution, txByCard.get(card.id) ?? []);
      });
    },
  );

  fastify.post(
    "/v1/cards",
    { schema: { body: CreateCardBody }, preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const body = request.body as z.infer<typeof CreateCardBody>;

      const institution = await fastify.prisma.institution.findUnique({
        where: { id: body.institutionId },
      });
      if (!institution) {
        throw VALIDATION_FAILED([
          { field: "institutionId", message: "Instituição não encontrada." },
        ]);
      }

      if (body.autoDebitAccountId) {
        const account = await fastify.prisma.account.findFirst({
          where: { id: body.autoDebitAccountId, userId },
        });
        if (!account) {
          throw VALIDATION_FAILED([
            { field: "autoDebitAccountId", message: "Conta não encontrada." },
          ]);
        }
      }

      await assertUniqueNickname(fastify, userId, body.name);
      await assertInstitutionNicknameRule(
        fastify,
        userId,
        body.institutionId,
        body.name,
        "card",
      );

      const card = await fastify.prisma.creditCard.create({
        data: {
          userId,
          institutionId: body.institutionId,
          name: body.name,
          limitCents: body.limitCents,
          closingDay: body.closingDay,
          dueDay: body.dueDay,
          autoDebitAccountId: body.autoDebitAccountId,
          currency: body.currency,
        },
      });

      await fastify.prisma.domainEvent.create({
        data: {
          userId,
          type: "card.created",
          aggregateType: "CreditCard",
          aggregateId: card.id,
          payload: {
            name: card.name,
            institutionName: institution.name,
          },
        },
      });

      reply.code(201);
      return toCardResponse(card, institution);
    },
  );

  fastify.patch(
    "/v1/cards/:id",
    { schema: { body: UpdateCardBody }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateCardBody>;

      const existing = await fastify.prisma.creditCard.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw NOT_FOUND();
      }

      if (body.autoDebitAccountId) {
        const account = await fastify.prisma.account.findFirst({
          where: { id: body.autoDebitAccountId, userId },
        });
        if (!account) {
          throw VALIDATION_FAILED([
            { field: "autoDebitAccountId", message: "Conta não encontrada." },
          ]);
        }
      }
      if (body.institutionId !== undefined) {
        const institution = await fastify.prisma.institution.findUnique({
          where: { id: body.institutionId },
        });
        if (!institution) {
          throw VALIDATION_FAILED([
            { field: "institutionId", message: "Instituição não encontrada." },
          ]);
        }
      }
      if (body.name !== undefined || body.institutionId !== undefined) {
        const finalName = body.name !== undefined ? body.name : existing.name;
        const finalInstitutionId =
          body.institutionId !== undefined
            ? body.institutionId
            : existing.institutionId;
        if (body.name !== undefined) {
          await assertUniqueNickname(fastify, userId, body.name, {
            cardId: existing.id,
          });
        }
        await assertInstitutionNicknameRule(
          fastify,
          userId,
          finalInstitutionId,
          finalName,
          "card",
          existing.id,
        );
      }

      const card = await fastify.prisma.creditCard.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.institutionId !== undefined
            ? { institutionId: body.institutionId }
            : {}),
          ...(body.limitCents !== undefined
            ? { limitCents: body.limitCents }
            : {}),
          ...(body.closingDay !== undefined
            ? { closingDay: body.closingDay }
            : {}),
          ...(body.dueDay !== undefined ? { dueDay: body.dueDay } : {}),
          ...(body.autoDebitAccountId !== undefined
            ? { autoDebitAccountId: body.autoDebitAccountId }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.archived !== undefined
            ? { archivedAt: body.archived ? new Date() : null }
            : {}),
        },
      });
      const institution = await fastify.prisma.institution.findUnique({
        where: { id: card.institutionId },
      });
      if (!institution) {
        throw INTERNAL();
      }

      const changed = (
        [
          "name",
          "institutionId",
          "limitCents",
          "closingDay",
          "dueDay",
          "autoDebitAccountId",
          "isActive",
          "archived",
        ] as const
      ).filter((field) => body[field] !== undefined);
      if (changed.length > 0) {
        await fastify.prisma.domainEvent.create({
          data: {
            userId,
            type: "card.updated",
            aggregateType: "CreditCard",
            aggregateId: card.id,
            payload: {
              name: card.name,
              institutionName: institution.name,
              changed,
            },
          },
        });
      }

      const transactions = await fastify.prisma.transaction.findMany({
        where: { creditCardId: card.id },
      });
      return toCardResponse(card, institution, transactions);
    },
  );

  fastify.delete(
    "/v1/cards/:id",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.creditCard.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw NOT_FOUND();
      }
      // See accounts/routes.ts's DELETE handler — same hard-delete-when-no-
      // history / soft-delete-otherwise rule (BACKLOG.md "Arquivar conta/cartão").
      const transactionCount = await fastify.prisma.transaction.count({
        where: { creditCardId: id },
      });
      if (transactionCount === 0) {
        await fastify.prisma.creditCard.delete({ where: { id } });
      } else {
        await fastify.prisma.creditCard.update({
          where: { id },
          data: { isActive: false },
        });
      }
      return { ok: true };
    },
  );

  fastify.get(
    "/v1/cards/:id/invoice",
    { schema: { querystring: InvoiceQuery }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const { ref } = request.query as z.infer<typeof InvoiceQuery>;

      const card = await fastify.prisma.creditCard.findFirst({
        where: { id, userId },
      });
      if (!card) {
        throw NOT_FOUND();
      }

      const [yearStr, monthStr] = ref.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);

      // Sprint 4 has no transaction-creation endpoint yet (US-3.5) — the
      // query below is wired for correctness the moment transactions exist;
      // today it always resolves to [].
      const transactions = await fastify.prisma.transaction.findMany({
        where: { creditCardId: id },
      });

      return sumCardTransactionsForInvoiceMonth(
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
        year,
        month,
      );
    },
  );

  // POST /v1/cards/:id/close-invoice — manually close the current invoice period
  fastify.post(
    "/v1/cards/:id/close-invoice",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const card = await fastify.prisma.creditCard.findFirst({
        where: { id, userId },
      });
      if (!card) {
        throw NOT_FOUND();
      }

      // Compute the currently open month
      const today = new Date();
      const openMonth = {
        year: today.getUTCFullYear(),
        month: today.getUTCMonth() + 1,
      };

      // Only allow closing if not already manually closed for this period
      if (
        card.manualClosureYear === openMonth.year &&
        card.manualClosureMonth === openMonth.month
      ) {
        throw VALIDATION_FAILED([
          { field: "card", message: "Fatura já foi fechada neste período." },
        ]);
      }

      await fastify.prisma.creditCard.update({
        where: { id },
        data: {
          manualClosureYear: openMonth.year,
          manualClosureMonth: openMonth.month,
        },
      });

      return { success: true };
    },
  );

  // POST /v1/cards/:id/reopen-invoice — revert manual closure
  fastify.post(
    "/v1/cards/:id/reopen-invoice",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const card = await fastify.prisma.creditCard.findFirst({
        where: { id, userId },
      });
      if (!card) {
        throw NOT_FOUND();
      }

      // Only allow reopening if currently manually closed
      if (!card.manualClosureYear || !card.manualClosureMonth) {
        throw VALIDATION_FAILED([
          { field: "card", message: "Fatura não foi fechada manualmente." },
        ]);
      }

      await fastify.prisma.creditCard.update({
        where: { id },
        data: {
          manualClosureYear: null,
          manualClosureMonth: null,
        },
      });

      return { success: true };
    },
  );
}
