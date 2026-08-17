import type { FastifyInstance } from "fastify";
// apps/api/src/portador/routes.test.ts
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";
import { buildServer } from "../server.js";

// POST /v1/connections (used below to set up a connected-user fixture) sends
// a notification email as of sprint 15 — mock Resend so that fixture setup
// doesn't make a real network call against the placeholder API key.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

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

beforeEach(async () => {
  sendMock.mockResolvedValue({ data: { id: "email_test" }, error: null });

  // Enable connections feature flag for testing
  await server.prisma.featureFlag.upsert({
    where: { key: "connections" },
    update: { state: "on" },
    create: {
      key: "connections",
      description: "Test",
      state: "on",
      rolloutPercent: 100,
    },
  });
});

async function authedUser(email?: string) {
  return createAuthedUser(server.prisma, TEST_ENV.JWT_SECRET, { email });
}

async function connectedPair() {
  const a = await authedUser("a@harmon.dev");
  const b = await authedUser("b@harmon.dev");
  const created = await server.inject({
    method: "POST",
    url: "/v1/connections",
    headers: { authorization: `Bearer ${a.accessToken}` },
    payload: { addresseeEmail: "b@harmon.dev" },
  });
  await server.inject({
    method: "POST",
    url: `/v1/connections/${created.json().id}/accept`,
    headers: { authorization: `Bearer ${b.accessToken}` },
  });
  return { a, b };
}

describe("POST /v1/portador/assign", () => {
  it("assigns an owned transaction to a connected user", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    const tx = await server.prisma.transaction.create({
      data: {
        userId: a.userId,
        accountId: account.id,
        kind: "expense",
        description: "Cinema",
        transactionDate: new Date("2026-07-01"),
        amountCents: 4000,
        amountBRLCents: 4000,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/portador/assign",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { transactionId: tx.id, portadorUserId: b.userId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().portadorUserId).toBe(b.userId);
  });

  it("rejects assigning without an accepted connection", async () => {
    const a = await authedUser("a@harmon.dev");
    const b = await authedUser("b@harmon.dev");
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    const tx = await server.prisma.transaction.create({
      data: {
        userId: a.userId,
        accountId: account.id,
        kind: "expense",
        description: "Cinema",
        transactionDate: new Date("2026-07-01"),
        amountCents: 4000,
        amountBRLCents: 4000,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/portador/assign",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { transactionId: tx.id, portadorUserId: b.userId },
    });

    expect(response.statusCode).toBe(409);
  });

  it("rejects assigning a transaction you don't own", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: b.userId, type: "cash" },
    });
    const tx = await server.prisma.transaction.create({
      data: {
        userId: b.userId,
        accountId: account.id,
        kind: "expense",
        description: "Cinema",
        transactionDate: new Date("2026-07-01"),
        amountCents: 4000,
        amountBRLCents: 4000,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/portador/assign",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { transactionId: tx.id, portadorUserId: b.userId },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /v1/portador/pending + accept/reject", () => {
  async function assignedTransaction() {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    const tx = await server.prisma.transaction.create({
      data: {
        userId: a.userId,
        accountId: account.id,
        kind: "expense",
        description: "Cinema",
        transactionDate: new Date("2026-07-01"),
        amountCents: 4000,
        amountBRLCents: 4000,
        portadorUserId: b.userId,
      },
    });
    return { a, b, tx };
  }

  it("lists the assignment as pending for the assignee", async () => {
    const { b, tx } = await assignedTransaction();

    const response = await server.inject({
      method: "GET",
      url: "/v1/portador/pending",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(tx.id);
  });

  it("accept creates a mirrored transaction in the assignee's chosen account", async () => {
    const { b, tx } = await assignedTransaction();
    const bAccount = await server.prisma.account.create({
      data: { userId: b.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/accept`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { accountId: bAccount.id },
    });

    expect(response.statusCode).toBe(201);
    const mirror = await server.prisma.transaction.findUnique({
      where: { id: response.json().id },
    });
    expect(mirror?.userId).toBe(b.userId);
    expect(mirror?.amountCents).toBe(4000);
    expect(mirror?.accountId).toBe(bAccount.id);
  });

  it("rejects accepting the same assignment twice (regression: used to create a second mirror, doubling the assignee's money)", async () => {
    const { b, tx } = await assignedTransaction();
    const bAccount = await server.prisma.account.create({
      data: { userId: b.userId, type: "cash" },
    });

    const first = await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/accept`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { accountId: bAccount.id },
    });
    expect(first.statusCode).toBe(201);

    const second = await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/accept`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { accountId: bAccount.id },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("portador.already_accepted");

    const mirrors = await server.prisma.transaction.findMany({
      where: { portadorMirrorOfTransactionId: tx.id },
    });
    expect(mirrors).toHaveLength(1);
  });

  it("an accepted item drops off the pending list (regression: used to stay forever, no link back to the original)", async () => {
    const { b, tx } = await assignedTransaction();
    const bAccount = await server.prisma.account.create({
      data: { userId: b.userId, type: "cash" },
    });

    await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/accept`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { accountId: bAccount.id },
    });

    const pending = await server.inject({
      method: "GET",
      url: "/v1/portador/pending",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(pending.json()).toHaveLength(0);
  });

  it("someone other than the assignee cannot accept", async () => {
    const { a, tx } = await assignedTransaction();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/accept`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { accountId: account.id },
    });

    expect(response.statusCode).toBe(404);
  });

  it("reject clears portadorUserId and it drops off the pending list", async () => {
    const { b, tx } = await assignedTransaction();

    const reject = await server.inject({
      method: "POST",
      url: `/v1/portador/${tx.id}/reject`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(reject.statusCode).toBe(200);

    const stored = await server.prisma.transaction.findUnique({
      where: { id: tx.id },
    });
    expect(stored?.portadorUserId).toBeNull();

    const pending = await server.inject({
      method: "GET",
      url: "/v1/portador/pending",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(pending.json()).toHaveLength(0);
  });
});

describe("POST /v1/portador/settle", () => {
  it("creates a settlement transaction and clears the outstanding balance — copy is never debt language", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    await server.prisma.transaction.create({
      data: {
        userId: a.userId,
        accountId: account.id,
        kind: "expense",
        description: "Pizza da Maria",
        transactionDate: new Date("2026-07-01"),
        amountCents: 9000,
        amountBRLCents: 9000,
        portadorUserId: b.userId,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/portador/settle",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { counterpartUserId: b.userId, accountId: account.id },
    });

    expect(response.statusCode).toBe(201);
    const settlement = await server.prisma.transaction.findUnique({
      where: { id: response.json().id },
    });
    expect(settlement?.kind).toBe("income");
    expect(settlement?.amountCents).toBe(9000);
    expect(settlement?.description).not.toMatch(/deve/i);
    expect(settlement?.portadorSettled).toBe(true);

    const stillUnsettled = await server.prisma.transaction.count({
      where: {
        userId: a.userId,
        portadorUserId: b.userId,
        portadorSettled: false,
      },
    });
    expect(stillUnsettled).toBe(0);
  });

  it("rejects settling when there's nothing pending", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/portador/settle",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { counterpartUserId: b.userId, accountId: account.id },
    });

    expect(response.statusCode).toBe(400);
  });
});
