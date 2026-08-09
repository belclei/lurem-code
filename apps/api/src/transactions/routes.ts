import { randomUUID } from "node:crypto";
// apps/api/src/transactions/routes.ts
// BACKLOG.md US-3.5–3.9 — POST/GET /v1/transactions, ações de agendada
// (confirm/skip), PATCH/DELETE. Regra de dinheiro determinística vive em
// @lurem/core; aqui só orquestra I/O + validação de contrato.
import {
  addMonths,
  balance,
  clampDay,
  makeDate,
  todayAsDate,
} from "@lurem/core";
import type { Prisma, Transaction } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import {
  NOT_FOUND,
  TRANSACTION_ACCOUNT_XOR_CARD,
  VALIDATION_FAILED,
} from "../errors.js";
import { assertOverdraftAllowed } from "./overdraft.js";
import { toTransactionResponse } from "./serialize.js";

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.");

const CreateTransactionBody = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    accountId: z.string().min(1).optional(),
    creditCardId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    description: z.string().min(1),
    transactionDate: IsoDate,
    amountCents: z.number().int().positive(),
    currency: z.string().min(1).default("BRL"),
    isScheduled: z.boolean().default(false),
    confirmOverLimit: z.boolean().optional(),
    // transferência (§6.6): destino é outra conta ou um cartão (pagamento de fatura)
    toAccountId: z.string().min(1).optional(),
    toCreditCardId: z.string().min(1).optional(),
    // parcelamento (§6.6): total de parcelas ≥ 2, só em cartão
    installmentTotal: z.number().int().min(2).optional(),
    installmentHasInterest: z.boolean().optional(),
    // recorrência (§6.7): marca a transação como primeira ocorrência de uma série
    recurring: z.boolean().optional(),
    recurringDayOfMonth: z.number().int().min(1).max(31).optional(),
  })
  .strict();

type CreateBody = z.infer<typeof CreateTransactionBody>;

const UpdateTransactionBody = z
  .object({
    description: z.string().min(1).optional(),
    categoryId: z.string().min(1).nullable().optional(),
    transactionDate: IsoDate.optional(),
    amountCents: z.number().int().positive().optional(),
  })
  .strict();

function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-");
  return makeDate(Number(y), Number(m), Number(d));
}

/** Divide um total em N parcelas inteiras; o resto (centavos) vai na primeira. */
function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? remainder : 0));
}

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

