import type { FastifyInstance } from "fastify";
// apps/api/src/connections/routes.test.ts
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
  // mockClear (not just mockResolvedValue) because this file's earlier
  // describe blocks also call POST /v1/connections, which now sends an
  // email as a side effect — without clearing, the "sends a notification
  // email" assertions below would see stale call counts from those tests.
  sendMock.mockClear();
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

async function authedAdmin() {
  return createAuthedUser(server.prisma, TEST_ENV.JWT_SECRET, {
    role: "admin",
  });
}

describe("POST /v1/connections", () => {
  it("creates a pending connection to a known user by email", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("pending");
  });

  it("rejects an email that isn't a registered user", async () => {
    const a = await authedUser("a@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "ninguem@harmon.dev" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects connecting to yourself", async () => {
    const a = await authedUser("a@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "a@harmon.dev" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a duplicate connection between the same pair", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");

    await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });
    const second = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    expect(second.statusCode).toBe(400);
  });
});

describe("POST /v1/connections/:id/accept", () => {
  it("only the addressee can accept, and both then see it as accepted", async () => {
    const a = await authedUser("a@harmon.dev");
    const b = await authedUser("b@harmon.dev");

    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });
    const id = created.json().id;

    const wrongAccept = await server.inject({
      method: "POST",
      url: `/v1/connections/${id}/accept`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(wrongAccept.statusCode).toBe(404);

    const accept = await server.inject({
      method: "POST",
      url: `/v1/connections/${id}/accept`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().status).toBe("accepted");

    const listA = await server.inject({
      method: "GET",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const listB = await server.inject({
      method: "GET",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(listA.json()[0].status).toBe("accepted");
    expect(listB.json()[0].status).toBe("accepted");
  });
});

describe("GET /v1/connections settlement balance", () => {
  it("sums unsettled portador transactions signed by kind", async () => {
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
        amountCents: 5000,
        amountBRLCents: 5000,
        portadorUserId: b.userId,
      },
    });

    const list = await server.inject({
      method: "GET",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    expect(list.json()[0].settlementBalanceCents).toBe(5000);
  });
});

describe("POST /v1/connections sends a notification email", () => {
  it("emails the addressee when a connection request is created", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");

    await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    // biome-ignore lint/style/noNonNullAssertion: toHaveBeenCalledTimes(1) above guarantees this call exists
    const call = sendMock.mock.calls[0]![0] as { to: string; html: string };
    expect(call.to).toBe("b@harmon.dev");
    expect(call.html).toContain("/connections");
  });
});

describe("DELETE /v1/connections/:id", () => {
  it("lets the requester delete their own pending connection", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");
    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/connections/${created.json().id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stored = await server.prisma.userConnection.findUnique({
      where: { id: created.json().id },
    });
    expect(stored).toBeNull();
  });

  it("blocks the addressee from deleting it (they have accept/reject instead)", async () => {
    const a = await authedUser("a@harmon.dev");
    const b = await authedUser("b@harmon.dev");
    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/connections/${created.json().id}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("lets an admin delete someone else's pending connection", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");
    const admin = await authedAdmin();
    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/connections/${created.json().id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    // The DomainEvent must be attributed to the requester (a real party to
    // the connection), not the admin who happened to trigger the delete —
    // otherwise the requester never learns their pending connection was
    // removed on their behalf.
    const events = await server.prisma.domainEvent.findMany({
      where: { aggregateId: created.json().id, type: "connection.deleted" },
    });
    expect(events.some((e) => e.userId === a.userId)).toBe(true);
    expect(events.some((e) => e.userId === admin.userId)).toBe(false);
  });

  it("blocks deleting a connection that was already accepted", async () => {
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

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/connections/${created.json().id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /v1/connections/:id/resend", () => {
  it("re-sends the notification email without changing status", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");
    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });
    sendMock.mockClear();

    const response = await server.inject({
      method: "POST",
      url: `/v1/connections/${created.json().id}/resend`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("pending");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("blocks resending a connection that was already accepted", async () => {
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

    const response = await server.inject({
      method: "POST",
      url: `/v1/connections/${created.json().id}/resend`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it("attributes the DomainEvent to the requester when an admin resends", async () => {
    const a = await authedUser("a@harmon.dev");
    await authedUser("b@harmon.dev");
    const admin = await authedAdmin();
    const created = await server.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { addresseeEmail: "b@harmon.dev" },
    });
    sendMock.mockClear();

    const response = await server.inject({
      method: "POST",
      url: `/v1/connections/${created.json().id}/resend`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    // Same rationale as the delete case: the requester, not the acting
    // admin, must be the owner of the resulting timeline event.
    const events = await server.prisma.domainEvent.findMany({
      where: { aggregateId: created.json().id, type: "connection.resent" },
    });
    expect(events.some((e) => e.userId === a.userId)).toBe(true);
    expect(events.some((e) => e.userId === admin.userId)).toBe(false);
  });
});
