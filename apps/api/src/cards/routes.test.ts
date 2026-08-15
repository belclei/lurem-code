import type { FastifyInstance } from "fastify";
// apps/api/src/cards/routes.test.ts
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
    data: { name: "Itaú", compeCode: "341-test", logoAsset: "itau.svg" },
  });
}

describe("GET /v1/cards", () => {
  it("reflects real usedCents/isOverLimit from the card's transactions (Sprint 10 fix — used to always be usedCents=0)", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 10_000,
        closingDay: 10,
        dueDay: 20,
      },
    });
    // Dated "today" (not a fixed past date, unlike the /invoice tests below
    // which pin an explicit `ref=YYYY-MM`) so it always lands inside
    // cardInvoiceStatus's real "currently open" period regardless of when
    // this test runs.
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: card.id,
        kind: "expense",
        description: "Acima do limite",
        transactionDate: new Date(),
        amountCents: 15_000,
        amountBRLCents: 15_000,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/cards",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].usedCents).toBe(15_000);
    expect(body[0].isOverLimit).toBe(true);
  });
});

describe("POST /v1/cards", () => {
  it("accepts closingDay=31 without clamping at creation time", async () => {
    const { accessToken } = await authedUser();
    const institution = await createInstitution();

    const response = await server.inject({
      method: "POST",
      url: "/v1/cards",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 31,
        dueDay: 10,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.closingDay).toBe(31);
    expect(body.institutionName).toBe("Itaú");
    expect(body.logoUrl).toBe("/itau.svg");

    const event = await server.prisma.domainEvent.findFirstOrThrow({
      where: { aggregateType: "CreditCard", aggregateId: body.id },
    });
    expect(event.type).toBe("card.created");
    expect(event.payload).toMatchObject({ institutionName: "Itaú" });
  });

  it("rejects an autoDebitAccountId belonging to another user", async () => {
    const { accessToken } = await authedUser();
    const stranger = await authedUser();
    const institution = await createInstitution();
    const strangerAccount = await server.prisma.account.create({
      data: { userId: stranger.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/cards",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
        autoDebitAccountId: strangerAccount.id,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /v1/cards/:id", () => {
  it("emits card.updated with the changed fields", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Itaú PJ" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Itaú PJ");

    const event = await server.prisma.domainEvent.findFirstOrThrow({
      where: { aggregateType: "CreditCard", aggregateId: card.id },
    });
    expect(event.type).toBe("card.updated");
    expect(event.payload).toMatchObject({
      name: "Itaú PJ",
      changed: ["name"],
    });
  });

  it("updates the card's institution", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const other = await server.prisma.institution.create({
      data: { name: "Nubank", compeCode: "260-test", logoAsset: "nubank.svg" },
    });
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { institutionId: other.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().institutionName).toBe("Nubank");
    const event = await server.prisma.domainEvent.findFirstOrThrow({
      where: { aggregateType: "CreditCard", aggregateId: card.id },
    });
    expect(event.payload).toMatchObject({ changed: ["institutionId"] });
  });

  it("rejects moving to an institution that already has a nameless card, unless this one also gets a name", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const other = await server.prisma.institution.create({
      data: { name: "Nubank", compeCode: "260-test", logoAsset: "nubank.svg" },
    });
    await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: other.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
      },
    });
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
      },
    });

    const blocked = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { institutionId: other.id },
    });
    expect(blocked.statusCode).toBe(400);

    const withName = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { institutionId: other.id, name: "Cartão PJ" },
    });
    expect(withName.statusCode).toBe(200);
  });

  it("does not emit card.updated when the PATCH body has no fields", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 5,
        dueDay: 15,
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const event = await server.prisma.domainEvent.findFirst({
      where: { aggregateType: "CreditCard", aggregateId: card.id },
    });
    expect(event).toBeNull();
  });
});

describe("GET /v1/cards/:id/invoice", () => {
  it("returns Money with a breakdown, never just a bare total", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    // Transação dentro do período (closingDate(M-1), closingDate(M)] para M=2026-03:
    // fechamento em 10/03 — 05/03 cai dentro do período.
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: card.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date("2026-03-05"),
        amountCents: 8_000,
        amountBRLCents: 8_000,
      },
    });
    // Fora do período (depois do fechamento seguinte) — não deve entrar.
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: card.id,
        kind: "expense",
        description: "Fora do período",
        transactionDate: new Date("2026-04-15"),
        amountCents: 500,
        amountBRLCents: 500,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/cards/${card.id}/invoice?ref=2026-03`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valueCents).toBe(8_000);
    expect(body.breakdown).toHaveLength(1);
    expect(body.breakdown[0].sourceRef.type).toBe("Transaction");
  });

  it("404s for another user's card", async () => {
    const owner = await authedUser();
    const stranger = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId: owner.userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/cards/${card.id}/invoice?ref=2026-03`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects a malformed ref", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/cards/${card.id}/invoice?ref=not-a-date`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("DELETE /v1/cards/:id", () => {
  it("hard-deletes a card with no transactions", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stored = await server.prisma.creditCard.findUnique({
      where: { id: card.id },
    });
    expect(stored).toBeNull();
  });

  it("soft-deletes (deactivates) rather than removing the row when the card has transactions", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: card.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date(),
        amountCents: 1_000,
        amountBRLCents: 1_000,
      },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stored = await server.prisma.creditCard.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(stored.isActive).toBe(false);
  });

  it("archives and unarchives via PATCH { archived }", async () => {
    const { accessToken, userId } = await authedUser();
    const institution = await createInstitution();
    const card = await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    const archived = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archivedAt).not.toBeNull();

    const unarchived = await server.inject({
      method: "PATCH",
      url: `/v1/cards/${card.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { archived: false },
    });
    expect(unarchived.statusCode).toBe(200);
    expect(unarchived.json().archivedAt).toBeNull();
  });
});
