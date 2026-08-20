// apps/web/src/routes/timeline/TimelineFeed.tsx
import {
  Alert,
  Button,
  EmptyState,
  Mono,
  Skeleton,
  TimelineEventRow,
  TransactionRow,
  TransferPairCard,
  formatMoney,
} from "@lurem/ui";
import type { DomainEventType } from "@lurem/ui";
import type {
  AccountDto,
  CardDto,
  ImportedDocumentDto,
  TimelineDayDto,
  TransactionDto,
  TxKind,
} from "../../auth/types";
import { TimelineRailDot, TimelineRailLine } from "./TimelineRail";
import {
  dayOfWeek,
  isBirthday,
  isJoinDay,
  isToday,
  longDayMonth,
} from "./dateHelpers";
import type { ScheduledHandlers } from "./transactionRowHelpers";
import {
  findTransferPair,
  hasOutTransferPair,
  resolveTransferParty,
  transactionRowProps,
} from "./transactionRowHelpers";
import type { CategoryDto } from "./types";

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-32 rounded-[var(--lr-r-md)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
    </div>
  );
}

export interface TimelineFeedProps {
  isLoading: boolean;
  isError: boolean;
  days: TimelineDayDto[];
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  userBirthDate: string;
  userCreatedAt: string;
  scheduledHandlers: ScheduledHandlers;
  categoriesById: Map<string, CategoryDto>;
  accountsById: Map<string, AccountDto>;
  cardsById: Map<string, CardDto>;
  expandedTransactions: Set<string>;
  onToggleExpandTransaction: (id: string) => void;
  selectedTransactionIds: Set<string>;
  onToggleSelectTransaction: (id: string) => void;
  /** True when any Timeline filter (conta/cartão, período, tipo, categoria)
   * is narrower than its default — the empty state's action differs: "limpar
   * filtros" makes sense here, adding an account/card doesn't (there's data,
   * it's just filtered out). */
  hasActiveFilter?: boolean;
  onClearFilters?: () => void;
  selectedRecurringPreviewIds: Set<string>;
  onToggleSelectRecurringPreview: (
    id: string,
    kind: TxKind,
    amountCents: number,
  ) => void;
  onEditTransaction: (tx: TransactionDto) => void;
  onEditAccount: (account: AccountDto) => void;
  onEditCard: (card: CardDto) => void;
  onManageRecurring: (recurringTransactionId: string) => void;
  onCloseInvoice?: (cardId: string) => void;
  onPayInvoice?: (cardId: string) => void;
  importedDocuments: ImportedDocumentDto[];
  onNavigateToImport: (documentId: string) => void;
}

/** US-6.1's day-by-day feed (§6.12) — the Timeline's core concept once
 * activation is done: a loading/error/empty state, then one `<section>` per
 * day (rail dot + optional birthday alert + the day's items), then a
 * "carregar mais" page-in button. All data/mutations are owned by the
 * caller; this component only dispatches each item to the right row/card. */
