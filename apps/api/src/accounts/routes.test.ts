import type { FastifyInstance } from "fastify";
// apps/api/src/accounts/routes.test.ts
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

async function createInstitution() {
  return server.prisma.institution.create({
    data: { name: "Nubank", compeCode: "260-test", logoAsset: "nubank.svg" },
  });
}

describe("POST /v1/accounts", () => {
  it("creates a checking account with reconciledBalanceCents=0 cache and the given overdraft limit", async () => {
    const { accessToken } = await authedUser();
    const institution = await createInstitution();

    const response = await server.inject({
      method: "POST",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "checking",
        institutionId: institution.id,
        openingBalanceCents: 10_000,
        overdraftLimitCents: 5_000,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.type).toBe("checking");
    expect(body.institutionName).toBe("Nubank");
    expect(body.logoUrl).toBe("/nubank.svg");
    expect(body.balanceCents).toBe(10_000);
    expect(body.overdraftLimitCents).toBe(5_000);
    expect(body.isOverLimit).toBe(false);

    const stored = await server.prisma.account.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored.reconciledBalanceCents).toBe(0);

    const event = await server.prisma.domainEvent.findFirstOrThrow({
      where: { aggregateType: "Account", aggregateId: body.id },
    });
    expect(event.type).toBe("account.created");
    expect(event.payload).toMatchObject({
      type: "checking",
      institutionName: "Nubank",
      openingBalanceCents: 10_000,
    });
  });

  it("rejects a cash account with a non-zero overdraft limit", async () => {
    const { accessToken } = await authedUser();

    const response = await server.inject({
      method: "POST",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "cash", overdraftLimitCents: 100 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("validation.failed");
  });

  it("rejects a cash account with an institution", async () => {
    const { accessToken } = await authedUser();
    const institution = await createInstitution();

    const response = await server.inject({
      method: "POST",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "cash", institutionId: institution.id },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("validation.failed");
  });

  it("creates a cash account with institutionName 'Carteira' and no institution join", async () => {
    const { accessToken } = await authedUser();

    const response = await server.inject({
      method: "POST",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "cash", openingBalanceCents: 500 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.institutionId).toBeNull();
    expect(body.institutionName).toBe("Em Espécie");
    expect(body.logoUrl).toBeUndefined();
  });

  it("rejects a non-cash account without an institution", async () => {
    const { accessToken } = await authedUser();
    const response = await server.inject({
      method: "POST",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "checking" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /v1/accounts", () => {
  it("only lists the caller's own accounts (user isolation)", async () => {
    const owner = await authedUser();
    const stranger = await authedUser();
    const institution = await createInstitution();

    await server.prisma.account.create({
      data: {
        userId: owner.userId,
        type: "checking",
        institutionId: institution.id,
      },
    });
    await server.prisma.account.create({
      data: {
        userId: stranger.userId,
        type: "checking",
        institutionId: institution.id,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
  });
});

describe("PATCH/DELETE /v1/accounts/:id", () => {
  it("updates the account's name (owner only)", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Nubank PJ" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Nubank PJ");

    const event = await server.prisma.domainEvent.findFirstOrThrow({
      where: { aggregateType: "Account", aggregateId: account.id },
    });
    expect(event.type).toBe("account.updated");
    expect(event.payload).toMatchObject({
      name: "Nubank PJ",
      changed: ["name"],
    });
  });

  it("does not emit account.updated when the PATCH body has no fields", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const event = await server.prisma.domainEvent.findFirst({
      where: { aggregateType: "Account", aggregateId: account.id },
    });
    expect(event).toBeNull();
  });

  it("404s when editing another user's account", async () => {
    const owner = await authedUser();
    const stranger = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: {
        userId: owner.userId,
        type: "checking",
        institutionId: institution.id,
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { name: "Hijacked" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("hard-deletes an account with no transactions", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stored = await server.prisma.account.findUnique({
      where: { id: account.id },
    });
    expect(stored).toBeNull();
  });

  it("soft-deletes (deactivates) rather than removing the row when the account has transactions", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date(),
        amountCents: 1_000,
        amountBRLCents: 1_000,
      },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stored = await server.prisma.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(stored.isActive).toBe(false);
  });

  it("archives and unarchives via PATCH { archived }", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });

    const archived = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archivedAt).not.toBeNull();

    const stored = await server.prisma.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(stored.archivedAt).not.toBeNull();

    const unarchived = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { archived: false },
    });
    expect(unarchived.statusCode).toBe(200);
    expect(unarchived.json().archivedAt).toBeNull();
  });

  it("exposes hasTransactions on GET", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const account = await server.prisma.account.create({
      data: { userId, type: "checking", institutionId: institution.id },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date(),
        amountCents: 1_000,
        amountBRLCents: 1_000,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/accounts",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].hasTransactions).toBe(true);
  });
});
