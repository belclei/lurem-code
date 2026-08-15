// apps/api/src/accounts/routes.ts
// BACKLOG.md US-3.1 — GET/POST /v1/accounts, PATCH/DELETE /v1/accounts/:id.
// BACKLOG.md US-6.2 (Sprint 11) — PATCH also allows a connected user holding
// a permission=edit SharedItem grant on this account, not just the owner.
// Delete stays owner-only regardless of share permission (§6.10: "tudo de
// view + criar/editar... exceto apagar").
import type { Account } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { NOT_FOUND, SHARE_VIEW_ONLY, VALIDATION_FAILED } from "../errors.js";
import {
  assertInstitutionNicknameRule,
  assertUniqueNickname,
} from "../shared/nickname-rules.js";
import { toAccountResponse } from "./serialize.js";

type EditAccess =
  | { kind: "can_edit"; account: Account }
  | { kind: "view_only" }
  | { kind: "none" };

/** Owner always has edit access; a connected user needs a permission=edit
 * SharedItem grant — permission=view (or no share at all) doesn't reach the
 * account row at all, so "not found" vs. "view only" is resolved purely
 * from the share/ownership rows, never leaking the account's existence to a
 * user with no relationship to it at all. */
async function resolveEditAccess(
  fastify: FastifyInstance,
  id: string,
  userId: string,
): Promise<EditAccess> {
  const owned = await fastify.prisma.account.findFirst({
    where: { id, userId },
  });
  if (owned) return { kind: "can_edit", account: owned };

  const share = await fastify.prisma.sharedItem.findFirst({
    where: { accountId: id, sharedWithUserId: userId, itemType: "account" },
  });
  if (!share) return { kind: "none" };
  if (share.permission !== "edit") return { kind: "view_only" };

  const account = await fastify.prisma.account.findUnique({ where: { id } });
  if (!account) return { kind: "none" };
  return { kind: "can_edit", account };
}

const AccountType = z.enum(["checking", "cash"]);

const CreateAccountBody = z.object({
  type: AccountType,
  institutionId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  currency: z.string().min(1).default("BRL"),
  openingBalanceCents: z.number().int().default(0),
  overdraftLimitCents: z.number().int().min(0).default(0),
});

const UpdateAccountBody = z.object({
  name: z.string().min(1).nullable().optional(),
  institutionId: z.string().min(1).optional(),
  overdraftLimitCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  // BACKLOG.md "Arquivar conta/cartão" — boolean toggle, not a client-supplied
  // timestamp: the server owns archivedAt's value (avoids trusting client
  // clocks) and this keeps the wire contract symmetric with `isActive`.
  archived: z.boolean().optional(),
});

