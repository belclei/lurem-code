import type { FastifyInstance } from "fastify";
// apps/api/src/releases/routes.test.ts
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

describe("GET /v1/releases", () => {
  it("lists releases newest-first for any authed user", async () => {
    const admin = await createUser("admin");
    const plain = await createUser("user");
    await server.inject({
      method: "POST",
      url: "/v1/admin/releases",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { version: "2026.08.01", title: "Primeira", body: "..." },
    });
    await server.inject({
      method: "POST",
      url: "/v1/admin/releases",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { version: "2026.08.15", title: "Segunda", body: "..." },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/releases",
      headers: { authorization: `Bearer ${plain.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const releases = response.json();
    expect(releases).toHaveLength(2);
    expect(releases[0].title).toBe("Segunda");
    expect(releases[1].title).toBe("Primeira");
  });
});

describe("/v1/admin/releases", () => {
  it("a role=user token gets 403 on any admin/releases route", async () => {
    const { accessToken } = await createUser("user");

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/releases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { version: "1.0", title: "x", body: "y" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("creates, updates and deletes a release", async () => {
    const { accessToken } = await createUser("admin");
    const auth = { authorization: `Bearer ${accessToken}` };

    const created = await server.inject({
      method: "POST",
      url: "/v1/admin/releases",
      headers: auth,
      payload: {
        version: "2026.08.15",
        title: "Calendário global",
        body: "Agora dá pra cadastrar datas comemorativas.",
      },
    });
    expect(created.statusCode).toBe(201);
    const release = created.json();
    expect(release.version).toBe("2026.08.15");
    expect(release.title).toBe("Calendário global");

    const updated = await server.inject({
      method: "PATCH",
      url: `/v1/admin/releases/${release.id}`,
      headers: auth,
      payload: { title: "Calendário global (editado)" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().title).toBe("Calendário global (editado)");

    const deleted = await server.inject({
      method: "DELETE",
      url: `/v1/admin/releases/${release.id}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(204);

    const listed = await server.inject({
      method: "GET",
      url: "/v1/releases",
      headers: auth,
    });
    expect(listed.json()).toHaveLength(0);
  });

  it("404s updating/deleting a release that doesn't exist", async () => {
    const { accessToken } = await createUser("admin");
    const auth = { authorization: `Bearer ${accessToken}` };

    const updated = await server.inject({
      method: "PATCH",
      url: "/v1/admin/releases/does-not-exist",
      headers: auth,
      payload: { title: "x" },
    });
    expect(updated.statusCode).toBe(404);

    const deleted = await server.inject({
      method: "DELETE",
      url: "/v1/admin/releases/does-not-exist",
      headers: auth,
    });
    expect(deleted.statusCode).toBe(404);
  });
});
