import type { FastifyInstance } from "fastify";
// apps/api/src/shares/routes.test.ts
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

describe("POST /v1/shares", () => {
  it("shares an owned account with a connected user", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission: "view",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().permission).toBe("view");
  });

  it("rejects sharing without an accepted connection", async () => {
    const a = await authedUser("a@harmon.dev");
    const b = await authedUser("b@harmon.dev");
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission: "view",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("connection.not_accepted");
  });

  it("rejects sharing an account you don't own", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: b.userId, type: "cash" },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission: "view",
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH/DELETE /v1/shares/:id — ownership", () => {
  async function shareAccount(permission: "view" | "edit" = "view") {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    const created = await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission,
      },
    });
    return { a, b, account, shareId: created.json().id };
  }

  it("only the owner can change permission — the connected user gets 403", async () => {
    const { b, shareId } = await shareAccount();

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/shares/${shareId}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { permission: "edit" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("share.not_owner");
  });

  it("only the owner can revoke — the connected user gets 403", async () => {
    const { b, shareId } = await shareAccount();

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/shares/${shareId}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("share.not_owner");
  });

  it("the owner can change permission and revoke", async () => {
    const { a, shareId } = await shareAccount();

    const patched = await server.inject({
      method: "PATCH",
      url: `/v1/shares/${shareId}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { permission: "edit" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().permission).toBe("edit");

    const deleted = await server.inject({
      method: "DELETE",
      url: `/v1/shares/${shareId}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(deleted.statusCode).toBe(200);
  });
});

describe("PATCH /v1/accounts/:id with a share grant", () => {
  it("a connected user with permission=view gets 403 attempting to edit", async () => {
    const { a, b } = await connectedPair();
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission: "view",
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { name: "Renomeada" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("share.view_only");
  });

  it("a connected user with permission=edit can edit; an unrelated user still gets 404", async () => {
    const { a, b } = await connectedPair();
    const stranger = await authedUser("stranger@harmon.dev");
    const account = await server.prisma.account.create({
      data: { userId: a.userId, type: "cash" },
    });
    await server.inject({
      method: "POST",
      url: "/v1/shares",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        sharedWithUserId: b.userId,
        itemType: "account",
        accountId: account.id,
        permission: "edit",
      },
    });

    const edit = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
      payload: { name: "Renomeada" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().name).toBe("Renomeada");

    const strangerAttempt = await server.inject({
      method: "PATCH",
      url: `/v1/accounts/${account.id}`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { name: "Hackeada" },
    });
    expect(strangerAttempt.statusCode).toBe(404);
  });
});
