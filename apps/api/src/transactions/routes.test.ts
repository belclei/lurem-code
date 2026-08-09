import type { FastifyInstance } from "fastify";
// apps/api/src/transactions/routes.test.ts
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

async function authedUser() {
  return createAuthedUser(server.prisma, TEST_ENV.JWT_SECRET);
}

async function institution() {
  return server.prisma.institution.create({
    data: {
      name: "Nubank",
      compeCode: `260-${Math.random().toString(36).slice(2, 7)}`,
      logoAsset: "nubank.svg",
    },
  });
}

async function account(
  userId: string,
  over: Partial<{
    type: "checking" | "cash";
    openingBalanceCents: number;
    overdraftLimitCents: number;
  }> = {},
) {
  const type = over.type ?? "checking";
  const inst = type === "cash" ? null : await institution();
  return server.prisma.account.create({
    data: {
      userId,
      type,
      institutionId: inst?.id ?? null,
      currency: "BRL",
      openingBalanceCents: over.openingBalanceCents ?? 0,
      overdraftLimitCents: over.overdraftLimitCents ?? 0,
    },
  });
}

async function card(userId: string) {
  const inst = await institution();
  return server.prisma.creditCard.create({
    data: {
      userId,
      institutionId: inst.id,
      limitCents: 500_000,
      closingDay: 20,
      dueDay: 28,
    },
  });
}

function post(token: string, payload: unknown) {
  return server.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { authorization: `Bearer ${token}` },
    payload: payload as object,
  });
}

const TODAY = "2026-07-25";

describe("POST /v1/transactions — manual (US-3.5)", () => {
  it("creates a manual expense on an account", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 100_000 });
    const res = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "Mercado",
      transactionDate: TODAY,
      amountCents: 5_000,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.kind).toBe("expense");
    expect(body.amountCents).toBe(5_000);
    expect(body.amountBRLCents).toBe(5_000);
  });

  it("rejects a transaction that is neither account nor card (422 xor)", async () => {
    const { accessToken } = await authedUser();
    const res = await post(accessToken, {
      kind: "expense",
      description: "sem destino",
      transactionDate: TODAY,
      amountCents: 100,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("transaction.account_xor_card");
  });

  it("returns 409 overdraft_confirmation_required with projected balance data, and does not write", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, {
      openingBalanceCents: 10_000,
      overdraftLimitCents: 5_000,
    });
    const res = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "compra grande",
      transactionDate: TODAY,
      amountCents: 20_000,
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe("account.overdraft_confirmation_required");
    expect(body.data.projectedBalanceCents).toBe(-10_000);
    expect(body.data.overdraftLimitCents).toBe(5_000);
    const count = await server.prisma.transaction.count({
      where: { accountId: acc.id },
    });
    expect(count).toBe(0);
  });

  it("writes when confirmOverLimit=true", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, {
      openingBalanceCents: 10_000,
      overdraftLimitCents: 5_000,
    });
    const res = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "compra grande",
      transactionDate: TODAY,
      amountCents: 20_000,
      confirmOverLimit: true,
    });
    expect(res.statusCode).toBe(201);
  });

  it("rejects cash going negative (422) with no confirm option", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, {
      type: "cash",
      openingBalanceCents: 1_000,
    });
    const res = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "gasto",
      transactionDate: TODAY,
      amountCents: 2_000,
      confirmOverLimit: true,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("account.cash_cannot_be_negative");
  });
});

describe("POST /v1/transactions — transfer & installment (US-3.6)", () => {
  it("creates a transfer pair sharing transferPairId with out/in directions", async () => {
    const { userId, accessToken } = await authedUser();
    const from = await account(userId, { openingBalanceCents: 100_000 });
    const to = await account(userId, { openingBalanceCents: 0 });
    const res = await post(accessToken, {
      kind: "transfer",
      accountId: from.id,
      toAccountId: to.id,
      description: "Poupança",
      transactionDate: TODAY,
      amountCents: 30_000,
    });
    expect(res.statusCode).toBe(201);
    const [out, inLeg] = res.json();
    expect(out.transferPairId).toBe(inLeg.transferPairId);
    expect(out.transferDirection).toBe("out");
    expect(inLeg.transferDirection).toBe("in");
    expect(out.accountId).toBe(from.id);
    expect(inLeg.accountId).toBe(to.id);
  });

  it("splits an installment purchase into N card rows, one per future month", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const res = await post(accessToken, {
      kind: "expense",
      creditCardId: c.id,
      description: "Notebook 3x",
      transactionDate: "2026-07-15",
      amountCents: 10_000,
      installmentTotal: 3,
    });
    expect(res.statusCode).toBe(201);
    const rows = res.json();
    expect(rows).toHaveLength(3);
    expect(rows.map((r: { amountCents: number }) => r.amountCents)).toEqual([
      3_334, 3_333, 3_333,
    ]);
    expect(
      rows.every((r: { installmentTotal: number }) => r.installmentTotal === 3),
    ).toBe(true);
    expect(
      rows.every(
        (r: { installmentPurchaseAmountCents: number }) =>
          r.installmentPurchaseAmountCents === 10_000,
      ),
    ).toBe(true);
    expect(
      rows.map((r: { transactionDate: string }) => r.transactionDate),
    ).toEqual(["2026-07-15", "2026-08-15", "2026-09-15"]);
  });
});

