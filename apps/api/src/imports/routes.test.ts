import type { FastifyInstance } from "fastify";
// apps/api/src/imports/routes.test.ts
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

// Same dependency-injection pattern as auth/routes.test.ts's Resend mock —
// fakes the one function routes.ts calls, so the whole extraction pipeline
// runs for real except the actual network call to bel-ia/DeepSeek.
const { belIaChatMock } = vi.hoisted(() => ({ belIaChatMock: vi.fn() }));
vi.mock("./bel-ia-client.js", () => ({
  belIaChat: belIaChatMock,
}));

// Partial mock of createRecurringTransactionSeries — real implementation by
// default (every existing test exercises the real DB write path), swapped
// for a throwing wrapper in exactly one test below to prove the
// createRecurringFromSuggestion transaction actually rolls back a
// mid-sequence failure instead of leaving an orphaned RecurringTransaction.
// `seriesFactoryHolder.actual` keeps a handle on the real function so that
// test can still perform the real write before injecting the failure.
const seriesFactoryHolder = vi.hoisted(() => ({
  actual: null as unknown,
}));
vi.mock("../recurring-transactions/create.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../recurring-transactions/create.js")
    >();
  seriesFactoryHolder.actual = actual.createRecurringTransactionSeries;
  return {
    ...actual,
    createRecurringTransactionSeries: vi.fn(
      actual.createRecurringTransactionSeries,
    ),
  };
});

const { buildServer } = await import("../server.js");
const { createRecurringTransactionSeries } = await import(
  "../recurring-transactions/create.js"
);

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

beforeEach(async () => {
  await server.prisma.featureFlag.upsert({
    where: { key: "imports.pipeline" },
    update: { state: "on" },
    create: {
      key: "imports.pipeline",
      description: "Test",
      state: "on",
      rolloutPercent: 100,
    },
  });
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

describe("line review", () => {
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

describe("description alias", () => {
  it("learns a friendly name when a confirmed line's description was edited away from the raw text", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { description: "Loja A — mercado do bairro" },
    });

    const alias = await server.prisma.descriptionAlias.findUnique({
      where: { userId_rawDescription: { userId, rawDescription: "Loja A" } },
    });
    expect(alias?.friendlyName).toBe("Loja A — mercado do bairro");
  });

  it("pre-fills a later line with the learned name while keeping the raw text as originalDescription", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);

    // First invoice: user renames "AMAZONMKTPLC*MASTERLIN" on confirm.
    fakeLlmResponse([
      { description: "AMAZONMKTPLC*MASTERLIN", amountCents: 3000 },
    ]);
    const first = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });
    const firstDocumentId = first.json().document.id;
    const firstLineId = first.json().lines[0].id;
    await server.inject({
      method: "PATCH",
      url: `/v1/imports/${firstDocumentId}/lines/${firstLineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { description: "Amazon" },
    });

    // Second, later invoice: same raw merchant string reappears.
    fakeLlmResponse([
      { description: "AMAZONMKTPLC*MASTERLIN", amountCents: 4500 },
    ]);
    const second = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });

    const line = second.json().lines[0];
    expect(line.description).toBe("Amazon");
    expect(line.originalDescription).toBe("AMAZONMKTPLC*MASTERLIN");

    const alias = await server.prisma.descriptionAlias.findUnique({
      where: {
        userId_rawDescription: {
          userId,
          rawDescription: "AMAZONMKTPLC*MASTERLIN",
        },
      },
    });
    expect(alias?.friendlyName).toBe("Amazon");
  });
});

describe("tags", () => {
  it("learns a tag when a confirmed line was tagged, and attaches it to the confirmed Transaction", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tagNames: ["uber"] },
    });
    const confirmRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const confirmedTransactionId = confirmRes.json().confirmedTransactionId;

    const tag = await server.prisma.tag.findUnique({
      where: { userId_name: { userId, name: "uber" } },
    });
    expect(tag).not.toBeNull();

    const link = await server.prisma.transactionTag.findUnique({
      where: {
        transactionId_tagId: {
          transactionId: confirmedTransactionId,
          tagId: tag?.id as string,
        },
      },
    });
    expect(link).not.toBeNull();

    const suggestion = await server.prisma.descriptionTagSuggestion.findFirst({
      where: { userId, rawDescription: "Loja A", tagId: tag?.id },
    });
    expect(suggestion).not.toBeNull();
  });

  it("pre-fills a later line's suggestedTagNames from the learned rawDescription mapping", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);

    fakeLlmResponse([{ description: "UBER *TRIP", amountCents: 2500 }]);
    const first = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });
    const firstLineId = first.json().lines[0].id;
    await server.inject({
      method: "PATCH",
      url: `/v1/imports/${first.json().document.id}/lines/${firstLineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tagNames: ["uber"] },
    });

    fakeLlmResponse([{ description: "UBER *TRIP", amountCents: 3100 }]);
    const second = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });

    expect(second.json().lines[0].suggestedTagNames).toEqual(["uber"]);
  });

  it("never suggests a tag name the LLM invented outside the user's existing vocabulary", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    // No tags exist yet for this user — belIaChatMock still returns a
    // "tags" field (simulating a model that ignored the prompt's "only
    // from the existing list" rule) to prove extractor.ts's defensive
    // re-filter, not just the prompt wording, is what keeps it out.
    belIaChatMock.mockResolvedValue(
      JSON.stringify([
        { description: "UBER *TRIP", amountCents: 2500, tags: ["corridas"] },
      ]),
    );
    const res = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: `hash-${Math.random()}`,
        text: "...",
      },
    });

    expect(res.json().lines[0].suggestedTagNames).toEqual([]);
  });
});

