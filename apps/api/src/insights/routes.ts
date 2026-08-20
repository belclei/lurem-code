// apps/api/src/insights/routes.ts
// BACKLOG.md US-3.10 — GET /v1/insights/dashboard?asOf=…: os 3 cards (§6.9),
// cada um Money com breakdown (§3). Cache Redis 60s invalidado por escrita
// (§5.6/§7.8) — ver cache.ts para a estratégia de geração por usuário.
import { saoPauloYMD } from "@lurem/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import {
  insightsGen,
  readDashboardCache,
  writeDashboardCache,
} from "./cache.js";
import { computeDashboard } from "./compute.js";
import { loadInsightsDataset } from "./load.js";
import { computeSpendBreakdown } from "./spend-breakdown.js";

const DashboardQuery = z.object({
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "asOf no formato AAAA-MM-DD.")
    .optional(),
});

/**
 * Converte a data-calendário AAAA-MM-DD num INSTANTE que o core lê como esse
 * dia em America/Sao_Paulo. asOf é sempre um instante para o core (balance faz
 * todayAsDate(asOf) internamente); meio-dia UTC evita o off-by-one que meia-
 * noite UTC causaria em SP (UTC−3). Ver a armadilha documentada em dates.ts.
 */
function asOfInstant(ymd: string): Date {
  const parts = ymd.split("-");
  return new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12),
  );
}

// transactionDate (@db.Date) is always stored as midnight UTC (same
// convention as imports/routes.ts's parseDateOnly) — unlike asOfInstant
// above (deliberately noon, for balance-as-of math), a `from`/`to` range
// bound against that column needs the exact midnight instant, or a `from`
// bound at noon would wrongly exclude a transaction dated at midnight UTC
// on that very day.
function dateOnlyInstant(ymd: string): Date {
  const parts = ymd.split("-");
  return new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
  );
}

export async function registerInsightRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const { prisma, redis } = fastify;

  fastify.get(
    "/v1/insights/dashboard",
    {
      schema: { querystring: DashboardQuery },
      preHandler: requireUser(fastify),
    },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { asOf } = request.query as z.infer<typeof DashboardQuery>;

      // asOf ausente → hoje em SP. Normalizar a chave para a data-calendário
      // (não o instante bruto) mantém o cache estável entre chamadas no dia.
      const { year, month, day } = saoPauloYMD(new Date());
      const ymd =
        asOf ??
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const gen = await insightsGen(redis, userId);
      const cached = await readDashboardCache(redis, userId, gen, ymd);
      if (cached) return JSON.parse(cached);

      const dataset = await loadInsightsDataset(prisma, userId);
      const result = computeDashboard(dataset, asOfInstant(ymd));
      await writeDashboardCache(
        redis,
        userId,
        gen,
        ymd,
        JSON.stringify(result),
      );
      return result;
    },
  );

  const SpendBreakdownQuery = z.object({
    by: z.enum(["category", "tag"]),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "from no formato AAAA-MM-DD.")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "to no formato AAAA-MM-DD.")
      .optional(),
  });

  fastify.get(
    "/v1/insights/spend-breakdown",
    {
      schema: { querystring: SpendBreakdownQuery },
      preHandler: requireUser(fastify),
    },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { by, from, to } = request.query as z.infer<
        typeof SpendBreakdownQuery
      >;

      // Real spend only (§ tags spec §5) — scheduled/not-yet-happened
      // amounts would overstate "how much I spent", same isScheduled
      // exclusion the rest of the app treats as "not real money yet".
      const expenseTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          kind: "expense",
          isScheduled: false,
          ...(from || to
            ? {
                transactionDate: {
                  ...(from ? { gte: dateOnlyInstant(from) } : {}),
                  ...(to ? { lte: dateOnlyInstant(to) } : {}),
                },
              }
            : {}),
        },
      });

      if (by === "category") {
        const categories = await prisma.category.findMany({
          where: { OR: [{ userId: null }, { userId }] },
        });
        return computeSpendBreakdown("category", expenseTransactions, {
          categories,
        });
      }

      const transactionTags = await prisma.transactionTag.findMany({
        where: {
          transactionId: { in: expenseTransactions.map((tx) => tx.id) },
        },
      });
      const tags = await prisma.tag.findMany({ where: { userId } });
      return computeSpendBreakdown("tag", expenseTransactions, {
        transactionTags,
        tags,
      });
    },
  );
}
