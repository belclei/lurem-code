// apps/api/src/insights/spend-breakdown.ts
// Part 3 spec — "% de gastos por categoria" / "% de gastos por tag" charts
// on the Análise route. Pure aggregation (no I/O — routes.ts fetches,
// this only groups/sums), same split as timeline/aggregate.ts.
import type { Category, Tag, Transaction, TransactionTag } from "@lurem/db";

export interface SpendBreakdownItem {
  id: string;
  label: string;
  colorToken: string | null;
  amountCents: number;
  percentage: number;
}

const NONE_CATEGORY_ID = "none";

// Denominator is always total expense in the period — for the tag view,
// that means an untagged transaction still counts toward the total, it
// just never appears as a row (there's no "no tag" bucket, unlike category's
// "Sem categoria" — every expense HAS a category, not every expense has a
// tag, so the absence isn't a state worth a row).
function withPercentages(
  amountByKey: Map<string, number>,
  totalCents: number,
  labelOf: (key: string) => { label: string; colorToken: string | null },
): SpendBreakdownItem[] {
  return [...amountByKey.entries()]
    .map(([id, amountCents]) => ({
      id,
      ...labelOf(id),
      amountCents,
      percentage: totalCents > 0 ? (amountCents / totalCents) * 100 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export function computeCategoryBreakdown(
  expenseTransactions: Transaction[],
  categories: Category[],
): SpendBreakdownItem[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const amountByCategoryId = new Map<string, number>();
  let totalCents = 0;
  for (const tx of expenseTransactions) {
    const key = tx.categoryId ?? NONE_CATEGORY_ID;
    amountByCategoryId.set(
      key,
      (amountByCategoryId.get(key) ?? 0) + tx.amountCents,
    );
    totalCents += tx.amountCents;
  }
  return withPercentages(amountByCategoryId, totalCents, (id) =>
    id === NONE_CATEGORY_ID
      ? { label: "Sem categoria", colorToken: null }
      : {
          label: categoryById.get(id)?.name ?? "Categoria removida",
          colorToken: categoryById.get(id)?.colorToken ?? null,
        },
  );
}

export function computeTagBreakdown(
  expenseTransactions: Transaction[],
  transactionTags: TransactionTag[],
  tags: Tag[],
): SpendBreakdownItem[] {
  const amountByTransactionId = new Map(
    expenseTransactions.map((tx) => [tx.id, tx.amountCents]),
  );
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const amountByTagId = new Map<string, number>();
  let totalCents = 0;
  for (const tx of expenseTransactions) totalCents += tx.amountCents;
  // A transaction with N tags contributes its full amount to each of its N
  // tags' totals — tags are non-exclusive by design (§ tags spec), so the
  // sum across tag rows can exceed totalCents. That's expected, not a bug.
  for (const link of transactionTags) {
    const amountCents = amountByTransactionId.get(link.transactionId);
    if (amountCents === undefined) continue;
    amountByTagId.set(
      link.tagId,
      (amountByTagId.get(link.tagId) ?? 0) + amountCents,
    );
  }
  return withPercentages(amountByTagId, totalCents, (id) => ({
    label: tagById.get(id)?.name ?? "",
    colorToken: null,
  }));
}

export function computeSpendBreakdown(
  by: "category" | "tag",
  expenseTransactions: Transaction[],
  extra: {
    categories?: Category[];
    transactionTags?: TransactionTag[];
    tags?: Tag[];
  },
): SpendBreakdownItem[] {
  if (by === "category") {
    return computeCategoryBreakdown(
      expenseTransactions,
      extra.categories ?? [],
    );
  }
  return computeTagBreakdown(
    expenseTransactions,
    extra.transactionTags ?? [],
    extra.tags ?? [],
  );
}