describe("duplicate detection", () => {
  it("flags an extracted line as a possible duplicate of an existing Transaction", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const existing = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Compra manual anterior",
        transactionDate: new Date(Date.UTC(2026, 6, 10)),
        currency: "BRL",
        amountCents: 5000,
        amountBRLCents: 5000,
      },
    });

    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "Loja A",
        amountCents: 5000,
        kind: "expense",
        confidence: 0.9,
      },
      {
        date: "2026-07-11",
        description: "Loja B (sem duplicata)",
        amountCents: 3000,
        kind: "expense",
        confidence: 0.9,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "dup-hash",
        text: "...",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    const dupLine = body.lines.find(
      (l: { amountCents: number }) => l.amountCents === 5000,
    );
    const cleanLine = body.lines.find(
      (l: { amountCents: number }) => l.amountCents === 3000,
    );
    expect(dupLine.duplicateOfTxId).toBe(existing.id);
    expect(cleanLine.duplicateOfTxId).toBeNull();
    expect(body.duplicates[existing.id]).toMatchObject({
      description: "Compra manual anterior",
      amountCents: 5000,
      kind: "expense",
    });
  });

  it("does not flag a duplicate for a different user's transaction", async () => {
    const owner = await authedUser();
    const other = await authedUser();
    const c = await card(owner.userId);
    const otherCard = await card(other.userId);
    await server.prisma.transaction.create({
      data: {
        userId: other.userId,
        creditCardId: otherCard.id,
        kind: "expense",
        source: "manual",
        description: "Transação de outro usuário",
        transactionDate: new Date(Date.UTC(2026, 6, 10)),
        currency: "BRL",
        amountCents: 5000,
        amountBRLCents: 5000,
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "Loja A",
        amountCents: 5000,
        kind: "expense",
        confidence: 0.9,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "dup-hash-2",
        text: "...",
      },
    });

    expect(response.json().lines[0].duplicateOfTxId).toBeNull();
  });
});

