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
  TimelineDayDto,
  TransactionDto,
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
  expandedInstallments: Set<string>;
  onToggleInstallment: (id: string) => void;
  onEditTransaction: (tx: TransactionDto) => void;
  onEditAccount: (account: AccountDto) => void;
  onEditCard: (card: CardDto) => void;
  /** Backlog "Recorrência integrada ao dialog": clicar numa ocorrência
   * futura ainda não vencida (variant "recurringPreview") abre a gestão da
   * série — pragmatic cut, ver report: um dialog de edição dedicado para
   * "confirmar/alterar o valor" de uma ocorrência que ainda nem existe como
   * Transaction ficou fora deste recorte. */
  onManageRecurring: () => void;
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
  expandedInstallments,
  onToggleInstallment,
  onEditTransaction,
  onEditAccount,
  onEditCard,
  onManageRecurring,
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
          title="Nada por aqui ainda"
          description="Suas contas, cartões e transações vão aparecer aqui conforme você usar o Lurem."
        />
      ) : null}

      <div className="relative flex flex-col gap-6">
        <TimelineRailLine />
        {days.map((day) => {
          const today = isToday(day.date);
          const dow = dayOfWeek(day.date);
          const todayIsBirthday = isBirthday(day.date, userBirthDate);
          const todayIsJoinDay = isJoinDay(day.date, userCreatedAt);

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
                      className="text-[.8125rem] text-[var(--lr-text)]"
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
                          onClick={onManageRecurring}
                        />
                      );
                    }
                    if (item.itemType !== "transaction") {
                      const row = (
                        <TimelineEventRow
                          key={item.id}
                          // DomainEvent.type/payload are untyped String/Json
                          // at the DB boundary (§6 catalog) —
                          // TimelineEventRow owns the actual type union, so
                          // this cast is the API contract's boundary, not a
                          // real type escape.
                          type={item.type as DomainEventType}
                          payload={item.payload}
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
                            onClick={() => onEditTransaction(tx)}
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
                      expandedInstallments,
                      onToggleInstallment,
                      onEditTransaction,
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
