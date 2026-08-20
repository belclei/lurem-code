import type { FastifyInstance } from "fastify";
// apps/api/src/insights/routes.test.ts
// BACKLOG.md US-3.10 — GET /v1/insights/dashboard: os 3 cards (cada um Money
// com breakdown, §3), cache Redis 60s invalidado por escrita (§5.6/§7.8).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";
import { buildServer } from "../server.js";

const TEST_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://lurem_test:lurem_test@localhost:5433/lurem_test",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "x".repeat(32),
  GOOGLE_CLIENT_ID: "placeholder",
  RESEND_API_KEY: "placeholder",
  RESEND_WEBHOOK_SECRET: "placeholder",
  WEB_APP_URL: "http://localhost:5173",
  PORT: 3001,
};

// asOf fixo: torna a chave de cache estável entre chamadas e o cálculo
// determinístico (independente de "hoje"). Deve ser ≥ transactionDate das
// transações semeadas para que entrem no balance.
const AS_OF = "2026-07-25";

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildServer(TEST_ENV);
});
afterEach(async () => {
  await resetTestDb(server.prisma);
  await server.redis.flushall();
});
afterAll(async () => {
  await server.close();
});

async function authedUser() {
  return createAuthedUser(server.prisma, TEST_ENV.JWT_SECRET);
}

async function checkingAccount(userId: string, openingBalanceCents: number) {
  return server.prisma.account.create({
    data: {
      userId,
      type: "checking",
      institutionId: null,
      currency: "BRL",
      openingBalanceCents,
      overdraftLimitCents: 0,
    },
  });
}