describe("confirm with duplicate resolution", () => {
  async function createImportWithDuplicate(
    accessToken: string,
    userId: string,
    creditCardId: string,
  ) {
    const existing = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId,
        kind: "expense",
        source: "manual",
        description: "Compra manual anterior",
        transactionDate: new Date(Date.UTC(2026, 6, 10)),
        currency: "BRL",
        amountCents: 5000,
        amountBRLCents: 5000,
      },
    });
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
        contentHash: `dup-confirm-${Math.random()}`,
        text: "...",
      },
    });
    const body = res.json();
    return {
      documentId: body.document.id,
      lineId: body.lines[0].id,
      existingTxId: existing.id,
    };
  }

  it("keep_both (default): confirming leaves the old transaction and creates a new one", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId, existingTxId } =
      await createImportWithDuplicate(accessToken, userId, c.id);

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const stillExists = await server.prisma.transaction.findUnique({
      where: { id: existingTxId },
    });
    expect(stillExists).not.toBeNull();
    const txCount = await server.prisma.transaction.count({
      where: { userId },
    });
    expect(txCount).toBe(2);
  });

  it("replace: confirming deletes the old duplicate and keeps only the new transaction", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId, existingTxId } =
      await createImportWithDuplicate(accessToken, userId, c.id);

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { resolution: "replace" },
    });

    expect(response.statusCode).toBe(200);
    const deleted = await server.prisma.transaction.findUnique({
      where: { id: existingTxId },
    });
    expect(deleted).toBeNull();
    const txCount = await server.prisma.transaction.count({
      where: { userId },
    });
    expect(txCount).toBe(1);
  });

  it("rejects resolution=replace when the line has no duplicate", async () => {
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
      payload: { resolution: "replace" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("recurring subscription detection on extraction", () => {
  it("suggests a known subscription on the very first occurrence", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "NETFLIX.COM",
        amountCents: 3990,
        kind: "expense",
        confidence: 0.95,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "known-sub-hash",
        text: "...",
      },
    });

    const line = response.json().lines[0];
    expect(line.recurringSuggestionLabel).toBe("Netflix");
    expect(line.suggestedRecurringId).toBeNull();
  });

  it("suggests a generic pattern on the 3rd occurrence, not before", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 4, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 5, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-15",
        description: "Academia XPTO",
        amountCents: 9900,
        kind: "expense",
        confidence: 0.9,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "pattern-hash",
        text: "...",
      },
    });

    const line = response.json().lines[0];
    expect(line.recurringSuggestionLabel).toBe("Academia XPTO");
    expect(line.suggestedRecurringId).toBeNull();
  });

  it("links to an existing active series instead of suggesting a new one", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Spotify",
        kind: "expense",
        creditCardId: c.id,
        referenceAmountCents: 2190,
        referenceAmountBRLCents: 2190,
        dayOfMonth: 5,
        startDate: new Date(Date.UTC(2026, 5, 5)),
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-05",
        description: "Spotify",
        amountCents: 2190,
        kind: "expense",
        confidence: 0.9,
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "existing-series-hash",
        text: "...",
      },
    });

    const line = response.json().lines[0];
    expect(line.suggestedRecurringId).toBe(series.id);
    expect(line.recurringSuggestionLabel).toBeNull();
  });
});

