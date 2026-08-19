// apps/web/src/routes/timeline/SelectionSummaryBar.tsx
// Transaction-card redesign (2026-08) — a manual "conferência" total for
// whatever the user has selected in the Timeline, fixed at the viewport's
// bottom edge, visible only while there's something selected. This is a
// client-side aggregation of data already on screen, not a `Money` from
// `packages/core` — it isn't an official calculated value, just a
// calculator, so it doesn't go through the core/Breakdown machinery, only
// borrows its visual language (see Breakdown.tsx).
import { Body, Button, Card, Mono, formatMoney } from "@lurem/ui";
import type { TimelineDayDto, TxKind } from "../../auth/types";

export interface SelectionSummaryBarProps {
  days: TimelineDayDto[];
  selectedTransactionIds: Set<string>;
  /** recurringPreview selections — snapshotted at select time, see TimelinePage.tsx's comment on why. */
  selectedRecurringPreviews: Map<string, { kind: TxKind; amountCents: number }>;
  onClear: () => void;
}

interface SelectedLine {
  kind: TxKind;
  amountCents: number;
}

function collectRealLines(
  days: TimelineDayDto[],
  selectedTransactionIds: Set<string>,
): SelectedLine[] {
  if (selectedTransactionIds.size === 0) return [];
  const lines: SelectedLine[] = [];
  for (const day of days) {
    for (const item of day.items) {
      if (
        item.itemType === "transaction" &&
        selectedTransactionIds.has(item.transaction.id)
      ) {
        lines.push({
          kind: item.transaction.kind,
          amountCents: item.transaction.amountCents,
        });
      }
    }
  }
  return lines;
}

export function SelectionSummaryBar({
  days,
  selectedTransactionIds,
  selectedRecurringPreviews,
  onClear,
}: SelectionSummaryBarProps) {
  const lines = [
    ...collectRealLines(days, selectedTransactionIds),
    ...selectedRecurringPreviews.values(),
  ];

  if (lines.length === 0) return null;

  let incomeCents = 0;
  let expenseCents = 0;
  for (const line of lines) {
    // Transfers are never selectable (TransferPairCard doesn't wire
    // selection at all — a separate component, out of this round's scope),
    // so `kind` here is always "income" or "expense" in practice; the
    // fallthrough just keeps the sum honest if that ever changes.
    if (line.kind === "income") incomeCents += line.amountCents;
    else if (line.kind === "expense") expenseCents += line.amountCents;
  }
  const totalCents = incomeCents - expenseCents;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <Card className="flex w-full max-w-[640px] flex-wrap items-center gap-x-5 gap-y-2 shadow-[var(--lr-e2)]">
        <Body as="span" muted className="text-[.8125rem]">
          {lines.length} selecionada{lines.length === 1 ? "" : "s"}
        </Body>
        <Mono
          variant="number"
          tone={totalCents < 0 ? "out" : "default"}
          className="text-[1.25rem]"
        >
          {formatMoney(totalCents)}
        </Mono>
        {incomeCents > 0 ? (
          <span className="flex items-center gap-1.5 text-[.75rem]">
            <Body as="span" muted>
              Receitas
            </Body>
            <Mono variant="number" tone="in">
              {formatMoney(incomeCents)}
            </Mono>
          </span>
        ) : null}
        {expenseCents > 0 ? (
          <span className="flex items-center gap-1.5 text-[.75rem]">
            <Body as="span" muted>
              Despesas
            </Body>
            <Mono variant="number" tone="out">
              {formatMoney(-expenseCents)}
            </Mono>
          </span>
        ) : null}
        <Button
          variant="tertiary"
          size="sm"
          className="ml-auto"
          onClick={onClear}
        >
          Limpar seleção
        </Button>
      </Card>
    </div>
  );
}
