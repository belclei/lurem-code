import { balance } from "@lurem/core";
// apps/api/src/timeline/routes.ts
// BACKLOG.md US-6.1 — GET /v1/timeline: Transaction+DomainEvent interleaved,
// agregado por dia, paginado por cursor, filtrável por período/conta-cartão
// (multi-select)/tipo de evento/categoria (ARQUITETURA.md §6.12).
//
// A TimelineAlertBanner (§6.12/§6.4) e o total do painel lateral não têm rota
// própria aqui — ambos derivam de GET /v1/accounts e GET /v1/cards, que já
// expõem isOverLimit/balanceCents/usedCents; duplicar esse cálculo numa rota
// nova seria uma segunda fonte de verdade para o mesmo número (§0).
import type { Prisma } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { buildTimelinePage, synthesizeStructuralDates } from "./aggregate.js";

const TimelineQuery = z.object({
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "cursor no formato AAAA-MM-DD.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(90).default(20),
  accountIds: z.string().optional(),
  cardIds: z.string().optional(),
  types: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from no formato AAAA-MM-DD.")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to no formato AAAA-MM-DD.")
    .optional(),
});

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export async function registerTimelineRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/timeline",
    {
      schema: { querystring: TimelineQuery },
      preHandler: requireUser(fastify),
    },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const query = request.query as z.infer<typeof TimelineQuery>;

      const accountIds = splitCsv(query.accountIds);
      const cardIds = splitCsv(query.cardIds);
      const types = splitCsv(query.types);
      const fromDate = query.from
        ? new Date(`${query.from}T00:00:00.000Z`)
        : undefined;
      const toDate = query.to
        ? new Date(`${query.to}T23:59:59.999Z`)
        : undefined;

      // Filtro de conta/cartão é um chip multi-select unificado (§6.12): se o
      // usuário selecionou qualquer conta/cartão, só essas instituições
      // aparecem — accountIds/cardIds juntos formam o conjunto visível.
      const entityFilter: Prisma.TransactionWhereInput[] = [];
      if (accountIds) entityFilter.push({ accountId: { in: accountIds } });
      if (cardIds) entityFilter.push({ creditCardId: { in: cardIds } });

      const txWhere: Prisma.TransactionWhereInput = {
        userId,
        ...(entityFilter.length > 0 ? { OR: entityFilter } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(fromDate || toDate
          ? {
              transactionDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      };

      const eventEntityFilter: Prisma.DomainEventWhereInput[] = [];
      if (accountIds) {
        eventEntityFilter.push({
          aggregateType: "Account",
          aggregateId: { in: accountIds },
        });
      }
      if (cardIds) {
        eventEntityFilter.push({
          aggregateType: "CreditCard",
          aggregateId: { in: cardIds },
        });
      }

      const eventWhere: Prisma.DomainEventWhereInput = {
        userId,
        ...(eventEntityFilter.length > 0 ? { OR: eventEntityFilter } : {}),
        ...(types ? { type: { in: types } } : {}),
        ...(fromDate || toDate
          ? {
              createdAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      };

      // Transações só desaparecem se o usuário filtrou por tipo de evento e
      // "transaction" (pseudo-tipo) não está entre os selecionados.
      const includeTransactions = !types || types.includes("transaction");

      const [transactions, events, allAccounts, allTransactions, user] =
        await Promise.all([
          includeTransactions
            ? fastify.prisma.transaction.findMany({ where: txWhere })
            : Promise.resolve([]),
          // categoryId não filtra events — DomainEvent não tem esse conceito
          // (§6 catalog); o filtro de categoria só restringe transações.
          fastify.prisma.domainEvent.findMany({ where: eventWhere }),
          // Fetch all accounts for current balance calculation
          fastify.prisma.account.findMany({ where: { userId } }),
          // Fetch all transactions (unfiltered) to calculate retroactive balances
          fastify.prisma.transaction.findMany({ where: { userId } }),
          fastify.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        ]);

      // issues.md: aniversário/dia de cadastro devem aparecer mesmo sem
      // transação/evento naquele dia — mas ainda respeitando from/to.
      const structuralDates = synthesizeStructuralDates(user).filter(
        (date) =>
          (!query.from || date >= query.from) &&
          (!query.to || date <= query.to),
      );

      const page = buildTimelinePage(transactions, events, {
        cursor: query.cursor,
        limit: query.limit,
        structuralDates,
      });

      // Calculate current balance by summing all accounts
      let currentBalanceCents = 0;
      for (const account of allAccounts) {
        const accountTransactions = allTransactions.filter(
          (tx) => tx.accountId === account.id,
        );
        const money = balance({
          account: {
            id: account.id,
            type: account.type,
            openingBalanceCents: account.openingBalanceCents,
            overdraftLimitCents: account.overdraftLimitCents,
            isActive: account.isActive,
          },
          transactions: accountTransactions.map((tx) => ({
            id: tx.id,
            kind: tx.kind,
            transferDirection: tx.transferDirection ?? undefined,
            amountBRLCents: tx.amountBRLCents,
            transactionDate: tx.transactionDate,
            isScheduled: tx.isScheduled,
            recurringTransactionId: tx.recurringTransactionId ?? undefined,
          })),
          asOf: new Date(),
        });
        currentBalanceCents += money.valueCents;
      }

      // Calculate retroactive balance for each day by walking backward through timeline
      // Note: balance is calculated from ALL transactions (ignoring filters), as the
      // "saldo do dia" represents actual account balance, not filtered balance.
      const dayBalances = new Map<string, number>();

      // Sort all transactions by date for balance calculation (unfiltered)
      const transactionsByDate = new Map<string, typeof allTransactions>();
      for (const tx of allTransactions) {
        const dateStr = tx.transactionDate.toISOString().slice(0, 10);
        const list = transactionsByDate.get(dateStr) ?? [];
        list.push(tx);
        transactionsByDate.set(dateStr, list);
      }

      // Process all dates that appear in the timeline or the transaction history
      const allDates = new Set([
        ...page.days.map((d) => d.date),
        ...transactionsByDate.keys(),
      ]);
      const sortedDates = [...allDates].sort((a, b) => (a < b ? 1 : -1));

      let runningBalance = currentBalanceCents;
      for (const date of sortedDates) {
        // Record the balance at the end of this day
        if (page.days.some((d) => d.date === date)) {
          dayBalances.set(date, runningBalance);
        }

        // Calculate impact of unscheduled transactions on this day
        const dayTransactions = transactionsByDate.get(date) ?? [];
        let dayImpact = 0;
        for (const tx of dayTransactions) {
          // Only include confirmed (not scheduled) transactions in balance
          if (tx.isScheduled) continue;
          if (tx.kind === "income") {
            dayImpact += tx.amountBRLCents;
          } else if (tx.kind === "expense") {
            dayImpact -= tx.amountBRLCents;
          } else if (tx.kind === "transfer") {
            // Transfer out to another account: no net impact on total balance
            // (money moves from one account to another, both user-owned)
            // Transfer out to card (paying bill): expense from source account
            if (tx.creditCardId) {
              // Payment to credit card: reduce balance (expense)
              dayImpact -= tx.amountBRLCents;
            }
            // else: transfer between accounts, no net impact
          }
        }

        // Update running balance for the previous day
        runningBalance -= dayImpact;
      }

      // Merge balances into response
      const pageWithBalances = {
        ...page,
        days: page.days.map((day) => ({
          ...day,
          balanceCents: dayBalances.get(day.date) ?? 0,
        })),
      };

      return pageWithBalances;
    },
  );
}