export async function registerAccountRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/accounts",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const accounts = await fastify.prisma.account.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      // No Prisma relation is declared between Account and Institution in
      // this schema (project convention: plain FK id columns everywhere,
      // manual joins in application code — see packages/domain/entities.ts)
      // — batch-fetch and map instead of `include`.
      const institutionIds = [
        ...new Set(
          accounts
            .map((a) => a.institutionId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const institutions = await fastify.prisma.institution.findMany({
        where: { id: { in: institutionIds } },
      });
      const institutionById = new Map(institutions.map((i) => [i.id, i]));

      // Balance derives from this account's transactions (§2.1) — batch-fetch
      // all of the user's account rows and group by accountId.
      const txs = await fastify.prisma.transaction.findMany({
        where: { userId, accountId: { not: null } },
      });
      const txByAccount = new Map<string, typeof txs>();
      for (const tx of txs) {
        if (!tx.accountId) continue;
        const list = txByAccount.get(tx.accountId) ?? [];
        list.push(tx);
        txByAccount.set(tx.accountId, list);
      }

      return accounts.map((account) =>
        toAccountResponse(
          account,
          account.institutionId
            ? (institutionById.get(account.institutionId) ?? null)
            : null,
          txByAccount.get(account.id) ?? [],
        ),
      );
    },
  );

  fastify.post(
    "/v1/accounts",
    { schema: { body: CreateAccountBody }, preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const body = request.body as z.infer<typeof CreateAccountBody>;

      // type=cash: no institution, no overdraft — carteira física não tem
      // instituição/limite de cheque especial (ARQUITETURA.md §6.4).
      let institution: Awaited<
        ReturnType<typeof fastify.prisma.institution.findUnique>
      > = null;
      if (body.type === "cash") {
        if (body.institutionId) {
          throw VALIDATION_FAILED([
            {
              field: "institutionId",
              message: "Carteira não tem instituição.",
            },
          ]);
        }
        if (body.overdraftLimitCents !== 0) {
          throw VALIDATION_FAILED([
            {
              field: "overdraftLimitCents",
              message: "Carteira não tem limite de cheque especial.",
            },
          ]);
        }
      } else {
        if (!body.institutionId) {
          throw VALIDATION_FAILED([
            { field: "institutionId", message: "Escolha uma instituição." },
          ]);
        }
        institution = await fastify.prisma.institution.findUnique({
          where: { id: body.institutionId },
        });
        if (!institution) {
          throw VALIDATION_FAILED([
            { field: "institutionId", message: "Instituição não encontrada." },
          ]);
        }
      }

      await assertUniqueNickname(fastify, userId, body.name);
      await assertInstitutionNicknameRule(
        fastify,
        userId,
        body.institutionId,
        body.name,
        "account",
      );

      const account = await fastify.prisma.account.create({
        data: {
          userId,
          type: body.type,
          institutionId:
            body.type === "cash" ? null : (body.institutionId as string),
          name: body.name,
          currency: body.currency,
          openingBalanceCents: body.openingBalanceCents,
          overdraftLimitCents: body.overdraftLimitCents,
          reconciledBalanceCents: 0,
          reconciledAt: new Date(),
        },
      });

      await fastify.prisma.domainEvent.create({
        data: {
          userId,
          type: "account.created",
          aggregateType: "Account",
          aggregateId: account.id,
          payload: {
            type: account.type,
            name: account.name,
            // Mesma regra de toAccountResponse (serialize.ts) — conta em
            // espécie não tem instituição, "Em Espécie" é o rótulo que a
            // timeline/lista já usa pra ela em todo o resto do app.
            institutionName:
              account.type === "cash"
                ? "Em Espécie"
                : (institution?.name ?? null),
            openingBalanceCents: account.openingBalanceCents,
          },
        },
      });

      reply.code(201);
      return toAccountResponse(account, institution);
    },
  );

  fastify.patch(
    "/v1/accounts/:id",
    { schema: { body: UpdateAccountBody }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateAccountBody>;

      const access = await resolveEditAccess(fastify, id, userId);
      if (access.kind === "none") {
        throw NOT_FOUND();
      }
      if (access.kind === "view_only") {
        throw SHARE_VIEW_ONLY();
      }
      const existing = access.account;
      if (existing.type === "cash" && body.overdraftLimitCents !== undefined) {
        throw VALIDATION_FAILED([
          {
            field: "overdraftLimitCents",
            message: "Carteira não tem limite de cheque especial.",
          },
        ]);
      }
      if (body.institutionId !== undefined) {
        if (existing.type === "cash") {
          throw VALIDATION_FAILED([
            {
              field: "institutionId",
              message: "Carteira não tem instituição.",
            },
          ]);
        }
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
          await assertUniqueNickname(fastify, existing.userId, body.name, {
            accountId: existing.id,
          });
        }
        await assertInstitutionNicknameRule(
          fastify,
          existing.userId,
          finalInstitutionId,
          finalName,
          "account",
          existing.id,
        );
      }

      const account = await fastify.prisma.account.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.institutionId !== undefined
            ? { institutionId: body.institutionId }
            : {}),
          ...(body.overdraftLimitCents !== undefined
            ? { overdraftLimitCents: body.overdraftLimitCents }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.archived !== undefined
            ? { archivedAt: body.archived ? new Date() : null }
            : {}),
        },
      });
      const institution = account.institutionId
        ? await fastify.prisma.institution.findUnique({
            where: { id: account.institutionId },
          })
        : null;

      const changed = (
        [
          "name",
          "institutionId",
          "overdraftLimitCents",
          "isActive",
          "archived",
        ] as const
      ).filter((field) => body[field] !== undefined);
      if (changed.length > 0) {
        await fastify.prisma.domainEvent.create({
          data: {
            userId: existing.userId,
            type: "account.updated",
            aggregateType: "Account",
            aggregateId: account.id,
            payload: {
              institutionName:
                account.type === "cash"
                  ? "Em Espécie"
                  : (institution?.name ?? null),
              name: account.name,
              changed,
            },
          },
        });
      }

      const transactions = await fastify.prisma.transaction.findMany({
        where: { accountId: account.id },
      });
      return toAccountResponse(account, institution, transactions);
    },
  );

  fastify.delete(
    "/v1/accounts/:id",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.account.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw NOT_FOUND();
      }
      // DELETE = soft (§5.2 table) when there's history to lose — never
      // hard-delete an account with transactions attached. BACKLOG.md
      // "Arquivar conta/cartão": when the account has NO transactions at
      // all, there's nothing to protect — allow a real hard delete instead
      // of leaving an empty, permanently-inactive row behind.
      const transactionCount = await fastify.prisma.transaction.count({
        where: { accountId: id },
      });
      if (transactionCount === 0) {
        await fastify.prisma.account.delete({ where: { id } });
      } else {
        await fastify.prisma.account.update({
          where: { id },
          data: { isActive: false },
        });
      }
      return { ok: true };
    },
  );
}
