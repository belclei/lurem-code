// apps/api/src/timeline/routes.ts
// BACKLOG.md US-6.1 — GET /v1/timeline: Transaction+DomainEvent interleaved,
// agregado por dia, paginado por cursor, filtrável por período/conta-cartão
// (multi-select)/tipo de evento/categoria (ARQUITETURA.md §6.12).
//
// A TimelineAlertBanner (§6.12/§6.4) e o total do painel lateral não têm rota
// própria aqui — ambos derivam de GET /v1/accounts e GET /v1/cards, que já
// expõem isOverLimit/balanceCents/usedCents; duplicar esse cálculo numa rota
// nova seria uma segunda fonte de verdade para o mesmo número (§0).
import {
  balance,
  clampDay,
  makeDate,
  saoPauloYMD,
  sumCardTransactionsForInvoiceMonth,
} from "@lurem/core";
import type { Prisma, RecurringTransaction, Transaction } from "@lurem/db";
import type { CreditCardLike, TransactionLike } from "@lurem/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { nextInvoiceMilestones } from "../cards/invoice-status.js";
import {
  type StructuralDateSource,
  birthdayJoinSource,
  buildTimelinePage,
  synthesizeStructuralDates,
} from "./aggregate.js";

/** Ymd of a pure-calendar Date (midnight UTC — closingDate/dueDate/etc., same convention as `transactionDay` in aggregate.ts). */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Same shape invoice-events-job.ts maps to before handing transactions to
// packages/core's invoice math — duplicated here (not imported) because
// that mapper isn't exported there; kept intentionally tiny to avoid a
// cross-module dependency for four field reads.
function toTransactionLike(tx: Transaction): TransactionLike {
  return {
    id: tx.id,
    kind: tx.kind,
    amountBRLCents: tx.amountBRLCents,
    transactionDate: tx.transactionDate,
    isScheduled: tx.isScheduled,
    recurringTransactionId: tx.recurringTransactionId ?? undefined,
  };
}

/**
 * One source per (card, milestone) — feeds `synthesizeStructuralDates` so
 * the Timeline shows the next fatura closing/due date ahead of time
 * (BACKLOG: "fechamento/vencimento com antecedência"), reusing
 * invoice-status.ts's `nextInvoiceMilestones` for the date math (no
 * duplicate closing/due logic here) and `sumCardTransactionsForInvoiceMonth`
 * (packages/core) for the projected total — same primitive
 * invoice-events-job.ts uses for the real event's payload once the day
 * arrives.
 */
function cardInvoiceSources(
  card: CreditCardLike,
  institutionName: string,
  allTransactions: Transaction[],
  asOf: Date,
): StructuralDateSource[] {
  const milestones = nextInvoiceMilestones(card, asOf);
  // sumCardTransactionsForInvoiceMonth only filters by period, not by card
  // (invoice-events-job.ts's own callsite pre-filters the same way) — pass
  // only this card's transactions in.
  const cardTransactions = allTransactions
    .filter((tx) => tx.creditCardId === card.id)
    .map(toTransactionLike);
  const closingTotal = sumCardTransactionsForInvoiceMonth(
    card,
    cardTransactions,
    milestones.nextClosingMonth.year,
    milestones.nextClosingMonth.month,
  );
  const dueTotal = sumCardTransactionsForInvoiceMonth(
    card,
    cardTransactions,
    milestones.nextDueMonth.year,
    milestones.nextDueMonth.month,
  );

  return [
    {
      dates: [ymd(milestones.nextClosingDate)],
      event: {
        type: "card.invoice_closing_upcoming",
        payload: {
          institutionName,
          totalCents: closingTotal.valueCents,
          closingDate: ymd(milestones.nextClosingDate),
        },
        aggregateType: "CreditCard",
        aggregateId: card.id,
      },
    },
    {
      dates: [ymd(milestones.nextDueDate)],
      event: {
        type: "card.invoice_due_upcoming",
        payload: {
          institutionName,
          totalCents: dueTotal.valueCents,
          dueDate: ymd(milestones.nextDueDate),
        },
        aggregateType: "CreditCard",
        aggregateId: card.id,
      },
    },
  ];
}

/**
 * Backlog "Recorrência integrada ao dialog": a ocorrência real (Transaction,
 * isScheduled=true) só é materializada pelo cron diário
 * (fulfillment.ts's `fulfillDueRecurrences`) exatamente no dia previsto —
 * antes disso não existe nenhuma linha para aquele mês. Sem isto, uma série
 * recém-criada só apareceria na Timeline no próprio dia do vencimento, nunca
 * "com antecedência" (mesma ideia de `cardInvoiceSources` acima, para a
 * próxima fatura). Gera no máximo UM item — a próxima ocorrência ainda não
 * vencida da série — e nunca duplica uma linha real: se o mês já tem uma
 * Transaction ligada a esta série (cron já rodou, ou o usuário já
 * confirmou/importou manualmente), a série não entra aqui.
 */
