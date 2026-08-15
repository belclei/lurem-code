// apps/api/src/imports/routes.ts
// ARQUITETURA.md §6.8 — pipeline de importação de documentos, com staging.
//
// Privacidade por desenho (decisão já tomada em §6.8, não deste commit): o
// PDF nunca chega ao servidor — o navegador extrai o texto (markitdown-like,
// ver apps/web) e só o texto sobe aqui, de passagem: ele entra no corpo do
// POST, alimenta a extração via LLM (extractor.ts) e nunca é persistido —
// nem em ImportedDocument nem em qualquer storage. O que fica em staging é
// só o dado já processado (ExtractedTransaction).
//
// Escopo desta primeira implementação (judgment calls, registrados aqui em
// vez de espalhados): processamento é SÍNCRONO dentro do POST — esta base de
// código não tem fila real (BullMQ) ainda, só cron scripts simples (ver
// jobs/), e introduzir uma fila + worker novo só para isto seria infra maior
// que o valor entregue agora. Column suggestedPortadorUserId/
// suggestedRecurringId/duplicateOfTxId do schema ficam null nesta versão —
// portador/recorrência/duplicata sugeridos automaticamente é backlog
// (issues.md), a revisão manual já cobre o caso base. A checagem de "essa
// confirmação em lote deixaria a conta além do limite" (§6.8 item 6) também
// fica de fora do lote automático por ora — consistente com o resto do app,
// que sempre permite e só avisa (§0), nunca bloqueia.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { NOT_FOUND, VALIDATION_FAILED } from "../errors.js";
import { belIaChat } from "./bel-ia-client.js";
import { extractTransactionsFromText } from "./extractor.js";
import {
  toExtractedTransactionResponse,
  toImportedDocumentResponse,
} from "./serialize.js";

const ImportType = z.enum(["card_invoice", "account_statement"]);

const CreateImportBody = z.object({
  type: ImportType,
  accountId: z.string().min(1).optional(),
  creditCardId: z.string().min(1).optional(),
  contentHash: z.string().min(1),
  text: z.string().min(1),
});

const UpdateLineBody = z
  .object({
    description: z.string().min(1).optional(),
    amountCents: z.number().int().positive().optional(),
    transactionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.")
      .optional(),
    kind: z.enum(["income", "expense"]).optional(),
    categoryId: z.string().min(1).nullable().optional(),
  })
  .strict();

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