describe("PATCH .../lines/:lineId — recurringTransactionId", () => {
  it("links the line to an existing series chosen by the user", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Spotify",
        kind: "expense",
        creditCardId: c.id,
        referenceAmountCents: 2190,
        referenceAmountBRLCents: 2190,
        dayOfMonth: 5,
        startDate: new Date(Date.UTC(2026, 5, 5)),
      },
    });
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recurringTransactionId: series.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestedRecurringId).toBe(series.id);
  });

  it("unlinks when recurringTransactionId is set to null", async () => {
    const { accessToken, userId } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recurringTransactionId: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestedRecurringId).toBeNull();
  });

  it("rejects a series that doesn't belong to the user", async () => {
    const owner = await authedUser();
    const other = await authedUser();
    const ownerCard = await card(owner.userId);
    const otherCard = await card(other.userId);
    const otherSeries = await server.prisma.recurringTransaction.create({
      data: {
        userId: other.userId,
        description: "Spotify",
        kind: "expense",
        creditCardId: otherCard.id,
        referenceAmountCents: 2190,
        referenceAmountBRLCents: 2190,
        dayOfMonth: 5,
        startDate: new Date(Date.UTC(2026, 5, 5)),
      },
    });
    const { documentId, lineId } = await createImportWithOneLine(
      owner.accessToken,
      ownerCard.id,
    );

    const response = await server.inject({
      method: "PATCH",
      url: `/v1/imports/${documentId}/lines/${lineId}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { recurringTransactionId: otherSeries.id },
    });

    expect(response.statusCode).toBe(400);
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

describe("confirm — recurring link and subscription creation", () => {
  it("silently links the confirmed transaction when the line already has suggestedRecurringId", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Spotify",
        kind: "expense",
        creditCardId: c.id,
        referenceAmountCents: 2190,
        referenceAmountBRLCents: 2190,
        dayOfMonth: 5,
        startDate: new Date(Date.UTC(2026, 5, 5)),
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-05",
        description: "Spotify",
        amountCents: 2190,
        kind: "expense",
        confidence: 0.9,
      },
    ]);
    const importRes = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "silent-link-hash",
        text: "...",
      },
    });
    const { document, lines } = importRes.json();
    expect(lines[0].suggestedRecurringId).toBe(series.id);

    const confirmRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${document.id}/lines/${lines[0].id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(confirmRes.statusCode).toBe(200);
    const txId = confirmRes.json().confirmedTransactionId;
    const tx = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: txId },
    });
    expect(tx.recurringTransactionId).toBe(series.id);
    const fulfillment = await server.prisma.recurringFulfillment.findUnique({
      where: {
        recurringTransactionId_year_month: {
          recurringTransactionId: series.id,
          year: 2026,
          month: 7,
        },
      },
    });
    expect(fulfillment?.transactionId).toBe(txId);
    expect(fulfillment?.method).toBe("import_link");
  });

  it("createRecurringFromSuggestion: creates the series and relinks the past pattern matches", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const older = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 4, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    const newer = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 5, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-15",
        description: "Academia XPTO",
        amountCents: 9900,
        kind: "expense",
        confidence: 0.9,
      },
    ]);
    const importRes = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "create-series-hash",
        text: "...",
      },
    });
    const { document, lines } = importRes.json();
    expect(lines[0].recurringSuggestionLabel).toBe("Academia XPTO");

    const confirmRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${document.id}/lines/${lines[0].id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { createRecurringFromSuggestion: true },
    });

    expect(confirmRes.statusCode).toBe(200);
    const txId = confirmRes.json().confirmedTransactionId;
    const newTx = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: txId },
    });
    expect(newTx.recurringTransactionId).not.toBeNull();

    const series = await server.prisma.recurringTransaction.findUniqueOrThrow({
      where: { id: newTx.recurringTransactionId as string },
    });
    expect(series.description).toBe("Academia XPTO");
    expect(series.referenceAmountCents).toBe(9900);
    expect(series.categoryId).toBeNull();

    const relinkedOlder = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: older.id },
    });
    const relinkedNewer = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: newer.id },
    });
    expect(relinkedOlder.recurringTransactionId).toBe(series.id);
    expect(relinkedNewer.recurringTransactionId).toBe(series.id);

    const fulfillments = await server.prisma.recurringFulfillment.findMany({
      where: { recurringTransactionId: series.id },
      orderBy: { month: "asc" },
    });
    expect(fulfillments).toHaveLength(3); // maio, junho, julho
    expect(fulfillments.every((f) => f.method === "import_link")).toBe(true);

    // Generic-pattern case (knownLabel null): the series' description is
    // already the raw/resolved description, so no DescriptionAlias should
    // be created — the exact match in findRecurringSeriesMatches works
    // without one. See the known-subscription test below for the case
    // where an alias IS needed.
    const aliasCount = await server.prisma.descriptionAlias.count({
      where: { userId },
    });
    expect(aliasCount).toBe(0);
  });

  it("createRecurringFromSuggestion with a known-subscription label: learns a DescriptionAlias so the next import of the same raw description matches the series instead of re-suggesting a new one", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);

    fakeLlmResponse([
      {
        date: "2026-07-10",
        description: "NETFLIX.COM",
        amountCents: 3990,
        kind: "expense",
        confidence: 0.95,
      },
    ]);
    const firstImportRes = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "netflix-first-hash",
        text: "...",
      },
    });
    const firstDoc = firstImportRes.json();
    expect(firstDoc.lines[0].recurringSuggestionLabel).toBe("Netflix");
    expect(firstDoc.lines[0].suggestedRecurringId).toBeNull();

    const confirmRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${firstDoc.document.id}/lines/${firstDoc.lines[0].id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { createRecurringFromSuggestion: true },
    });
    expect(confirmRes.statusCode).toBe(200);
    const firstTx = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: confirmRes.json().confirmedTransactionId },
    });
    expect(firstTx.recurringTransactionId).not.toBeNull();
    const series = await server.prisma.recurringTransaction.findUniqueOrThrow({
      where: { id: firstTx.recurringTransactionId as string },
    });
    expect(series.description).toBe("Netflix");

    // Bug reproduction: a second import of the same raw "NETFLIX.COM" text
    // a month later. Before the fix, no DescriptionAlias existed mapping
    // "NETFLIX.COM" -> "Netflix", so the extraction step's resolved
    // description stayed "NETFLIX.COM" — which never equals the series'
    // "Netflix" description, so Caso A (findRecurringSeriesMatches) never
    // matched and the line re-suggested Caso B (knownLabel again) instead
    // of linking to the already-created series.
    fakeLlmResponse([
      {
        date: "2026-08-10",
        description: "NETFLIX.COM",
        amountCents: 3990,
        kind: "expense",
        confidence: 0.95,
      },
    ]);
    const secondImportRes = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "netflix-second-hash",
        text: "...",
      },
    });
    const secondDoc = secondImportRes.json();
    expect(secondDoc.lines[0].suggestedRecurringId).toBe(series.id);
    expect(secondDoc.lines[0].recurringSuggestionLabel).toBeNull();
  });

  it("createRecurringFromSuggestion fails when the line has no valid suggestion", async () => {
    const { accessToken, userId } = await authedUser();
    const c = await card(userId);
    const { documentId, lineId } = await createImportWithOneLine(
      accessToken,
      c.id,
    );

    const response = await server.inject({
      method: "POST",
      url: `/v1/imports/${documentId}/lines/${lineId}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { createRecurringFromSuggestion: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it("createRecurringFromSuggestion: a failure after the series is created rolls back the whole transaction (no orphaned series, no partial relink)", async () => {
    const { userId, accessToken } = await authedUser();
    const c = await card(userId);
    const older = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 4, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    const newer = await server.prisma.transaction.create({
      data: {
        userId,
        creditCardId: c.id,
        kind: "expense",
        source: "manual",
        description: "Academia XPTO",
        transactionDate: new Date(Date.UTC(2026, 5, 15)),
        currency: "BRL",
        amountCents: 9900,
        amountBRLCents: 9900,
      },
    });
    fakeLlmResponse([
      {
        date: "2026-07-15",
        description: "Academia XPTO",
        amountCents: 9900,
        kind: "expense",
        confidence: 0.9,
      },
    ]);
    const importRes = await server.inject({
      method: "POST",
      url: "/v1/imports",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        type: "card_invoice",
        creditCardId: c.id,
        contentHash: "rollback-hash",
        text: "...",
      },
    });
    const { document, lines } = importRes.json();

    // Series creation succeeds (real write, inside the request's
    // $transaction), then we throw — simulating a failure in whatever
    // happens next in the same transaction (the retroactive relink loop or
    // confirmLine's own writes). If the transaction wrapping is correct,
    // Postgres rolls back the series create too; if it isn't (the bug this
    // test guards against), the series row survives as orphaned garbage.
    const actualCreateSeries =
      seriesFactoryHolder.actual as typeof createRecurringTransactionSeries;
    vi.mocked(createRecurringTransactionSeries).mockImplementationOnce(
      async (...args) => {
        await actualCreateSeries(...args);
        throw new Error("Injected failure to test transaction rollback");
      },
    );

    const confirmRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${document.id}/lines/${lines[0].id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { createRecurringFromSuggestion: true },
    });

    expect(confirmRes.statusCode).toBe(500);

    const seriesCount = await server.prisma.recurringTransaction.count({
      where: { userId, description: "Academia XPTO" },
    });
    expect(seriesCount).toBe(0);

    const line = await server.prisma.extractedTransaction.findUniqueOrThrow({
      where: { id: lines[0].id },
    });
    expect(line.status).toBe("pending");
    expect(line.confirmedTransactionId).toBeNull();

    const relinkedOlder = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: older.id },
    });
    const relinkedNewer = await server.prisma.transaction.findUniqueOrThrow({
      where: { id: newer.id },
    });
    expect(relinkedOlder.recurringTransactionId).toBeNull();
    expect(relinkedNewer.recurringTransactionId).toBeNull();

    // Retrying should not create a second/duplicate series — with the
    // injected failure removed, the (now correctly rolled-back) request can
    // simply be retried like any other failed write.
    const retryRes = await server.inject({
      method: "POST",
      url: `/v1/imports/${document.id}/lines/${lines[0].id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { createRecurringFromSuggestion: true },
    });
    expect(retryRes.statusCode).toBe(200);
    const seriesAfterRetry = await server.prisma.recurringTransaction.findMany({
      where: { userId, description: "Academia XPTO" },
    });
    expect(seriesAfterRetry).toHaveLength(1);
  });
});
