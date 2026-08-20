// apps/api/src/tags/service.ts
// Shared helpers for #tag creation/assignment — used by transactions/routes.ts
// (manual tagging) and imports/routes.ts (learned suggestions on import).
import type { Prisma, PrismaClient, Tag } from "@lurem/db";

export interface TagRef {
  id: string;
  name: string;
}

// Always lowercase: "Uber"/"uber"/"UBER" collapse into one tag instead of
// fragmenting the same real-world label into near-duplicates.
export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase();
}

// Idempotent — creates any name that doesn't exist yet for this user, reuses
// the rest. Order/dedup of `names` is not preserved on purpose (callers only
// need the resulting rows, not positional correspondence).
export async function upsertTags(
  prisma: Prisma.TransactionClient,
  userId: string,
  names: string[],
): Promise<Tag[]> {
  const normalized = [
    ...new Set(names.map(normalizeTagName).filter((n) => n.length > 0)),
  ];
  const tags: Tag[] = [];
  for (const name of normalized) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
    tags.push(tag);
  }
  return tags;
}

// Full replace, not incremental add/remove — the caller (a TagInput's chip
// list) already resolved the final desired set of names.
//
// Sequential deleteMany + createMany instead of a batched prisma.$transaction
// array: this now also gets called from inside imports/routes.ts's
// createRecurringFromSuggestion flow with an interactive transaction client
// (Prisma.TransactionClient), which cannot itself open a nested
// $transaction. The two statements were never more than a convenience batch
// (no read-then-write race to protect against here) — when the caller is
// already inside an outer transaction, this keeps the atomicity guarantee at
// that outer boundary; when called standalone (existing PrismaClient
// callers), the two awaits are still the same two statements, just no longer
// wrapped in their own mini-transaction.
export async function setTransactionTags(
  prisma: Prisma.TransactionClient,
  userId: string,
  transactionId: string,
  names: string[],
): Promise<Tag[]> {
  const tags = await upsertTags(prisma, userId, names);
  await prisma.transactionTag.deleteMany({ where: { transactionId } });
  if (tags.length > 0) {
    await prisma.transactionTag.createMany({
      data: tags.map((t) => ({ transactionId, tagId: t.id })),
    });
  }
  return tags;
}

// Batch lookup for serialization — mirrors the installmentsByGroupId map
// pattern already used by transactions/serialize.ts (pre-fetched once,
// passed down to a pure sync serializer instead of querying per row).
export async function getTagsByTransactionId(
  prisma: PrismaClient,
  transactionIds: string[],
): Promise<Map<string, TagRef[]>> {
  if (transactionIds.length === 0) return new Map();
  const links = await prisma.transactionTag.findMany({
    where: { transactionId: { in: transactionIds } },
  });
  if (links.length === 0) return new Map();
  const tagIds = [...new Set(links.map((l) => l.tagId))];
  const tags = await prisma.tag.findMany({ where: { id: { in: tagIds } } });
  const tagById = new Map(tags.map((t) => [t.id, { id: t.id, name: t.name }]));
  const byTransactionId = new Map<string, TagRef[]>();
  for (const link of links) {
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const list = byTransactionId.get(link.transactionId) ?? [];
    list.push(tag);
    byTransactionId.set(link.transactionId, list);
  }
  return byTransactionId;
}
