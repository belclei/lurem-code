import { randomUUID } from "node:crypto";
// apps/api/src/transactions/routes.ts
// BACKLOG.md US-3.5–3.9 — POST/GET /v1/transactions, ações de agendada
// (confirm/skip), PATCH/DELETE. Regra de dinheiro determinística vive em
// @lurem/core; aqui só orquestra I/O + validação de contrato.
import { addMonths, clampDay, makeDate, splitInstallments } from "@lurem/core";
import type { Prisma, Transaction } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import {
  NOT_FOUND,
  TRANSACTION_ACCOUNT_XOR_CARD,
  VALIDATION_FAILED,
} from "../errors.js";
import { createRecurringTransactionSeries } from "../recurring-transactions/create.js";
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
    // Optional only for transfers (§6.6): moving money between your own
    // accounts is self-explanatory, unlike an income/expense entry.
    description: z.string().min(1).optional(),
    transactionDate: IsoDate,
    amountCents: z.number().int().positive(),
    currency: z.string().min(1).default("BRL"),
    isScheduled: z.boolean().default(false),
    // transferência (§6.6): destino é outra conta ou um cartão (pagamento de fatura)
    toAccountId: z.string().min(1).optional(),
    toCreditCardId: z.string().min(1).optional(),
    // parcelamento (§6.6): total de parcelas ≥ 2, só em cartão
    installmentTotal: z.number().int().min(2).optional(),
    // recorrência (§6.7): marca a transação como primeira ocorrência de uma série
    recurring: z.boolean().optional(),
    recurringDayOfMonth: z.number().int().min(1).max(31).optional(),
    // "Confirmar todo mês" (isVariableAmount no schema — nome do campo
    // mantido por não forçar migration, ver create.ts/CLAUDE.md comment em
    // RecurringPage.tsx): quando true, a ocorrência do mês só conta como
    // confirmada depois que o usuário aprovar o valor real (§6.7 item 3).
    recurringConfirmMonthly: z.boolean().optional(),
    recurringEndDate: IsoDate.nullable().optional(),
  })
  .strict()
  .refine((data) => data.kind === "transfer" || Boolean(data.description), {
    message: "Descrição é obrigatória.",
    path: ["description"],
  });

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