function recurringOccurrenceSource(
  series: RecurringTransaction,
  allTransactions: Transaction[],
  asOf: Date,
): StructuralDateSource | null {
  const { year, month, day } = saoPauloYMD(asOf);
  const dueDay = clampDay(year, month, series.dayOfMonth);
  const dueDate = makeDate(year, month, dueDay);
  const today = makeDate(year, month, day);

  if (series.startDate > dueDate) return null;
  if (series.endDate && series.endDate < dueDate) return null;
  // Já venceu (ou vence hoje) — o cron cuida disso, ou já é uma Transaction
  // real; não é mais uma "ocorrência futura" para pré-visualizar.
  if (today >= dueDate) return null;

  const alreadyMaterialized = allTransactions.some(
    (tx) =>
      tx.recurringTransactionId === series.id &&
      tx.transactionDate.getUTCFullYear() === year &&
      tx.transactionDate.getUTCMonth() + 1 === month,
  );
  if (alreadyMaterialized) return null;

  return {
    dates: [ymd(dueDate)],
    event: {
      type: "recurring.occurrence_upcoming",
      payload: {
        recurringTransactionId: series.id,
        description: series.description,
        kind: series.kind,
        amountCents: series.referenceAmountCents,
        isVariableAmount: series.isVariableAmount,
      },
      aggregateType: "RecurringTransaction",
      aggregateId: series.id,
    },
  };
}

/**
 * One source per `GlobalCalendarEntry` — the admin-managed calendar
 * (BACKLOG item A) synthesizes onto every user's timeline, the current
 * year's occurrence of its month/day (bounded the same way
 * `birthdayJoinSource` bounds birthdays to "one occurrence near today", not
 * every year in history — there's no join-date-style lower bound for a
 * global entry, and nothing here is backed by a real DomainEvent, so
 * without a bound this would need to scan every year ever, forever).
 */
const SAO_PAULO_YEAR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
});

function globalCalendarSource(
  entry: {
    id: string;
    title: string;
    month: number;
    day: number;
    displayStyle: string;
  },
  today: Date,
): StructuralDateSource {
  // §0: fuso America/Sao_Paulo para lógica de data — `today` is a real
  // instant (`new Date()`), not a pure calendar date, so its calendar year
  // must be read through that timezone, not UTC (a request near midnight
  // could otherwise resolve to the wrong year in the entry's projected
  // date).
  const year = SAO_PAULO_YEAR.format(today);
  const month = String(entry.month).padStart(2, "0");
  const day = String(entry.day).padStart(2, "0");
  return {
    dates: [`${year}-${month}-${day}`],
    event: {
      type: "calendar.global_entry",
      payload: { title: entry.title, displayStyle: entry.displayStyle },
      aggregateType: "GlobalCalendarEntry",
      aggregateId: entry.id,
    },
  };
}

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

      const [
        transactions,
        events,
        allAccounts,
        allTransactions,
        user,
        activeCards,
        calendarEntries,
        activeRecurringSeries,
      ] = await Promise.all([
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
        // Projeção de fechamento/vencimento futuro (BACKLOG: "com
        // antecedência") só faz sentido para cartões ainda ativos.
        fastify.prisma.creditCard.findMany({
          where: { userId, isActive: true },
        }),
        // Calendário global — administrado, não tem userId (aparece pra todos).
        fastify.prisma.globalCalendarEntry.findMany(),
        // Projeção de próxima ocorrência ainda não vencida (ver
        // recurringOccurrenceSource acima) — só séries ativas importam.
        fastify.prisma.recurringTransaction.findMany({
          where: { userId, isActive: true },
        }),
      ]);

      const institutionById = new Map(
        activeCards.length > 0
          ? (
              await fastify.prisma.institution.findMany({
                where: {
                  id: {
                    in: [...new Set(activeCards.map((c) => c.institutionId))],
                  },
                },
              })
            ).map((i) => [i.id, i.name])
          : [],
      );

      const now = new Date();
      const cardSources = activeCards.flatMap((card) =>
        cardInvoiceSources(
          {
            id: card.id,
            closingDay: card.closingDay,
            dueDay: card.dueDay,
            autoDebitAccountId: card.autoDebitAccountId,
            isActive: card.isActive,
          },
          institutionById.get(card.institutionId) ?? "",
          allTransactions,
          now,
        ),
      );
      const calendarSources = calendarEntries.map((entry) =>
        globalCalendarSource(entry, now),
      );
      const recurringSources = activeRecurringSeries
        .map((series) =>
          recurringOccurrenceSource(series, allTransactions, now),
        )
        .filter((source): source is StructuralDateSource => source !== null);

      // issues.md: aniversário/dia de cadastro devem aparecer mesmo sem
      // transação/evento naquele dia — mas ainda respeitando from/to. Mesmo
      // mecanismo agora alimenta a projeção de fatura e o calendário global
      // (aggregate.ts's `synthesizeStructuralDates`, generalizado).
      const inRange = (date: string) =>
        (!query.from || date >= query.from) && (!query.to || date <= query.to);
      const structural = synthesizeStructuralDates([
        birthdayJoinSource(user),
        ...cardSources,
        ...calendarSources,
        ...recurringSources,
      ]);
      const structuralDates = structural.dates.filter(inRange);
      const structuralItems = structural.items.filter((item) =>
        inRange(item.date),
      );

      const page = buildTimelinePage(transactions, events, {
        cursor: query.cursor,
        limit: query.limit,
        structuralDates,
        structuralItems,
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