describe("scheduled actions & list (US-3.7)", () => {
  it("confirms a scheduled transaction into a real one", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 0 });
    const created = await post(accessToken, {
      kind: "income",
      accountId: acc.id,
      description: "Salário (previsto)",
      transactionDate: "2026-08-05",
      amountCents: 500_000,
      isScheduled: true,
    });
    const id = created.json().id;
    const res = await server.inject({
      method: "POST",
      url: `/v1/transactions/${id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isScheduled).toBe(false);
  });

  it("skips a scheduled transaction (deletes just that occurrence)", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 0 });
    const created = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "Aluguel (previsto)",
      transactionDate: "2026-08-05",
      amountCents: 100_000,
      isScheduled: true,
    });
    const id = created.json().id;
    const res = await server.inject({
      method: "POST",
      url: `/v1/transactions/${id}/skip`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await server.prisma.transaction.count({ where: { id } })).toBe(0);
  });

  it("lists transactions filtered by scheduled flag", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 1_000_000 });
    await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "real",
      transactionDate: TODAY,
      amountCents: 1_000,
    });
    await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "prevista",
      transactionDate: "2026-08-01",
      amountCents: 1_000,
      isScheduled: true,
    });
    const res = await server.inject({
      method: "GET",
      url: "/v1/transactions?scheduled=true",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0].description).toBe("prevista");
  });

  it("deleting one transfer leg removes the whole pair", async () => {
    const { userId, accessToken } = await authedUser();
    const from = await account(userId, { openingBalanceCents: 100_000 });
    const to = await account(userId, { openingBalanceCents: 0 });
    const created = await post(accessToken, {
      kind: "transfer",
      accountId: from.id,
      toAccountId: to.id,
      description: "t",
      transactionDate: TODAY,
      amountCents: 1_000,
    });
    const [out] = created.json();
    const res = await server.inject({
      method: "DELETE",
      url: `/v1/transactions/${out.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await server.prisma.transaction.count({ where: { userId } })).toBe(
      0,
    );
  });
});

describe("balance reflects transactions (US-3.12 exit)", () => {
  it("GET /v1/accounts shows a balance that includes confirmed transactions", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 100_000 });
    await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "Mercado",
      transactionDate: TODAY,
      amountCents: 30_000,
    });
    await post(accessToken, {
      kind: "income",
      accountId: acc.id,
      description: "Reembolso",
      transactionDate: TODAY,
      amountCents: 10_000,
    });
    const res = await server.inject({
      method: "GET",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const acctBody = res.json().find((a: { id: string }) => a.id === acc.id);
    // 100_000 − 30_000 + 10_000 = 80_000
    expect(acctBody.balanceCents).toBe(80_000);
  });
});

describe("recurrence on creation (US-3.8)", () => {
  it("creates a recurring series with the transaction as first occurrence", async () => {
    const { userId, accessToken } = await authedUser();
    const acc = await account(userId, { openingBalanceCents: 1_000_000 });
    const res = await post(accessToken, {
      kind: "expense",
      accountId: acc.id,
      description: "Aluguel",
      transactionDate: "2026-07-05",
      amountCents: 150_000,
      recurring: true,
    });
    expect(res.statusCode).toBe(201);
    const tx = res.json();
    expect(tx.recurringTransactionId).not.toBeNull();
    const series = await server.prisma.recurringTransaction.findUnique({
      where: { id: tx.recurringTransactionId },
    });
    expect(series?.dayOfMonth).toBe(5);
    expect(series?.referenceAmountCents).toBe(150_000);
  });
});