export async function registerTransactionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const { prisma } = fastify;

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

      // Parcelamento e recorrência são mutuamente exclusivos (§6.6/§6.7): uma
      // compra parcelada já é uma série de N linhas fixas (o "parcelamento"
      // dela); recorrer significaria criar uma nova série todo mês a partir
      // de uma transação que já É uma série — não existe uma regra explícita
      // pra isso no schema (nada impede tecnicamente as duas colunas juntas),
      // mas a natureza dos dois conceitos não permite combiná-los, então a
      // API recusa explicitamente em vez de deixar o comportamento
      // indefinido (ver NewTransactionDialog.tsx, que já torna os checkboxes
      // mutuamente exclusivos na UI).
      if (body.recurring === true && body.installmentTotal != null) {
        throw VALIDATION_FAILED([
          {
            field: "recurring",
            message: "Não é possível parcelar e recorrer na mesma transação.",
          },
        ]);
      }

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

        const transferPairId = randomUUID();
        const common = {
          userId,
          kind: "transfer" as const,
          source: "manual" as const,
          description: body.description ?? "",
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
      // Guaranteed non-empty by CreateTransactionBody's own refine (only
      // "transfer" — already returned above — may omit it).
      const description = body.description as string;

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
              description,
              transactionDate: makeDate(year, month, day),
              currency: "BRL",
              amountCents: cents,
              amountBRLCents: cents,
              isScheduled: body.isScheduled,
              installmentGroupId: groupId,
              installmentNumber: i + 1,
              installmentTotal: n,
              installmentPurchaseAmountCents: body.amountCents,
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
        await findOwnedAccount(userId, body.accountId as string);
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
          description,
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
        // Shared with POST /v1/recurring-transactions (create.ts) — never
        // duplicate the series-creation logic between the two call sites.
        const series = await createRecurringTransactionSeries(prisma, userId, {
          description,
          kind: body.kind,
          accountId: hasAccount ? body.accountId : null,
          creditCardId: hasCard ? body.creditCardId : null,
          categoryId: body.categoryId ?? null,
          referenceAmountCents: body.amountCents,
          dayOfMonth: body.recurringDayOfMonth ?? transactionDate.getUTCDate(),
          isVariableAmount: body.recurringConfirmMonthly ?? false,
          startDate: transactionDate,
          endDate: body.recurringEndDate
            ? parseDate(body.recurringEndDate)
            : null,
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

  // Confirm/skip on a scheduled occurrence of a recurring series is also the
  // ONLY place that closes the loop back to RecurringFulfillment — the
  // record `/recurring-transactions/pending` and `isFulfilledThisMonth`
  // (@lurem/core) check to know a month was actually handled. Without this,
  // a series stayed "pending" forever after the user confirmed it (see
  // report). Upserted (not created) because @@unique([recurringTransactionId,
  // year, month]) means a second confirm/skip in the same month — e.g. the
  // cron already created one fulfillment record some other way in the
  // future — must overwrite, not throw.
  async function recordFulfillment(
    tx: Transaction,
    outcome: {
      transactionId: string | null;
      method: "scheduled_confirm" | "manual";
    },
  ): Promise<void> {
    if (!tx.recurringTransactionId) return;
    const year = tx.transactionDate.getUTCFullYear();
    const month = tx.transactionDate.getUTCMonth() + 1;
    await prisma.recurringFulfillment.upsert({
      where: {
        recurringTransactionId_year_month: {
          recurringTransactionId: tx.recurringTransactionId,
          year,
          month,
        },
      },
      create: {
        recurringTransactionId: tx.recurringTransactionId,
        year,
        month,
        transactionId: outcome.transactionId,
        method: outcome.method,
      },
      update: {
        transactionId: outcome.transactionId,
        method: outcome.method,
      },
    });
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
      await recordFulfillment(confirmed, {
        transactionId: confirmed.id,
        method: "scheduled_confirm",
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
      // Recorded before the delete: once the row is gone, tx.transactionDate
      // (needed to derive year/month) is gone with it.
      await recordFulfillment(tx, { transactionId: null, method: "manual" });
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
      const data = {
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
      };
      // Uma transferência é 2 linhas (out/in) que precisam concordar em
      // descrição/data/valor — editar só uma desincronizaria o par (a perna
      // "in" mostraria um valor diferente da "out"). Atualiza as duas juntas,
      // atomicamente, quando a transação editada faz parte de um par.
      const [updated] = tx.transferPairId
        ? await prisma.$transaction([
            prisma.transaction.update({ where: { id: tx.id }, data }),
            prisma.transaction.updateMany({
              where: {
                userId,
                transferPairId: tx.transferPairId,
                id: { not: tx.id },
              },
              data,
            }),
          ])
        : [await prisma.transaction.update({ where: { id: tx.id }, data })];
      // Editar em vez de criar/apagar não deixa rastro nenhum na timeline por
      // si só (o card renderiza o estado atual) — issues.md: "quando algum
      // dado financeiro for alterado, deve aparecer na timeline". Criação
      // não emite um evento próprio: a transação em si já É a entry.
      await prisma.domainEvent.create({
        data: {
          userId,
          type: "transaction.updated",
          aggregateType: "Transaction",
          aggregateId: updated.id,
          payload: {},
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
      // Apagar remove a única entry que representava esta transação —
      // sem um domain event, o gasto/receita simplesmente some da timeline
      // sem deixar rastro.
      await prisma.domainEvent.create({
        data: {
          userId,
          type: "transaction.deleted",
          aggregateType: "Transaction",
          aggregateId: tx.id,
          payload: {},
        },
      });
      return reply.code(204).send();
    },
  );
}