export function TimelineFeed({
  isLoading,
  isError,
  days,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  userBirthDate,
  userCreatedAt,
  scheduledHandlers,
  categoriesById,
  accountsById,
  cardsById,
  expandedTransactions,
  onToggleExpandTransaction,
  selectedTransactionIds,
  onToggleSelectTransaction,
  hasActiveFilter = false,
  onClearFilters,
  selectedRecurringPreviewIds,
  onToggleSelectRecurringPreview,
  onEditTransaction,
  onEditAccount,
  onEditCard,
  onManageRecurring,
  onCloseInvoice,
  onPayInvoice,
  importedDocuments,
  onNavigateToImport,
}: TimelineFeedProps) {
  return (
    <>
      {isLoading ? <TimelineSkeleton /> : null}
      {isError ? (
        <Alert
          variant="error"
          layout="inline"
          title="Não foi possível carregar a timeline."
        />
      ) : null}
      {!isLoading && days.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilter ? "Nada com esses filtros" : "Nada por aqui ainda"
          }
          description={
            hasActiveFilter
              ? "Nenhum resultado no período/filtro selecionado."
              : "Suas contas, cartões e transações vão aparecer aqui conforme você usar o Lurem."
          }
          actions={
            hasActiveFilter && onClearFilters
              ? [
                  {
                    label: "Limpar filtros",
                    onClick: onClearFilters,
                    variant: "secondary",
                  },
                ]
              : undefined
          }
        />
      ) : null}

      <div className="relative flex flex-col gap-6">
        <TimelineRailLine />
        {days.map((day) => {
          const today = isToday(day.date);
          const dow = dayOfWeek(day.date);
          const todayIsBirthday = isBirthday(day.date, userBirthDate);
          const todayIsJoinDay = isJoinDay(day.date, userCreatedAt);

          // Documentos importados neste dia
          const dayDocuments = importedDocuments.filter((doc) => {
            const docDate = new Date(doc.createdAt).toISOString().split("T")[0];
            const dayDateStr = day.date;
            return docDate === dayDateStr && doc.status === "extracted";
          });

          return (
            <section key={day.date} className="relative">
              <TimelineRailDot today={today} />
              <div
                className={
                  today
                    ? "rounded-[var(--lr-r-md)] bg-[var(--lr-surface-sunken)] p-4 pl-8"
                    : "pl-8"
                }
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-[.8125rem] font-bold text-[var(--lr-text)]">
                    {today ? "HOJE · " : ""}
                    {longDayMonth(day.date)} - {dow}
                  </h2>
                  <div className="flex items-baseline gap-2 rounded-full bg-[var(--lr-surface)] px-3 py-1 text-[.75rem]">
                    <span className="uppercase tracking-widest text-[var(--lr-text-secondary)]">
                      Saldo do dia
                    </span>
                    <Mono
                      variant="number"
                      tone={day.balanceCents < 0 ? "out" : "default"}
                      className="text-[.8125rem]"
                    >
                      {formatMoney(day.balanceCents)}
                    </Mono>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {todayIsBirthday ? (
                    <Alert
                      variant="success"
                      layout="inline"
                      emoji="🎂"
                      title="Feliz aniversário!"
                      description="Que seu ano seja incrível — parabéns por parte de todo o time Lurem! 🎉"
                    />
                  ) : null}
                  {todayIsJoinDay ? (
                    <Alert
                      variant="success"
                      layout="inline"
                      emoji="👋"
                      title="Bem-vindo(a) ao Lurem!"
                      description="Foi hoje que você se juntou a nós — sua jornada financeira começa aqui."
                    />
                  ) : null}
                  {dayDocuments.map((doc) => (
                    <Alert
                      key={doc.id}
                      variant="success"
                      emoji="📄"
                      title={`${doc.type === "card_invoice" ? "Fatura de cartão" : "Extrato de conta"} importado`}
                      actions={[
                        {
                          label: "Revisar transações",
                          onClick: () => onNavigateToImport(doc.id),
                        },
                      ]}
                    />
                  ))}
                  {day.items.map((item) => {
                    // Backlog "Recorrência integrada ao dialog": a próxima
                    // ocorrência ainda não vencida de uma série recorrente
                    // (não é uma Transaction real ainda — só um evento
                    // sintético, ver timeline/routes.ts's
                    // `recurringOccurrenceSource`). Renders through
                    // TransactionRow's "recurringPreview" variant (dashed
                    // card, "Recorrência pendente" badge) instead of
                    // TimelineEventRow, matching TIMELINE.md's existing
                    // "scheduled"/"installment" pattern for
                    // not-yet-real transaction-shaped items.
                    if (
                      item.itemType === "event" &&
                      item.type === "recurring.occurrence_upcoming"
                    ) {
                      const payload = item.payload as {
                        recurringTransactionId: string;
                        description: string;
                        kind: "income" | "expense";
                        amountCents: number;
                      };
                      return (
                        <TransactionRow
                          key={item.id}
                          variant="recurringPreview"
                          description={payload.description}
                          date={item.createdAt}
                          kind={payload.kind}
                          amountCents={payload.amountCents}
                          source="manual"
                          onManage={() =>
                            onManageRecurring(payload.recurringTransactionId)
                          }
                          selected={selectedRecurringPreviewIds.has(item.id)}
                          onToggleSelect={() =>
                            onToggleSelectRecurringPreview(
                              item.id,
                              payload.kind,
                              payload.amountCents,
                            )
                          }
                        />
                      );
                    }
                    if (item.itemType !== "transaction") {
                      const row = (
                        <TimelineEventRow
                          key={item.id}
                          type={item.type as DomainEventType}
                          payload={item.payload}
                          aggregateId={item.aggregateId}
                          onCloseInvoice={onCloseInvoice}
                          onPayInvoice={onPayInvoice}
                        />
                      );
                      // issues.md: clicar num evento de conta/cartão abre a
                      // edição — só quando a conta/cartão ainda existir (não
                      // some por ter sido apagada depois do evento).
                      const editableAccount =
                        item.aggregateType === "Account"
                          ? accountsById.get(item.aggregateId)
                          : undefined;
                      const editableCard =
                        item.aggregateType === "CreditCard"
                          ? cardsById.get(item.aggregateId)
                          : undefined;
                      if (editableAccount) {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="text-left"
                            onClick={() => onEditAccount(editableAccount)}
                          >
                            {row}
                          </button>
                        );
                      }
                      if (editableCard) {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="text-left"
                            onClick={() => onEditCard(editableCard)}
                          >
                            {row}
                          </button>
                        );
                      }
                      return row;
                    }

                    const tx = item.transaction;

                    // Transfer pair: the "out" leg renders a single
                    // TransferPairCard for both legs; the "in" leg (found
                    // below) renders nothing so it isn't shown twice.
                    if (
                      tx.kind === "transfer" &&
                      tx.transferDirection === "out" &&
                      tx.transferPairId
                    ) {
                      const pair = findTransferPair(tx, day.items);
                      if (pair) {
                        return (
                          <TransferPairCard
                            key={tx.id}
                            amountCents={tx.amountCents}
                            description={tx.description || undefined}
                            from={resolveTransferParty(
                              tx,
                              accountsById,
                              cardsById,
                            )}
                            to={resolveTransferParty(
                              pair,
                              accountsById,
                              cardsById,
                            )}
                            expanded={expandedTransactions.has(tx.id)}
                            onToggleExpand={() =>
                              onToggleExpandTransaction(tx.id)
                            }
                            onEdit={() => onEditTransaction(tx)}
                            onDelete={() => scheduledHandlers.onDelete(tx.id)}
                          />
                        );
                      }
                    }
                    if (
                      tx.kind === "transfer" &&
                      tx.transferDirection === "in" &&
                      tx.transferPairId &&
                      hasOutTransferPair(tx, day.items)
                    ) {
                      // Already rendered above via its "out" pair.
                      return null;
                    }

                    return transactionRowProps(
                      tx,
                      scheduledHandlers,
                      categoriesById,
                      accountsById,
                      cardsById,
                      expandedTransactions,
                      onToggleExpandTransaction,
                      onEditTransaction,
                      selectedTransactionIds,
                      onToggleSelectTransaction,
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {hasNextPage ? (
        <div className="mt-6">
          <Button
            variant="secondary"
            loading={isFetchingNextPage}
            onClick={onFetchNextPage}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </>
  );
}
