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
import type { PrismaClient } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { FEATURE_DISABLED, NOT_FOUND, VALIDATION_FAILED } from "../errors.js";
import { resolveFlags } from "../flags/resolve.js";
import { setTransactionTags, upsertTags } from "../tags/service.js";
import { belIaChat } from "./bel-ia-client.js";
import {
  extractDocumentMetadata,
  extractTransactionsFromText,
} from "./extractor.js";
import { matchKnownSubscription } from "./known-subscriptions.js";
import {
  findRecurringPatternMatches,
  findRecurringSeriesMatches,
} from "./recurring-detection.js";
import {
  toExtractedTransactionResponse,
  toImportedDocumentResponse,
} from "./serialize.js";

async function requireImportsFeature(
  fastify: FastifyInstance,
  userId: string,
): Promise<void> {
  const flags = await resolveFlags(fastify.prisma, userId);
  if (!flags["imports.pipeline"]) {
    throw FEATURE_DISABLED("Importação de extratos/faturas");
  }
}

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
    tagNames: z.array(z.string().min(1)).optional(),
  })
  .strict();

const ConfirmBody = z
  .object({
    resolution: z.enum(["keep_both", "replace"]).optional(),
  })
  .strict();

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

function parseDateOnly(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function duplicateKey(date: Date, amountCents: number, kind: string): string {
  return `${date.getTime()}:${amountCents}:${kind}`;
}

// Possível duplicata (§6.8): mesmo usuário + mesma data + mesmo valor + mesmo
// kind já existindo como Transaction real. Não é uma checagem exaustiva (não
// compara descrição/moeda) — é só um sinal pra revisão humana decidir entre
// pular, manter os dois ou substituir (ver POST .../confirm, resolution).
async function findDuplicateTransactions(
  prisma: PrismaClient,
  userId: string,
  dates: Date[],
): Promise<Map<string, string>> {
  const uniqueDates = [...new Set(dates.map((d) => d.getTime()))].map(
    (t) => new Date(t),
  );
  if (uniqueDates.length === 0) return new Map();

  const candidates = await prisma.transaction.findMany({
    where: { userId, transactionDate: { in: uniqueDates } },
    select: { id: true, transactionDate: true, amountCents: true, kind: true },
  });

  const byKey = new Map<string, string>();
  for (const tx of candidates) {
    const key = duplicateKey(tx.transactionDate, tx.amountCents, tx.kind);
    if (!byKey.has(key)) byKey.set(key, tx.id);
  }
  return byKey;
}

interface DuplicateSummary {
  description: string;
  transactionDate: string;
  amountCents: number;
  kind: string;
}

async function buildDuplicatesMap(
  prisma: PrismaClient,
  lines: { duplicateOfTxId: string | null }[],
): Promise<Record<string, DuplicateSummary>> {
  const ids = [
    ...new Set(
      lines
        .map((l) => l.duplicateOfTxId)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (ids.length === 0) return {};
  const txs = await prisma.transaction.findMany({ where: { id: { in: ids } } });
  return Object.fromEntries(
    txs.map((tx) => [
      tx.id,
      {
        description: tx.description,
        transactionDate: tx.transactionDate.toISOString().slice(0, 10),
        amountCents: tx.amountCents,
        kind: tx.kind,
      },
    ]),
  );
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
      await requireImportsFeature(fastify, userId);
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

      const userTags = await prisma.tag.findMany({ where: { userId } });

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
          userTags.map((t) => t.name),
        );

        const categoryByName = new Map(
          categories.map((c) => [`${c.name.toLowerCase()}:${c.kind}`, c.id]),
        );

        const parsedItems = items.map((item) => ({
          item,
          date: item.transactionDate
            ? parseDateOnly(item.transactionDate)
            : new Date(),
        }));
        const duplicateOfTxIdByKey = await findDuplicateTransactions(
          prisma,
          userId,
          parsedItems.map((p) => p.date),
        );

        // Apply any learned renames (§ description-alias) before staging:
        // an exact match on the raw description swaps `description` to the
        // user's own friendly name, keeping the LLM's raw string in
        // `originalDescription` so the review screen can still show it and
        // the substitution is never silent.
        const aliases = await prisma.descriptionAlias.findMany({
          where: {
            userId,
            rawDescription: {
              in: [...new Set(items.map((i) => i.description))],
            },
          },
        });
        const aliasByRawDescription = new Map(
          aliases.map((a) => [a.rawDescription, a.friendlyName]),
        );

        // Resolvida uma vez aqui (mesma regra que o map de criação usa:
        // alias vence, senão o texto cru) pra alimentar as duas buscas de
        // recorrência abaixo sem repetir a lógica de alias em cada uma.
        const resolvedDescriptionByRaw = new Map(
          items.map((i) => [
            i.description,
            aliasByRawDescription.get(i.description) ?? i.description,
          ]),
        );

        const recurringSeriesMatches = await findRecurringSeriesMatches(
          prisma,
          userId,
          [...resolvedDescriptionByRaw.values()],
        );

        const patternCandidates = parsedItems.map(({ item, date }) => ({
          description: resolvedDescriptionByRaw.get(item.description) as string,
          currency: item.currency,
          kind: item.kind,
          amountCents: item.amountCents,
          date,
        }));
        const recurringPatternMatches = await findRecurringPatternMatches(
          prisma,
          userId,
          patternCandidates,
        );

        // Learned tag suggestions (§ description-tag-suggestion) — same
        // precedence rule as the alias above: a raw description this user
        // already tagged before wins over whatever the LLM guessed this
        // time (see extractor.ts's own tag-suggestion prompt/rules).
        const tagSuggestions = await prisma.descriptionTagSuggestion.findMany({
          where: {
            userId,
            rawDescription: {
              in: [...new Set(items.map((i) => i.description))],
            },
          },
        });
        const tagIdById = new Map(userTags.map((t) => [t.id, t.name]));
        const learnedTagNamesByRawDescription = new Map<string, string[]>();
        for (const s of tagSuggestions) {
          const name = tagIdById.get(s.tagId);
          if (!name) continue;
          const list =
            learnedTagNamesByRawDescription.get(s.rawDescription) ?? [];
          list.push(name);
          learnedTagNamesByRawDescription.set(s.rawDescription, list);
        }

        await prisma.$transaction([
          prisma.extractedTransaction.createMany({
            data: parsedItems.map(({ item, date }) => {
              const friendlyName = aliasByRawDescription.get(item.description);
              const resolvedDescription = friendlyName ?? item.description;
              const suggestedRecurringId =
                recurringSeriesMatches.get(resolvedDescription) ?? null;
              const recurringSuggestionLabel = suggestedRecurringId
                ? null
                : (matchKnownSubscription(resolvedDescription) ??
                  (recurringPatternMatches.has(resolvedDescription)
                    ? resolvedDescription
                    : null));
              return {
                importedDocumentId: doc.id,
                kind: item.kind,
                transactionDate: date,
                amountCents: item.amountCents,
                currency: item.currency,
                description: friendlyName ?? item.description,
                originalDescription: friendlyName ? item.description : null,
                suggestedCategoryId: item.suggestedCategoryName
                  ? (categoryByName.get(
                      `${item.suggestedCategoryName.toLowerCase()}:${item.kind}`,
                    ) ?? null)
                  : null,
                suggestedTagNames:
                  learnedTagNamesByRawDescription.get(item.description) ??
                  item.suggestedTagNames,
                confidence: item.confidence,
                cardHolderRaw: item.cardHolderRaw,
                installmentNumber: item.installmentNumber,
                installmentTotal: item.installmentTotal,
                duplicateOfTxId: duplicateOfTxIdByKey.get(
                  duplicateKey(date, item.amountCents, item.kind),
                ),
                suggestedRecurringId,
                recurringSuggestionLabel,
              };
            }),
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
      const duplicates = await buildDuplicatesMap(prisma, lines);

      reply.code(201);
      return {
        duplicate: false,
        document: toImportedDocumentResponse(finalDoc),
        lines: lines.map(toExtractedTransactionResponse),
        duplicates,
      };
    },
  );

  fastify.get(
    "/v1/imports",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      await requireImportsFeature(fastify, userId);
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
      await requireImportsFeature(fastify, userId);
      const { id } = request.params as { id: string };
      const doc = await findOwnedDocument(userId, id);
      const lines = await prisma.extractedTransaction.findMany({
        where: { importedDocumentId: doc.id },
        orderBy: { transactionDate: "desc" },
      });
      const duplicates = await buildDuplicatesMap(prisma, lines);
      return {
        document: toImportedDocumentResponse(doc),
        lines: lines.map(toExtractedTransactionResponse),
        duplicates,
      };
    },
  );

  fastify.delete(
    "/v1/imports/:id",
    { preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      await requireImportsFeature(fastify, userId);
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
      await requireImportsFeature(fastify, userId);
      const { id, lineId } = request.params as { id: string; lineId: string };
      const body = request.body as z.infer<typeof UpdateLineBody>;
      const { line } = await findOwnedLine(userId, id, lineId);

      if (line.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "status", message: "Esta linha já foi revisada." },
        ]);
      }

      // The raw text this line's description originally was — whether or
      // not an alias already renamed it before staging (see POST /v1/imports).
      const rawDescription = line.originalDescription ?? line.description;

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
          // suggestedTagNames doubles as "current tag selection" the same
          // way `description` doubles as "current text" — starts out as a
          // suggestion (learned + LLM, see POST /v1/imports), the user's
          // edits here become the final value applied at confirm.
          ...(body.tagNames !== undefined
            ? { suggestedTagNames: body.tagNames }
            : {}),
        },
      });

      // Learn from this edit (§ description-alias): the user renamed the
      // line away from its raw text, so the same raw string pre-fills this
      // friendly name next time — always a suggestion (originalDescription
      // keeps the raw text visible), never a silent takeover of the data.
      if (
        body.description !== undefined &&
        body.description !== rawDescription
      ) {
        await prisma.descriptionAlias.upsert({
          where: {
            userId_rawDescription: { userId, rawDescription },
          },
          create: { userId, rawDescription, friendlyName: body.description },
          update: { friendlyName: body.description },
        });
      }

      // Same idea for tags (§ description-tag-suggestion): every tag the
      // user attached here gets remembered against the raw description, so
      // it's pre-suggested next time this merchant string shows up. Tags
      // the user removed are simply not re-upserted — a stale learned
      // suggestion the user keeps rejecting stays a one-click removal, not
      // a hard error, same tradeoff already accepted for aliases.
      if (body.tagNames !== undefined && body.tagNames.length > 0) {
        const tags = await upsertTags(prisma, userId, body.tagNames);
        await Promise.all(
          tags.map((tag) =>
            prisma.descriptionTagSuggestion.upsert({
              where: {
                userId_rawDescription_tagId: {
                  userId,
                  rawDescription,
                  tagId: tag.id,
                },
              },
              create: { userId, rawDescription, tagId: tag.id },
              update: {},
            }),
          ),
        );
      }

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
      suggestedTagNames: string[];
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
    if (line.suggestedTagNames.length > 0) {
      await setTransactionTags(prisma, userId, tx.id, line.suggestedTagNames);
    }
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
      await requireImportsFeature(fastify, userId);
      const { id, lineId } = request.params as { id: string; lineId: string };
      const parsedBody = ConfirmBody.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        throw VALIDATION_FAILED([
          { field: "resolution", message: "Ação inválida." },
        ]);
      }
      const { resolution } = parsedBody.data;
      const { doc, line } = await findOwnedLine(userId, id, lineId);
      if (line.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "status", message: "Esta linha já foi revisada." },
        ]);
      }
      // "replace" (§6.8, precedente money-flow): a transação já existente
      // que gerou o duplicateOfTxId sai, a extraída entra no lugar dela —
      // ownership revalidado aqui (não confia em duplicateOfTxId sozinho)
      // porque essa coluna é preenchida na extração, sem garantia de que a
      // Transaction referenciada ainda pertence a este usuário (poderia ter
      // sido apagada/movida entre a extração e a revisão).
      if (resolution === "replace") {
        if (!line.duplicateOfTxId) {
          throw VALIDATION_FAILED([
            {
              field: "resolution",
              message: "Esta linha não tem duplicata pra substituir.",
            },
          ]);
        }
        const existing = await prisma.transaction.findFirst({
          where: { id: line.duplicateOfTxId, userId },
        });
        if (!existing) throw NOT_FOUND();
        await prisma.transaction.delete({ where: { id: existing.id } });
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
      await requireImportsFeature(fastify, userId);
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
      await requireImportsFeature(fastify, userId);
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
