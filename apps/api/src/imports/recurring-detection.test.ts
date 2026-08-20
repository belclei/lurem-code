import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";
import {
  findRecurringPatternMatches,
  findRecurringSeriesMatches,
} from "./recurring-detection.js";

const { buildServer } = await import("../server.js");

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

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildServer(TEST_ENV);
});
afterEach(async () => {
  await resetTestDb(server.prisma);
});
afterAll(async () => {
  await server.close();
});

async function makeTx(
  userId: string,
  overrides: Partial<{
    description: string;
    amountCents: number;
    kind: "income" | "expense";
    currency: string;
    date: Date;
  }> = {},
) {
  return server.prisma.transaction.create({
    data: {
      userId,
      accountId: null,
      creditCardId: (
        await server.prisma.creditCard.create({
          data: {
            userId,
            institutionId: (
              await server.prisma.institution.create({
                data: {
                  name: "Nubank",
                  compeCode: `260-${Math.random().toString(36).slice(2, 7)}`,
                  logoAsset: "nubank.svg",
                },
              })
            ).id,
            limitCents: 500_000,
            closingDay: 20,
            dueDay: 28,
          },
        })
      ).id,
      kind: overrides.kind ?? "expense",
      source: "manual",
      description: overrides.description ?? "Netflix",
      transactionDate: overrides.date ?? new Date(Date.UTC(2026, 5, 10)),
      currency: overrides.currency ?? "BRL",
      amountCents: overrides.amountCents ?? 3990,
      amountBRLCents: overrides.amountCents ?? 3990,
    },
  });
}

describe("findRecurringSeriesMatches", () => {
  it("matches an active series with the exact same description", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: (
          await server.prisma.institution.create({
            data: {
              name: "Nubank",
              compeCode: "260-x1",
              logoAsset: "nubank.svg",
            },
          })
        ).id,
        limitCents: 500_000,
        closingDay: 20,
        dueDay: 28,
      },
    });
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Netflix",
        kind: "expense",
        creditCardId: card.id,
        referenceAmountCents: 3990,
        referenceAmountBRLCents: 3990,
        dayOfMonth: 10,
        startDate: new Date(Date.UTC(2026, 4, 10)),
      },
    });

    const result = await findRecurringSeriesMatches(server.prisma, userId, [
      "Netflix",
      "Outra coisa",
    ]);

    expect(result.get("Netflix")).toBe(series.id);
    expect(result.has("Outra coisa")).toBe(false);
  });

  it("ignores an inactive series", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: (
          await server.prisma.institution.create({
            data: {
              name: "Nubank",
              compeCode: "260-x2",
              logoAsset: "nubank.svg",
            },
          })
        ).id,
        limitCents: 500_000,
        closingDay: 20,
        dueDay: 28,
      },
    });
    await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Netflix",
        kind: "expense",
        creditCardId: card.id,
        referenceAmountCents: 3990,
        referenceAmountBRLCents: 3990,
        dayOfMonth: 10,
        isActive: false,
        startDate: new Date(Date.UTC(2026, 4, 10)),
      },
    });

    const result = await findRecurringSeriesMatches(server.prisma, userId, [
      "Netflix",
    ]);
    expect(result.has("Netflix")).toBe(false);
  });
});

describe("findRecurringPatternMatches", () => {
  it("matches a candidate with 2 prior transactions ~monthly apart within amount tolerance", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    const older = await makeTx(userId, {
      date: new Date(Date.UTC(2026, 4, 10)),
    });
    const newer = await makeTx(userId, {
      date: new Date(Date.UTC(2026, 5, 10)),
    });

    const result = await findRecurringPatternMatches(server.prisma, userId, [
      {
        description: "Netflix",
        currency: "BRL",
        kind: "expense",
        amountCents: 3990,
        date: new Date(Date.UTC(2026, 6, 10)),
      },
    ]);

    expect(result.get("Netflix")).toEqual([older.id, newer.id]);
  });

  it("does not match with only 1 prior occurrence", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    await makeTx(userId, { date: new Date(Date.UTC(2026, 5, 10)) });

    const result = await findRecurringPatternMatches(server.prisma, userId, [
      {
        description: "Netflix",
        currency: "BRL",
        kind: "expense",
        amountCents: 3990,
        date: new Date(Date.UTC(2026, 6, 10)),
      },
    ]);

    expect(result.has("Netflix")).toBe(false);
  });

  it("does not match when the gap is not ~monthly (40 days)", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    await makeTx(userId, { date: new Date(Date.UTC(2026, 4, 1)) });
    await makeTx(userId, { date: new Date(Date.UTC(2026, 5, 10)) }); // 40 dias depois

    const result = await findRecurringPatternMatches(server.prisma, userId, [
      {
        description: "Netflix",
        currency: "BRL",
        kind: "expense",
        amountCents: 3990,
        date: new Date(Date.UTC(2026, 6, 20)),
      },
    ]);

    expect(result.has("Netflix")).toBe(false);
  });

  it("matches within +5% amount tolerance but not beyond it", async () => {
    const { userId } = await createAuthedUser(
      server.prisma,
      TEST_ENV.JWT_SECRET,
    );
    await makeTx(userId, {
      date: new Date(Date.UTC(2026, 4, 10)),
      amountCents: 3990,
    });
    await makeTx(userId, {
      date: new Date(Date.UTC(2026, 5, 10)),
      amountCents: 3990,
    });

    const withinTolerance = await findRecurringPatternMatches(
      server.prisma,
      userId,
      [
        {
          description: "Netflix",
          currency: "BRL",
          kind: "expense",
          amountCents: 4180, // ~4.8% acima de 3990
          date: new Date(Date.UTC(2026, 6, 10)),
        },
      ],
    );
    expect(withinTolerance.has("Netflix")).toBe(true);

    const beyondTolerance = await findRecurringPatternMatches(
      server.prisma,
      userId,
      [
        {
          description: "Netflix",
          currency: "BRL",
          kind: "expense",
          amountCents: 4400, // ~10.3% acima de 3990
          date: new Date(Date.UTC(2026, 6, 10)),
        },
      ],
    );
    expect(beyondTolerance.has("Netflix")).toBe(false);
  });
});
