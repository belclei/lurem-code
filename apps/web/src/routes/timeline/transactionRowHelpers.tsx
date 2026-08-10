// apps/web/src/routes/timeline/transactionRowHelpers.ts
import { CategoryIcon, TransactionRow } from "@lurem/ui";
import type { TransferAccount } from "@lurem/ui";
import type {
  AccountDto,
  CardDto,
  TimelineItemDto,
  TransactionDto,
} from "../../auth/types";
import type { CategoryDto } from "./types";

export interface Chip {
  id: string;
  label: string;
}

export interface ScheduledHandlers {
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
}

export function transactionRowProps(
  tx: TransactionDto,
  scheduled: ScheduledHandlers,
  categoriesById: Map<string, CategoryDto>,
  accountsById: Map<string, AccountDto>,
  cardsById: Map<string, CardDto>,
  expandedInstallments: Set<string>,
  onToggleInstallment: (id: string) => void,
  onEditTransaction: (tx: TransactionDto) => void,
) {
  const category = tx.categoryId
    ? categoriesById.get(tx.categoryId)
    : undefined;
  // TIMELINE.md §5.2a's meta is "instituição · categoria" (hour dropped
  // per the design doc's own scope decision #3, not both fields) — this
  // was only ever computing the installment "Parcela N/M" string,
  // leaving every other row's meta as just the bare date. Real gap,
  // fixed here alongside this task's other transactionRowProps changes.
  const institutionName = tx.accountId
    ? accountsById.get(tx.accountId)?.institutionName
    : tx.creditCardId
      ? cardsById.get(tx.creditCardId)?.institutionName
      : undefined;
  const metaParts = [institutionName, category?.name].filter(
    (part): part is string => Boolean(part),
  );
  const common = {
    description: tx.description,
    date: tx.transactionDate,
    kind: tx.kind,
    amountCents: tx.amountCents,
    source: tx.source,
    categoryIcon: category ? <CategoryIcon slug={category.icon} /> : undefined,
    categoryLabel: metaParts.length > 0 ? metaParts.join(" · ") : undefined,
  };
  if (tx.isScheduled) {
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        variant="scheduled"
        onConfirm={() => scheduled.onConfirm(tx.id)}
        onSkip={() => scheduled.onSkip(tx.id)}
        onEdit={() => onEditTransaction(tx)}
        onDelete={() => scheduled.onDelete(tx.id)}
      />
    );
  }
  if (tx.kind === "transfer") {
    // PATCH /v1/transactions/:id atualiza as duas pernas (out+in) juntas e
    // atomicamente quando a transação tem transferPairId — editar por aqui
    // não desincroniza o par.
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        variant="transfer"
        transferToLabel={tx.transferDirection === "out" ? "Saída" : "Entrada"}
        onClick={() => onEditTransaction(tx)}
      />
    );
  }
  if (tx.installmentGroupId && tx.installmentDetails) {
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        // The dedicated badge (installmentNumber/installmentTotal) below
        // already shows "N/M" — dropping the "Parcela N/M" categoryLabel
        // here avoids saying it twice in the same row.
        categoryLabel={undefined}
        variant="installment"
        installment={tx.installmentDetails}
        expanded={expandedInstallments.has(tx.id)}
        onClick={() => onToggleInstallment(tx.id)}
        onViewAllInstallments={() => onToggleInstallment(tx.id)}
        onEdit={() => onEditTransaction(tx)}
      />
    );
  }
  return (
    <TransactionRow
      key={tx.id}
      {...common}
      variant="default"
      onClick={() => onEditTransaction(tx)}
    />
  );
}

/** US-6.1's paired-transfer rendering (§6.12): a transfer is 2 Transaction
 * rows sharing transferPairId (one "out", one "in") — TransferPairCard
 * collapses them into a single card instead of 2 separate TransactionRows.
 * Only searches the same day's items (brief's stated scope): a transfer
 * whose pair lands on a different day — shouldn't happen since both legs
 * share one transactionDate, but the API doesn't guarantee it — falls back
 * to each leg rendering as its own "transfer" variant TransactionRow. */
export function findTransferPair(
  tx: TransactionDto,
  items: TimelineItemDto[],
): TransactionDto | undefined {
  for (const item of items) {
    if (
      item.itemType === "transaction" &&
      item.transaction.id !== tx.id &&
      item.transaction.transferPairId === tx.transferPairId &&
      item.transaction.transferDirection === "in"
    ) {
      return item.transaction;
    }
  }
  return undefined;
}

/** True when `tx` (the "in" leg of a transfer) has a same-day "out" pair —
 * i.e. TransferPairCard already rendered this transfer once via that "out"
 * leg (findTransferPair above), so the "in" leg itself should render
 * nothing rather than show the same transfer a second time. */
export function hasOutTransferPair(
  tx: TransactionDto,
  items: TimelineItemDto[],
): boolean {
  return items.some(
    (item) =>
      item.itemType === "transaction" &&
      item.transaction.id !== tx.id &&
      item.transaction.transferPairId === tx.transferPairId &&
      item.transaction.transferDirection === "out",
  );
}

/** Resolves a transfer leg's own account/card into TransferPairCard's
 * TransferAccount shape. balanceAfterCents is a best-effort stand-in for
 * "balance right after this transfer" — GET /v1/timeline only returns each
 * account/card's *current* balance, not a point-in-time snapshot, and
 * TransferPairCard doesn't render this field today anyway (see Task 8
 * report), so the gap is invisible but real if that changes later. */
export function resolveTransferParty(
  tx: TransactionDto,
  accountsById: Map<string, AccountDto>,
  cardsById: Map<string, CardDto>,
): TransferAccount {
  if (tx.accountId) {
    const account = accountsById.get(tx.accountId);
    return {
      name: account?.name || account?.institutionName || "Conta",
      institution: account?.institutionName ?? "",
      logoUrl: account?.logoUrl,
      balanceAfterCents: account?.balanceCents ?? 0,
      isCash: account?.type === "cash",
    };
  }
  if (tx.creditCardId) {
    const card = cardsById.get(tx.creditCardId);
    return {
      name: card?.name || card?.institutionName || "Cartão",
      institution: card?.institutionName ?? "",
      logoUrl: card?.logoUrl,
      balanceAfterCents: card ? -card.usedCents : 0,
    };
  }
  return { name: "Conta", institution: "", balanceAfterCents: 0 };
}

// §3's accounts popover row: "ponto colorido da instituição" — neither
// AccountDto/CardDto nor InstitutionDto carries a color field, and no
// per-institution color table exists anywhere in the app (verified: no
// hit for institutionColor/brandColor/hashColor). The dot is purely a
// "these are different institutions" visual cue, not a source of truth
// for any institution's real brand color, so a stable hash into the
// existing brand palette is enough. Judgment call — flagged in the
// plan's report.
const ACCOUNT_DOT_HUES = [
  "bg-[var(--lr-petrol-600)]",
  "bg-[var(--lr-gold-600)]",
  "bg-[var(--lr-terracota-600)]",
  "bg-[var(--lr-graphite-600)]",
];

export function institutionDotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ACCOUNT_DOT_HUES[Math.abs(hash) % ACCOUNT_DOT_HUES.length] as string;
}
