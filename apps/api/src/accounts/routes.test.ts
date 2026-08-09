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
    expect(body.institutionName).toBe("Carteira");
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

  it("soft-deletes (deactivates) rather than removing the row", async () => {
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
    const stored = await server.prisma.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(stored.isActive).toBe(false);
  });
});