function parseDateOnly(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export async function registerImportRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const { prisma } = fastify;

  async function findOwnedDocument(userId: string, id: string) {
    const doc = await prisma.importedDocument.findFirst({
      where: { id, userId },
    });
    if (!doc) throw NOT_FOUND();
    return doc;
  }

  // Once every line has moved past `pending` (confirmed or rejected), the
  // document is fully reviewed — matches §6.8 step 7 ("Pós-confirmação").
  async function maybeMarkReviewed(importedDocumentId: string): Promise<void> {
    const stillPending = await prisma.extractedTransaction.count({
      where: { importedDocumentId, status: "pending" },
    });
    if (stillPending === 0) {
      await prisma.importedDocument.update({
        where: { id: importedDocumentId },
        data: { status: "reviewed" },
      });
    }
  }

  fastify.post(
    "/v1/imports",
    { schema: { body: CreateImportBody }, preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const body = request.body as z.infer<typeof CreateImportBody>;

      if (body.type === "card_invoice" && !body.creditCardId) {
        throw VALIDATION_FAILED([
          { field: "creditCardId", message: "Escolha um cartão." },
        ]);
      }
      if (body.type === "account_statement" && !body.accountId) {
        throw VALIDATION_FAILED([
          { field: "accountId", message: "Escolha uma conta." },
        ]);
      }
      if (body.creditCardId) {
        const card = await prisma.creditCard.findFirst({
          where: { id: body.creditCardId, userId },
        });
        if (!card) {
          throw VALIDATION_FAILED([
            { field: "creditCardId", message: "Cartão não encontrado." },
          ]);
        }
      }
      if (body.accountId) {
        const account = await prisma.account.findFirst({
          where: { id: body.accountId, userId },
        });
        if (!account) {
          throw VALIDATION_FAILED([
            { field: "accountId", message: "Conta não encontrada." },
          ]);
        }
      }

      // Dedup de arquivo (§6.8 item 2) — mesmo hash já importado por este
      // usuário retorna o documento existente em vez de duplicar.
      const existing = await prisma.importedDocument.findUnique({
        where: {
          userId_contentHash: { userId, contentHash: body.contentHash },
        },
      });
      if (existing) {
        const lines = await prisma.extractedTransaction.findMany({
          where: { importedDocumentId: existing.id },
          orderBy: { transactionDate: "desc" },
        });
        return {
          duplicate: true,
          document: toImportedDocumentResponse(existing),
          lines: lines.map(toExtractedTransactionResponse),
        };
      }

      const doc = await prisma.importedDocument.create({
        data: {
          userId,
          type: body.type,
          accountId: body.accountId ?? null,
          creditCardId: body.creditCardId ?? null,
          contentHash: body.contentHash,
          status: "processing",
        },
      });

      const categories = await prisma.category.findMany({
        where: { OR: [{ userId: null }, { userId }] },
      });

      try {
        const items = await extractTransactionsFromText(
          body.text,
          categories.map((c) => ({ name: c.name, kind: c.kind })),
          (action, messages) =>
            belIaChat(
              fastify.env.BEL_IA_URL,
              fastify.env.BEL_IA_KEY,
              action,
              messages,
            ),
        );

        const categoryByName = new Map(
          categories.map((c) => [`${c.name.toLowerCase()}:${c.kind}`, c.id]),
        );

        await prisma.$transaction([
          prisma.extractedTransaction.createMany({
            data: items.map((item) => ({
              importedDocumentId: doc.id,
              kind: item.kind,
              transactionDate: item.transactionDate
                ? parseDateOnly(item.transactionDate)
                : new Date(),
              amountCents: item.amountCents,
              currency: item.currency,
              description: item.description,
              suggestedCategoryId: item.suggestedCategoryName
                ? (categoryByName.get(
                    `${item.suggestedCategoryName.toLowerCase()}:${item.kind}`,
                  ) ?? null)
                : null,
              confidence: item.confidence,
              cardHolderRaw: item.cardHolderRaw,
              installmentNumber: item.installmentNumber,
              installmentTotal: item.installmentTotal,
            })),
          }),
          prisma.importedDocument.update({
            where: { id: doc.id },
            data: {
              status: "extracted",
              rawJson: items as unknown as object,
              processedAt: new Date(),
            },
          }),
        ]);
      } catch (err) {
        await prisma.importedDocument.update({
          where: { id: doc.id },
          data: {
            status: "error",
            errorMessage:
              err instanceof Error ? err.message : "Falha na extração.",
            processedAt: new Date(),
          },
        });
      }

      const finalDoc = await prisma.importedDocument.findUniqueOrThrow({
        where: { id: doc.id },
      });
      const lines = await prisma.extractedTransaction.findMany({
        where: { importedDocumentId: doc.id },
        orderBy: { transactionDate: "desc" },
      });

      reply.code(201);
      return {
        duplicate: false,
        document: toImportedDocumentResponse(finalDoc),
        lines: lines.map(toExtractedTransactionResponse),
      };
    },
  );

  fastify.get(
    "/v1/imports",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const docs = await prisma.importedDocument.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return docs.map(toImportedDocumentResponse);
    },
  );

  fastify.get(
    "/v1/imports/:id",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const doc = await findOwnedDocument(userId, id);
      const lines = await prisma.extractedTransaction.findMany({
        where: { importedDocumentId: doc.id },
        orderBy: { transactionDate: "desc" },
      });
      return {
        document: toImportedDocumentResponse(doc),
        lines: lines.map(toExtractedTransactionResponse),
      };
    },
  );

  fastify.delete(
    "/v1/imports/:id",
    { preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      await findOwnedDocument(userId, id);
      // Remove só o staging — Transaction já confirmadas a partir daqui
      // continuam existindo, isto não desfaz confirmações.
      await prisma.extractedTransaction.deleteMany({
        where: { importedDocumentId: id },
      });
      await prisma.importedDocument.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  async function findOwnedLine(
    userId: string,
    importId: string,
    lineId: string,
  ) {
    const doc = await findOwnedDocument(userId, importId);
    const line = await prisma.extractedTransaction.findFirst({
      where: { id: lineId, importedDocumentId: doc.id },
    });
    if (!line) throw NOT_FOUND();
    return { doc, line };
  }

  fastify.patch(
    "/v1/imports/:id/lines/:lineId",
    { schema: { body: UpdateLineBody }, preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id, lineId } = request.params as { id: string; lineId: string };
      const body = request.body as z.infer<typeof UpdateLineBody>;
      const { line } = await findOwnedLine(userId, id, lineId);

      if (line.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "status", message: "Esta linha já foi revisada." },
        ]);
      }

      const updated = await prisma.extractedTransaction.update({
        where: { id: line.id },
        data: {
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.amountCents !== undefined
            ? { amountCents: body.amountCents }
            : {}),
          ...(body.transactionDate !== undefined
            ? { transactionDate: parseDateOnly(body.transactionDate) }
            : {}),
          ...(body.kind !== undefined ? { kind: body.kind } : {}),
          ...(body.categoryId !== undefined
            ? { suggestedCategoryId: body.categoryId }
            : {}),
        },
      });
      return toExtractedTransactionResponse(updated);
    },
  );

  async function confirmLine(
    userId: string,
    doc: { id: string; accountId: string | null; creditCardId: string | null },
    line: {
      id: string;
      kind: "income" | "expense" | "transfer";
      transactionDate: Date;
      amountCents: number;
      currency: string;
      description: string;
      suggestedCategoryId: string | null;
      installmentNumber: number | null;
      installmentTotal: number | null;
    },
  ): Promise<void> {
    const tx = await prisma.transaction.create({
      data: {
        userId,
        kind: line.kind,
        accountId: doc.accountId,
        creditCardId: doc.creditCardId,
        categoryId: line.suggestedCategoryId,
        source: "import",
        description: line.description,
        transactionDate: line.transactionDate,
        currency: line.currency,
        amountCents: line.amountCents,
        amountBRLCents: line.amountCents,
        installmentNumber: line.installmentNumber,
        installmentTotal: line.installmentTotal,
      },
    });
    await prisma.extractedTransaction.update({
      where: { id: line.id },
      data: { status: "confirmed", confirmedTransactionId: tx.id },
    });
  }

  fastify.post(
    "/v1/imports/:id/lines/:lineId/confirm",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id, lineId } = request.params as { id: string; lineId: string };
      const { doc, line } = await findOwnedLine(userId, id, lineId);
      if (line.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "status", message: "Esta linha já foi revisada." },
        ]);
      }
      await confirmLine(userId, doc, line);
      await maybeMarkReviewed(doc.id);
      const updated = await prisma.extractedTransaction.findUniqueOrThrow({
        where: { id: line.id },
      });
      return toExtractedTransactionResponse(updated);
    },
  );

  fastify.post(
    "/v1/imports/:id/lines/:lineId/reject",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id, lineId } = request.params as { id: string; lineId: string };
      const { doc, line } = await findOwnedLine(userId, id, lineId);
      if (line.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "status", message: "Esta linha já foi revisada." },
        ]);
      }
      const updated = await prisma.extractedTransaction.update({
        where: { id: line.id },
        data: { status: "rejected" },
      });
      await maybeMarkReviewed(doc.id);
      return toExtractedTransactionResponse(updated);
    },
  );

  fastify.post(
    "/v1/imports/:id/confirm-high-confidence",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const doc = await findOwnedDocument(userId, id);
      const lines = await prisma.extractedTransaction.findMany({
        where: {
          importedDocumentId: doc.id,
          status: "pending",
          confidence: { gte: HIGH_CONFIDENCE_THRESHOLD },
        },
      });
      for (const line of lines) {
        await confirmLine(userId, doc, line);
      }
      await maybeMarkReviewed(doc.id);
      return { confirmedCount: lines.length };
    },
  );
}