export async function registerTransactionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const { prisma } = fastify;

  /** Saldo confirmado atual de uma conta (fonte única: core.balance). */
  async function accountBalanceCents(account: {
    id: string;
    type: "checking" | "cash";
    openingBalanceCents: number;
    overdraftLimitCents: number;
    isActive: boolean;
  }): Promise<number> {
    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
    });
    return balance({
      account,
      transactions: txs.map(toTransactionLike),
      asOf: new Date(),
    }).valueCents;
  }

  async function findOwnedAccount(userId: string, id: string) {
    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      throw VALIDATION_FAILED([
        { field: "accountId", message: "Conta não encontrada." },
      ]);
    }
    return account;
  }

  async function findOwnedCard(userId: string, id: string) {
    const card = await prisma.creditCard.findFirst({ where: { id, userId } });
    if (!card) {
      throw VALIDATION_FAILED([
        { field: "creditCardId", message: "Cartão não encontrado." },
      ]);
    }
    return card;
  }

  async function validateCategory(
    userId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (!categoryId) return;
    const category = await prisma.category.findFirst({
      where: { id: categoryId, OR: [{ userId }, { userId: null }] },
    });
    if (!category) {
      throw VALIDATION_FAILED([
        { field: "categoryId", message: "Categoria não encontrada." },
      ]);
    }
  }

  fastify.post(
    "/v1/transactions",
    {
      schema: { body: CreateTransactionBody },
      preHandler: requireUser(fastify),
    },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const body = request.body as CreateBody;

      if (body.currency !== "BRL") {
        // Multi-moeda exige fxRate (§1.4); fora do escopo desta sprint.
        throw VALIDATION_FAILED([
          { field: "currency", message: "Apenas BRL nesta versão." },
        ]);
      }
      const amountBRLCents = body.amountCents;
      const transactionDate = parseDate(body.transactionDate);
      await validateCategory(userId, body.categoryId);

      // ---- Transferência (§6.6): par out/in com transferPairId comum ----
      if (body.kind === "transfer") {
        if (body.accountId == null) {
          throw VALIDATION_FAILED([
            { field: "accountId", message: "Transferência sai de uma conta." },
          ]);
        }
        const hasAccountDest = body.toAccountId != null;
        const hasCardDest = body.toCreditCardId != null;
        if (hasAccountDest === hasCardDest) {
          throw VALIDATION_FAILED([
            {
              field: "toAccountId",
              message: "Informe exatamente um destino (conta ou cartão).",
            },
          ]);
        }
        const source = await findOwnedAccount(userId, body.accountId);
        if (hasAccountDest)
          await findOwnedAccount(userId, body.toAccountId as string);
        else await findOwnedCard(userId, body.toCreditCardId as string);

        const today = todayAsDate(new Date());
        const affectsBalanceNow =
          !body.isScheduled && transactionDate.getTime() <= today.getTime();
        if (affectsBalanceNow) {
          assertOverdraftAllowed({
            account: source,
            currentBalanceCents: await accountBalanceCents(source),
            deltaCents: -amountBRLCents,
            confirmOverLimit: body.confirmOverLimit === true,
          });
        }

        const transferPairId = randomUUID();
        const common = {
          userId,
          kind: "transfer" as const,
          source: "manual" as const,
          description: body.description,
          transactionDate,
          currency: "BRL",
          amountCents: body.amountCents,
          amountBRLCents,
          isScheduled: body.isScheduled,
          transferPairId,
        };
        const [out, inLeg] = await prisma.$transaction([
          prisma.transaction.create({
            data: {
              ...common,
              accountId: source.id,
              transferDirection: "out",
            },
          }),
          prisma.transaction.create({
            data: {
              ...common,
              accountId: hasAccountDest ? body.toAccountId : null,
              creditCardId: hasCardDest ? body.toCreditCardId : null,
              transferDirection: "in",
            },
          }),
        ]);
        return reply
          .code(201)
          .send([out, inLeg].map((tx) => toTransactionResponse(tx)));
      }

      // XOR conta/cartão para income/expense (CHECK do schema §1.4)
      const hasAccount = body.accountId != null;
      const hasCard = body.creditCardId != null;
      if (hasAccount === hasCard) throw TRANSACTION_ACCOUNT_XOR_CARD();

      // ---- Parcelamento (§6.6): N linhas, uma por fatura futura ----
      if (body.installmentTotal != null) {
        if (!hasCard) {
          throw VALIDATION_FAILED([
            {
              field: "installmentTotal",
              message: "Parcelamento só em cartão de crédito.",
            },
          ]);
        }
        if (body.kind !== "expense") {
          throw VALIDATION_FAILED([
            { field: "kind", message: "Parcelamento é sempre despesa." },
          ]);
        }
        await findOwnedCard(userId, body.creditCardId as string);
        const n = body.installmentTotal;
        const parts = splitInstallments(body.amountCents, n);
        const groupId = randomUUID();
        const rows: Prisma.TransactionCreateManyInput[] = parts.map(
          (cents, i) => {
            const { year, month } = addMonths(
              {
                year: transactionDate.getUTCFullYear(),
                month: transactionDate.getUTCMonth() + 1,
              },
              i,
            );
            const day = clampDay(year, month, transactionDate.getUTCDate());
            return {
              userId,
              creditCardId: body.creditCardId,
              categoryId: body.categoryId ?? null,
              kind: "expense",
              source: "manual",
              description: body.description,
              transactionDate: makeDate(year, month, day),
              currency: "BRL",
              amountCents: cents,
              amountBRLCents: cents,
              isScheduled: body.isScheduled,
              installmentGroupId: groupId,
              installmentNumber: i + 1,
              installmentTotal: n,
              installmentPurchaseAmountCents: body.amountCents,
              installmentHasInterest: body.installmentHasInterest ?? false,
            };
          },
        );
        await prisma.transaction.createMany({ data: rows });
        const created = await prisma.transaction.findMany({
          where: { installmentGroupId: groupId },
          orderBy: { installmentNumber: "asc" },
        });
        const installmentsByGroupId = new Map([[groupId, created]]);
        return reply
          .code(201)
          .send(
            created.map((tx) =>
              toTransactionResponse(tx, installmentsByGroupId),
            ),
          );
      }

      // ---- Manual income/expense (US-3.5) ----
      if (hasAccount) {
        const account = await findOwnedAccount(
          userId,
          body.accountId as string,
        );
        const today = todayAsDate(new Date());
        const affectsBalanceNow =
          !body.isScheduled && transactionDate.getTime() <= today.getTime();
        if (affectsBalanceNow) {
          const delta =
            body.kind === "expense" ? -amountBRLCents : amountBRLCents;
          assertOverdraftAllowed({
            account,
            currentBalanceCents: await accountBalanceCents(account),
            deltaCents: delta,
            confirmOverLimit: body.confirmOverLimit === true,
          });
        }
      } else {
        await findOwnedCard(userId, body.creditCardId as string);
      }

      const tx = await prisma.transaction.create({
        data: {
          userId,
          accountId: hasAccount ? body.accountId : null,
          creditCardId: hasCard ? body.creditCardId : null,
          categoryId: body.categoryId ?? null,
          kind: body.kind,
          source: "manual",
          description: body.description,
          transactionDate,
          currency: "BRL",
          amountCents: body.amountCents,
          amountBRLCents,
          isScheduled: body.isScheduled,
        },
      });

      // ---- Recorrência na criação (US-3.8): série com esta tx como 1ª ocorrência ----
      // (transfer/parcelada já retornaram acima — aqui kind é income|expense simples)
      if (body.recurring === true) {
        const series = await prisma.recurringTransaction.create({
          data: {
            userId,
            description: body.description,
            kind: body.kind,
            accountId: hasAccount ? body.accountId : null,
            creditCardId: hasCard ? body.creditCardId : null,
            categoryId: body.categoryId ?? null,
            referenceAmountCents: body.amountCents,
            referenceAmountBRLCents: amountBRLCents,
            currency: "BRL",
            dayOfMonth:
              body.recurringDayOfMonth ?? transactionDate.getUTCDate(),
            startDate: transactionDate,
          },
        });
        const linked = await prisma.transaction.update({
          where: { id: tx.id },
          data: { recurringTransactionId: series.id },
        });
        return reply.code(201).send(toTransactionResponse(linked));
      }

      return reply.code(201).send(toTransactionResponse(tx));
    },
  );

  const ListQuery = z.object({
    accountId: z.string().min(1).optional(),
    creditCardId: z.string().min(1).optional(),
    scheduled: z.enum(["true", "false"]).optional(),
  });

  fastify.get(
    "/v1/transactions",
    { schema: { querystring: ListQuery }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const q = request.query as z.infer<typeof ListQuery>;
      const txs = await prisma.transaction.findMany({
        where: {
          userId,
          ...(q.accountId ? { accountId: q.accountId } : {}),
          ...(q.creditCardId ? { creditCardId: q.creditCardId } : {}),
          ...(q.scheduled ? { isScheduled: q.scheduled === "true" } : {}),
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      });
      const installmentsByGroupId = new Map<string, Transaction[]>();
      for (const tx of txs) {
        if (tx.installmentGroupId) {
          if (!installmentsByGroupId.has(tx.installmentGroupId)) {
            installmentsByGroupId.set(tx.installmentGroupId, []);
          }
          const list = installmentsByGroupId.get(tx.installmentGroupId);
          if (list) list.push(tx);
        }
      }
      return txs.map((tx) => toTransactionResponse(tx, installmentsByGroupId));
    },
  );

  async function findOwnedTx(userId: string, id: string): Promise<Transaction> {
    const tx = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw NOT_FOUND();
    return tx;
  }

  // US-3.7 — confirma agendada → real (sai da linha "agendadas").
  fastify.post(
    "/v1/transactions/:id/confirm",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const tx = await findOwnedTx(userId, id);
      if (!tx.isScheduled) {
        throw VALIDATION_FAILED([
          { field: "id", message: "Transação já está confirmada." },
        ]);
      }
      const confirmed = await prisma.transaction.update({
        where: { id: tx.id },
        data: { isScheduled: false },
      });
      return toTransactionResponse(confirmed);
    },
  );

  // US-3.7 — "pulo": remove só esta ocorrência agendada; a série (se houver) segue.
  fastify.post(
    "/v1/transactions/:id/skip",
    { preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const tx = await findOwnedTx(userId, id);
      if (!tx.isScheduled) {
        throw VALIDATION_FAILED([
          { field: "id", message: "Só dá para pular uma agendada." },
        ]);
      }
      await prisma.transaction.delete({ where: { id: tx.id } });
      return reply.code(204).send();
    },
  );

  fastify.patch(
    "/v1/transactions/:id",
    {
      schema: { body: UpdateTransactionBody },
      preHandler: requireUser(fastify),
    },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateTransactionBody>;
      const tx = await findOwnedTx(userId, id);
      if (body.categoryId !== undefined)
        await validateCategory(userId, body.categoryId);
      const updated = await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.categoryId !== undefined
            ? { categoryId: body.categoryId }
            : {}),
          ...(body.transactionDate !== undefined
            ? { transactionDate: parseDate(body.transactionDate) }
            : {}),
          ...(body.amountCents !== undefined
            ? {
                amountCents: body.amountCents,
                amountBRLCents: body.amountCents,
              }
            : {}),
        },
      });
      return toTransactionResponse(updated);
    },
  );

  // DELETE — remove a transação; se for perna de transferência, remove o par.
  fastify.delete(
    "/v1/transactions/:id",
    { preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const tx = await findOwnedTx(userId, id);
      if (tx.transferPairId) {
        await prisma.transaction.deleteMany({
          where: { userId, transferPairId: tx.transferPairId },
        });
      } else {
        await prisma.transaction.delete({ where: { id: tx.id } });
      }
      return reply.code(204).send();
    },
  );
}
