import type { PrismaClient } from "@lurem/db";
// apps/api/src/transactions/transfer-pair.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";
import { buildServer } from "../server.js";
import { createTransferPair } from "./transfer-pair.js";

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

let prisma: PrismaClient;
let server: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  server = await buildServer(TEST_ENV);
  prisma = server.prisma;
});
afterEach(async () => {
  await resetTestDb(prisma);
});
afterAll(async () => {
  await server.close();
});

async function institution() {
  return prisma.institution.create({
    data: {
      name: "Nubank",
      compeCode: `260-${Math.random().toString(36).slice(2, 7)}`,
      logoAsset: "nubank.svg",
    },
  });
}

async function account(
  userId: string,
  over: Partial<{ openingBalanceCents: number }> = {},
) {
  const inst = await institution();
  return prisma.account.create({
    data: {
      userId,
      type: "checking",
      institutionId: inst.id,
      currency: "BRL",
      openingBalanceCents: over.openingBalanceCents ?? 0,
      overdraftLimitCents: 0,
    },
  });
}

async function card(userId: string) {
  const inst = await institution();
  return prisma.creditCard.create({
    data: {
      userId,
      institutionId: inst.id,
      limitCents: 500_000,
      closingDay: 20,
      dueDay: 28,
    },
  });
}

describe("createTransferPair", () => {
  it("creates two legs sharing a transferPairId, out from source, in to dest account", async () => {
    const { userId } = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET);
    const from = await account(userId);
    const to = await account(userId);

    const { out, inLeg } = await createTransferPair(prisma, {
      userId,
      sourceAccountId: from.id,
      destAccountId: to.id,
      destCreditCardId: null,
      description: "Poupança",
      transactionDate: new Date("2026-07-25"),
      currency: "BRL",
      amountCents: 30_000,
      amountBRLCents: 30_000,
      isScheduled: false,
      source: "manual",
    });

    expect(out.transferPairId).not.toBeNull();
    expect(out.transferPairId).toBe(inLeg.transferPairId);
    expect(out.transferDirection).toBe("out");
    expect(inLeg.transferDirection).toBe("in");
    expect(out.accountId).toBe(from.id);
    expect(inLeg.accountId).toBe(to.id);
    expect(inLeg.creditCardId).toBeNull();
    expect(out.id).not.toBe(inLeg.id);
  });

  it("routes the in-leg to a credit card when destCreditCardId is given instead of destAccountId", async () => {
    const { userId } = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET);
    const from = await account(userId);
    const toCard = await card(userId);

    const { out, inLeg } = await createTransferPair(prisma, {
      userId,
      sourceAccountId: from.id,
      destAccountId: null,
      destCreditCardId: toCard.id,
      description: "Pagamento de fatura",
      transactionDate: new Date("2026-07-25"),
      currency: "BRL",
      amountCents: 12_000,
      amountBRLCents: 12_000,
      isScheduled: false,
      source: "manual",
    });

    expect(inLeg.creditCardId).toBe(toCard.id);
    expect(inLeg.accountId).toBeNull();
    expect(out.accountId).toBe(from.id);
    expect(out.creditCardId).toBeNull();
    expect(out.transferPairId).toBe(inLeg.transferPairId);
  });

  it("stamps both legs kind=transfer and the given source (manual|import)", async () => {
    const { userId } = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET);
    const from = await account(userId);
    const to = await account(userId);

    const { out, inLeg } = await createTransferPair(prisma, {
      userId,
      sourceAccountId: from.id,
      destAccountId: to.id,
      destCreditCardId: null,
      description: "",
      transactionDate: new Date("2026-07-25"),
      currency: "BRL",
      amountCents: 1_000,
      amountBRLCents: 1_000,
      isScheduled: false,
      source: "import",
    });

    expect(out.kind).toBe("transfer");
    expect(inLeg.kind).toBe("transfer");
    expect(out.source).toBe("import");
    expect(inLeg.source).toBe("import");
  });

  it("copies description/date/amount/currency/isScheduled identically onto both legs", async () => {
    const { userId } = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET);
    const from = await account(userId);
    const to = await account(userId);
    const date = new Date("2026-03-15");

    const { out, inLeg } = await createTransferPair(prisma, {
      userId,
      sourceAccountId: from.id,
      destAccountId: to.id,
      destCreditCardId: null,
      description: "Reserva de emergência",
      transactionDate: date,
      currency: "BRL",
      amountCents: 77_777,
      amountBRLCents: 77_777,
      isScheduled: true,
      source: "manual",
    });

    for (const leg of [out, inLeg]) {
      expect(leg.description).toBe("Reserva de emergência");
      expect(leg.transactionDate.toISOString().slice(0, 10)).toBe("2026-03-15");
      expect(leg.amountCents).toBe(77_777);
      expect(leg.amountBRLCents).toBe(77_777);
      expect(leg.currency).toBe("BRL");
      expect(leg.isScheduled).toBe(true);
      expect(leg.userId).toBe(userId);
    }
  });

  it("does not validate ownership — persists whatever ids are given, trusting the caller", async () => {
    // transfer-pair.ts's module comment: "A validação de posse
    // (findOwnedAccount/findOwnedCard) fica com quem chama" — the two call
    // sites (manual POST /v1/transactions, import confirmLine) have
    // different error-shape needs, so ownership is validated by them BEFORE
    // calling createTransferPair, not inside it. This test pins that
    // contract down: an account id from a different user, and a
    // destAccountId that doesn't exist at all, both persist without
    // throwing (the schema also has no DB-level FK for accountId — see
    // test/db.ts).
    const { userId } = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET);
    const other = await createAuthedUser(prisma, TEST_ENV.JWT_SECRET, {
      email: `other-${Math.random().toString(36).slice(2)}@lurem.dev`,
    });
    const foreignAccount = await account(other.userId);

    const { out, inLeg } = await createTransferPair(prisma, {
      userId,
      sourceAccountId: foreignAccount.id, // not owned by userId
      destAccountId: "does-not-exist", // not a real row at all
      destCreditCardId: null,
      description: "sem validação de posse",
      transactionDate: new Date("2026-07-25"),
      currency: "BRL",
      amountCents: 500,
      amountBRLCents: 500,
      isScheduled: false,
      source: "manual",
    });

    expect(out.accountId).toBe(foreignAccount.id);
    expect(inLeg.accountId).toBe("does-not-exist");
    expect(out.userId).toBe(userId);
    expect(inLeg.userId).toBe(userId);
  });
});