function getDashboard(token: string, asOf = AS_OF) {
  return server.inject({
    method: "GET",
    url: `/v1/insights/dashboard?asOf=${asOf}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function isBreakdownSumEqualToTotal(money: {
  valueCents: number;
  breakdown: Array<{ valueCents: number }>;
}): boolean {
  const sum = money.breakdown.reduce((acc, line) => acc + line.valueCents, 0);
  return sum === money.valueCents;
}

describe("GET /v1/insights/dashboard (US-3.10)", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/v1/insights/dashboard?asOf=${AS_OF}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("auth.token_invalid");
  });

  it("returns the 3 cards, each a Money whose total equals the sum of its breakdown", async () => {
    const { userId, accessToken } = await authedUser();
    await checkingAccount(userId, 100_000);

    const res = await getDashboard(accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    for (const key of [
      "disponivelHoje",
      "previsaoFimDoMes",
      "patrimonioTotal",
    ]) {
      expect(body[key]).toBeDefined();
      expect(Array.isArray(body[key].breakdown)).toBe(true);
      expect(body[key].breakdown.length).toBeGreaterThan(0);
      expect(isBreakdownSumEqualToTotal(body[key])).toBe(true);
    }

    // Sem despesas/agendadas/recorrências, os três refletem o saldo líquido.
    expect(body.disponivelHoje.valueCents).toBe(100_000);
    expect(body.previsaoFimDoMes.valueCents).toBe(100_000);
    expect(body.patrimonioTotal.valueCents).toBe(100_000);
  });

  it("serves the second call within the TTL from cache (a write that bypasses the API is NOT reflected)", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await checkingAccount(userId, 100_000);

    const first = await getDashboard(accessToken);
    expect(first.json().disponivelHoje.valueCents).toBe(100_000);

    // Escrita direta no banco (NÃO passa pela API → não incrementa a geração).
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        source: "manual",
        description: "fora da API",
        transactionDate: new Date("2026-07-20"),
        currency: "BRL",
        amountCents: 25_000,
        amountBRLCents: 25_000,
        isScheduled: false,
      },
    });

    const second = await getDashboard(accessToken);
    // Ainda o valor antigo: veio do cache, não recomputou.
    expect(second.json().disponivelHoje.valueCents).toBe(100_000);
  });

  it("invalidates the cache after a write made through the API", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await checkingAccount(userId, 100_000);

    // Preenche o cache.
    await getDashboard(accessToken);

    // Escrita direta (não invalida) só para provar que ela passa a contar
    // depois que a geração é incrementada pela escrita via API.
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        source: "manual",
        description: "direta",
        transactionDate: new Date("2026-07-20"),
        currency: "BRL",
        amountCents: 25_000,
        amountBRLCents: 25_000,
        isScheduled: false,
      },
    });

    // Escrita via API: deve incrementar a geração e invalidar o cache.
    const write = await server.inject({
      method: "POST",
      url: "/v1/transactions",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        kind: "expense",
        accountId: account.id,
        description: "via API",
        transactionDate: "2026-07-21",
        amountCents: 5_000,
      },
    });
    expect(write.statusCode).toBe(201);

    const after = await getDashboard(accessToken);
    // Recomputado: 100_000 − 25_000 (direta) − 5_000 (via API) = 70_000.
    expect(after.json().disponivelHoje.valueCents).toBe(70_000);
  });
});

describe("GET /v1/insights/spend-breakdown (Part 3 spec)", () => {
  it("breaks down expenses by category, percentages summing to 100", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await checkingAccount(userId, 1_000_000);
    const food = await server.prisma.category.create({
      data: {
        userId,
        name: "Alimentação",
        kind: "expense",
        icon: "food",
        colorToken: "--lr-gold-300",
      },
    });
    const transport = await server.prisma.category.create({
      data: {
        userId,
        name: "Transporte",
        kind: "expense",
        icon: "car",
        colorToken: "--lr-petrol-300",
      },
    });
    await server.prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId: account.id,
          kind: "expense",
          source: "manual",
          description: "Mercado",
          categoryId: food.id,
          transactionDate: new Date("2026-07-05"),
          currency: "BRL",
          amountCents: 30_000,
          amountBRLCents: 30_000,
          isScheduled: false,
        },
        {
          userId,
          accountId: account.id,
          kind: "expense",
          source: "manual",
          description: "Uber",
          categoryId: transport.id,
          transactionDate: new Date("2026-07-06"),
          currency: "BRL",
          amountCents: 10_000,
          amountBRLCents: 10_000,
          isScheduled: false,
        },
        // Scheduled — must be excluded (not real spend yet).
        {
          userId,
          accountId: account.id,
          kind: "expense",
          source: "manual",
          description: "Futura",
          categoryId: food.id,
          transactionDate: new Date("2026-08-01"),
          currency: "BRL",
          amountCents: 99_999,
          amountBRLCents: 99_999,
          isScheduled: true,
        },
      ],
    });

    const res = await server.inject({
      method: "GET",
      url: "/v1/insights/spend-breakdown?by=category&from=2026-07-01&to=2026-07-31",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      label: string;
      amountCents: number;
      percentage: number;
    }[];
    expect(body).toHaveLength(2);
    const [first, second] = body;
    if (!first || !second) throw new Error("linhas de breakdown ausentes");
    expect(first.label).toBe("Alimentação");
    expect(first.amountCents).toBe(30_000);
    expect(first.percentage).toBeCloseTo(75, 5);
    expect(second.label).toBe("Transporte");
    expect(second.percentage).toBeCloseTo(25, 5);
  });

  it("breaks down expenses by tag, letting a multi-tagged transaction count toward each tag", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await checkingAccount(userId, 1_000_000);

    const ride = await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        source: "manual",
        description: "Corrida a trabalho",
        transactionDate: new Date("2026-07-05"),
        currency: "BRL",
        amountCents: 4_000,
        amountBRLCents: 4_000,
        isScheduled: false,
      },
    });
    await server.inject({
      method: "PATCH",
      url: `/v1/transactions/${ride.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tagNames: ["uber", "trabalho"] },
    });

    const res = await server.inject({
      method: "GET",
      url: "/v1/insights/spend-breakdown?by=tag",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { label: string; amountCents: number }[];
    const labels = body.map((b) => b.label).sort();
    expect(labels).toEqual(["trabalho", "uber"]);
    for (const row of body) expect(row.amountCents).toBe(4_000);
  });
});
