import type { FastifyInstance } from "fastify";
// apps/api/src/imports/routes.test.ts
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";

// Same dependency-injection pattern as auth/routes.test.ts's Resend mock —
// fakes the one function routes.ts calls, so the whole extraction pipeline
// runs for real except the actual network call to bel-ia/DeepSeek.
const { belIaChatMock } = vi.hoisted(() => ({ belIaChatMock: vi.fn() }));
vi.mock("./bel-ia-client.js", () => ({
  belIaChat: belIaChatMock,
}));

const { buildServer } = await import("../server.js");

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
  belIaChatMock.mockReset();
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

function fakeLlmResponse(
  items: {
    date?: string;
    description: string;
    amountCents: number;
    kind?: "income" | "expense";
    confidence?: number;
  }[],
) {
  belIaChatMock.mockResolvedValue(JSON.stringify(items));
}

describe("POST /v1/imports", () => {
  it("extracts transactions from text into staging rows", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "Supermercado Extra",
        amountCents: 15000,
        kind: "expense",
        confidence: 0.95,
      },
      {
        date: "2026-07-12",
        description: "Estorno loja X",
        amountCents: 2000,
        kind: "income",
        confidence: 0.6,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "hash-1",
        text: "## Fatura julho\n...",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.duplicate).toBe(false);
    expect(body.document.status).toBe("extracted");
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0].status).toBe("pending");
    expect(belIaChatMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "pdf-extract",
      expect.any(Array),
    );
  });

  it("returns the existing document instead of duplicating on the same contentHash", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    fakeLlmResponse([{ description: "Item", amountCents: 1000 }]);

    const first = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "same-hash",
        text: "...",
      },
    });
    const second = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "same-hash",
        text: "...",
      },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().document.id).toBe(first.json().document.id);
    expect(belIaChatMock).toHaveBeenCalledTimes(1);
  });

  it("marks the document as error when the LLM call fails, without losing the document", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    belIaChatMock.mockRejectedValue(new Error("bel-ia error: 500 boom"));

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "hash-err",
        text: "...",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().document.status).toBe("error");
    expect(response.json().document.errorMessage).toMatch(/boom/);
    expect(response.json().lines).toHaveLength(0);
  });

  it("rejects a card_invoice import without creditCardId", async () => {
    const { accessToken } = await authedUser();

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "card_invoice", contentHash: "h", text: "x" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("line review", () => {
  async function createImportWithOneLine(
    accessToken: string,
    creditCardId: string,
  ) {
    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "Loja A",
        amountCents: 5000,
        kind: "expense",
        confidence: 0.9,
      },
    ]);
    const res = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });
    const body = res.json();
    return { documentId: body.document.id, lineId: body.lines[0].id };
  }

  it("confirms a line into a real Transaction and marks the document reviewed", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("confirmed");
    expect(response.json().confirmedTransactionId).not.toBeNull();

    const tx = await server.prisma.transaction.findUnique({
      where: { id: response.json().confirmedTransactionId },
    });
    expect(tx?.source).toBe("import");
    expect(tx?.creditCardId).toBe(c.id);
    expect(tx?.amountCents).toBe(5000);

    const doc = await server.prisma.importedDocument.findUniqueOrThrow({
      where: { id: documentId },
    });
    expect(doc.status).toBe("reviewed");
  });

  it("rejects a line without creating a Transaction", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/reject`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("rejected");
    const txCount = await server.prisma.transaction.count();
    expect(txCount).toBe(0);
  });

  it("edits a pending line before confirming it", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { description: "Loja A (corrigido)", amountCents: 5500 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().description).toBe("Loja A (corrigido)");
    expect(response.json().amountCents).toBe(5500);
  });

  it("404s confirming a line from another user's document", async () => {
    const owner = await authedUser();
    const stranger = await authedUser();
    const c = await card(owner.userId);
    const { documentId, lineId } = await createImportWithOneLine(
      owner.accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("confirm-high-confidence only confirms lines at/above the threshold", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    fakeLlmResponse([
      { description: "Alta confiança", amountCents: 1000, confidence: 0.95 },
      { description: "Baixa confiança", amountCents: 2000, confidence: 0.3 },
    ]);
    const created = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "batch-hash",
        text: "...",
      },
    });
    const documentId = created.json().document.id;

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/confirm-high-confidence`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().confirmedCount).toBe(1);
    const txCount = await server.prisma.transaction.count();
    expect(txCount).toBe(1);
  });
});

describe("DELETE /v1/imports/:id", () => {
  it("removes the document and its staging lines", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    fakeLlmResponse([{ description: "Item", amountCents: 1000 }]);
    const created = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "del-hash",
        text: "...",
      },
    });
    const documentId = created.json().document.id;

    const response = await server.inject({
      method: "DELETE",
      url: `/v1/imports/${documentId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(204);
    const doc = await server.prisma.importedDocument.findUnique({
      where: { id: documentId },
    });
    expect(doc).toBeNull();
  });
});
