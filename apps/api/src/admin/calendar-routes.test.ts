import type { FastifyInstance } from "fastify";
// apps/api/src/admin/calendar-routes.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetTestDb } from "../../test/db.js";
import { signAccessToken } from "../auth/jwt.js";
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

async function createUser(role: "user" | "admin") {
  const user = await server.prisma.user.create({
    data: {
      email: `user-${Math.random().toString(36).slice(2)}@harmon.dev`,
      name: role === "admin" ? "Admin User" : "Plain User",
      birthDate: new Date("1990-01-01"),
      role,
    },
  });
  const accessToken = await signAccessToken(
    { sub: user.id, role },
    TEST_ENV.JWT_SECRET,
  );
  return { userId: user.id, accessToken };
}

describe("/v1/admin/calendar-entries", () => {
  it("a role=user token gets 403 on any calendar-entries route", async () => {
    const { accessToken } = await createUser("user");

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/calendar-entries",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it("creates, lists, updates and deletes an entry", async () => {
    const { accessToken } = await createUser("admin");
    const auth = { authorization: `Bearer ${accessToken}` };

    const created = await server.inject({
      method: "POST",
      url: "/v1/admin/calendar-entries",
      headers: auth,
      payload: { title: "Natal", month: 12, day: 25 },
    });
    expect(created.statusCode).toBe(201);
    const entry = created.json();
    expect(entry.title).toBe("Natal");
    expect(entry.month).toBe(12);
    expect(entry.day).toBe(25);
    expect(entry.displayStyle).toBe("inline");

    const listed = await server.inject({
      method: "GET",
      url: "/v1/admin/calendar-entries",
      headers: auth,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);

    const updated = await server.inject({
      method: "PATCH",
      url: `/v1/admin/calendar-entries/${entry.id}`,
      headers: auth,
      payload: { title: "Natal (feriado)", displayStyle: "box" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().title).toBe("Natal (feriado)");
    expect(updated.json().displayStyle).toBe("box");

    const deleted = await server.inject({
      method: "DELETE",
      url: `/v1/admin/calendar-entries/${entry.id}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(204);

    const listedAfterDelete = await server.inject({
      method: "GET",
      url: "/v1/admin/calendar-entries",
      headers: auth,
    });
    expect(listedAfterDelete.json()).toHaveLength(0);
  });

  it("rejects an invalid month/day with a validation error", async () => {
    const { accessToken } = await createUser("admin");

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/calendar-entries",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { title: "Inválido", month: 13, day: 1 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("404s updating/deleting an entry that doesn't exist", async () => {
    const { accessToken } = await createUser("admin");
    const auth = { authorization: `Bearer ${accessToken}` };

    const updated = await server.inject({
      method: "PATCH",
      url: "/v1/admin/calendar-entries/does-not-exist",
      headers: auth,
      payload: { title: "x" },
    });
    expect(updated.statusCode).toBe(404);

    const deleted = await server.inject({
      method: "DELETE",
      url: "/v1/admin/calendar-entries/does-not-exist",
      headers: auth,
    });
    expect(deleted.statusCode).toBe(404);
  });
});
