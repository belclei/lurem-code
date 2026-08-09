// apps/web/src/routes/TimelinePage.tsx
// BACKLOG.md US-6.1 — a Timeline é a home real do app (§6.12, ver também
// ARQUITETURA.md §6.11 para o estado vazio/ativação, que chega na Sprint 7).
// TimelineAlertBanner e os totais do painel lateral derivam de /v1/accounts e
// /v1/cards (que já expõem isOverLimit/balanceCents/usedCents) — não existe
// endpoint próprio para eles (ver comentário em timeline/routes.ts no backend).
import {
  Alert,
  Body,
  Button,
  Calendar,
  Card,
  CategoryIcon,
  Checkbox,
  DateField,
  Dialog,
  EmptyState,
  EyeIcon,
  Input,
  InstitutionMark,
  Mono,
  PlusIcon,
  Popover,
  ProfileIncompleteAlert,
  Segmented,
  Select,
  Skeleton,
  TimelineAlertBanner,
  TimelineEventRow,
  TransactionRow,
  TransferPairCard,
  formatMoney,
} from "@lurem/ui";
import type {
  AlertedEntity,
  CalendarRange,
  DomainEventType,
  TransferAccount,
} from "@lurem/ui";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  TimelineItemDto,
  TimelinePageDto,
  TransactionDto,
  TxKind,
} from "../auth/types";
import { reaisToCentsOrZero, reaisToCentsPositive } from "../lib/money";
import type { DashboardInsights } from "./DashboardView";
import { EditTransactionDialog } from "./timeline/EditTransactionDialog";
import { NewTransactionDialog } from "./timeline/NewTransactionDialog";
import { TimelineSummaryAside } from "./timeline/TimelineSummaryAside";
import { WalletDialog } from "./timeline/WalletDialog";
import {
  GOOGLE_PLACEHOLDER_BIRTH_DATE,
  dayOfWeek,
  greetingAndDate,
  isBirthdayWindow,
  isThisMonthRange,
  isToday,
  longDayMonth,
  periodLabel,
  shortDate,
  thisMonthRange,
  toYmd,
  todayYmd,
} from "./timeline/dateHelpers";
import type { Chip, ScheduledHandlers } from "./timeline/transactionRowHelpers";
import {
  findTransferPair,
  hasOutTransferPair,
  institutionDotColor,
  resolveTransferParty,
  transactionRowProps,
} from "./timeline/transactionRowHelpers";
import type { CategoryDto } from "./timeline/types";

// ARQUITETURA.md §6.12 item 3: a Timeline filtra por tipo de evento além de
// conta/cartão. `DomainEvent.type` tem 34 valores concretos (TimelineEventRow's
// catalog) — granular demais pra um filtro; agrupados nas mesmas famílias que
// TimelineEventRow já usa pra ícone (eventIcon()), então o rótulo do filtro e o
// ícone que o usuário vê na lista sempre concordam. "transaction" é o
// pseudo-tipo que GET /v1/timeline usa pra alternar as `Transaction` reais
// (que não são DomainEvent) — ver apps/api/src/timeline/routes.ts.
interface EventTypeGroup {
  id: string;
  label: string;
  types: string[];
}

const EVENT_TYPE_GROUPS: EventTypeGroup[] = [
  { id: "transaction", label: "Transações", types: ["transaction"] },
  {
    id: "account_card",
    label: "Contas e cartões",
    types: [
      "account.created",
      "account.updated",
      "account.balance_adjusted",
      "account.over_limit_entered",
      "account.over_limit_cleared",
      "card.created",
      "card.updated",
      "card.over_limit_entered",
      "card.over_limit_cleared",
      "card.invoice_closed",
      "card.invoice_due",
    ],
  },
  {
    id: "scheduled",
    label: "Agendadas",
    types: ["scheduled.confirmed", "scheduled.skipped", "scheduled.deleted"],
  },
  {
    id: "recurring",
    label: "Recorrências",
    types: ["recurring.created", "recurring.paused", "recurring.ended"],
  },
  { id: "import", label: "Importação", types: ["import.completed"] },
  {
    id: "connections",
    label: "Conexões e portador",
    types: [
      "invite.deleted",
      "invite.resent",
      "connection.requested",
      "connection.accepted",
      "connection.rejected",
      "connection.deleted",
      "connection.resent",
      "share.granted",
      "share.permission_changed",
      "share.revoked",
      "portador.assigned",
      "portador.accepted",
      "portador.rejected",
      "portador.settled",
    ],
  },
];

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-32 rounded-[var(--lr-r-md)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
    </div>
  );
}

export function TimelinePage() {
  const { isBooting, user } = useAuth();
  const navigate = useNavigate();
  const hasSession = !isBooting && Boolean(user);
  const [hiddenChipIds, setHiddenChipIds] = useState<Set<string>>(new Set());
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [periodRange, setPeriodRange] = useState<CalendarRange>(() =>
    thisMonthRange(),
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [eventTypesOpen, setEventTypesOpen] = useState(false);
  const [hiddenEventGroupIds, setHiddenEventGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  // Task 10 (§6.12) — per-row "ver todas as parcelas" toggle for the
  // installment TransactionRow variant, keyed by transaction id.
  const [expandedInstallments, setExpandedInstallments] = useState<Set<string>>(
    new Set(),
  );
  // Task 18/19 (§5b/§5c) — the transaction currently open in
  // EditTransactionDialog; null means closed.
  const [editingTx, setEditingTx] = useState<TransactionDto | null>(null);
  const queryClient = useQueryClient();

  function toggleInstallment(id: string) {
    setExpandedInstallments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEventGroup(id: string) {
    setHiddenEventGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // Never let every group be hidden at once — GET /v1/timeline treats an
      // empty `types` CSV the same as "no filter at all" (splitCsv collapses
      // `[]` back to `undefined`), so hiding the last visible group would
      // silently show everything instead of nothing.
      if (prev.size >= EVENT_TYPE_GROUPS.length - 1) return prev;
      next.add(id);
      return next;
    });
  }

  const invalidateTimeline = () =>
    queryClient.invalidateQueries({ queryKey: ["timeline"] });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
  const skipMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}/skip`, { method: "POST" }),
    onSuccess: invalidateTimeline,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
  const scheduledHandlers: ScheduledHandlers = {
    onConfirm: (id) => confirmMutation.mutate(id),
    onSkip: (id) => skipMutation.mutate(id),
    onDelete: (id) => deleteMutation.mutate(id),
  };

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetchJson<AccountDto[]>("/accounts"),
    enabled: hasSession,
  });
  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetchJson<CardDto[]>("/cards"),
    enabled: hasSession,
  });
  // "Disponível hoje" and "Patrimônio total" (§6, aside) both used to
  // render the same ad-hoc netBalanceCents-minus-invoices value — they're
  // distinct figures (IMPLEMENTACAO.md §3.2/§3.5) already computed
  // correctly by the canonical @lurem/core formulas and already exposed by
  // GET /v1/insights/dashboard (used today by DashboardPage.tsx). No API
  // change: this just calls an endpoint that already exists.
  const insightsQuery = useQuery({
    queryKey: ["insights", "dashboard"],
    queryFn: () => apiFetchJson<DashboardInsights>("/insights/dashboard"),
    enabled: hasSession,
  });

  // US-4.1 — while any of the 3 items is missing, the Timeline shows
  // activation cards for just the missing ones instead of the feed (never a
  // linear wizard: each card is independent, any order, and the ones already
  // done simply aren't rendered). Only once all 3 exist does the real
  // day-grouped feed take over. Loading is treated as "not pending yet" —
  // rendering activation cards for a beat while accounts/cards are still in
  // flight would flash them for a returning user who already has data.
  const accountsLoaded = accountsQuery.isSuccess;
  const cardsLoaded = cardsQuery.isSuccess;
  const hasWallet = (accountsQuery.data ?? []).some((a) => a.type === "cash");
  const hasBankAccount = (accountsQuery.data ?? []).some(
    (a) => a.type !== "cash",
  );
  const hasCard = (cardsQuery.data ?? []).length > 0;
  const pendingActivation =
    accountsLoaded && cardsLoaded
      ? (
          [
            !hasWallet && "wallet",
            !hasBankAccount && "accounts",
            !hasCard && "cards",
          ] as const
        ).filter((v): v is "wallet" | "accounts" | "cards" => v !== false)
      : [];
  const activationDoneCount =
    accountsLoaded && cardsLoaded
      ? Number(hasWallet) + Number(hasBankAccount) + Number(hasCard)
      : 0;

  const chips: Chip[] = useMemo(
    () => [
      ...(accountsQuery.data ?? []).map((a) => ({
        id: a.id,
        label: a.name || a.institutionName,
      })),
      ...(cardsQuery.data ?? []).map((c) => ({
        id: c.id,
        label: c.name || c.institutionName,
      })),
    ],
    [accountsQuery.data, cardsQuery.data],
  );

  const visibleAccountIds = (accountsQuery.data ?? [])
    .map((a) => a.id)
    .filter((id) => !hiddenChipIds.has(id));
  const visibleCardIds = (cardsQuery.data ?? [])
    .map((c) => c.id)
    .filter((id) => !hiddenChipIds.has(id));
  const hasActiveFilter = hiddenChipIds.size > 0;

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: hasSession,
  });

  // O(1) lookups for the items render loop below — built once per data
  // change instead of a .find() per row per re-render.
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );
  const accountsById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, a])),
    [accountsQuery.data],
  );
  const cardsById = useMemo(
    () => new Map((cardsQuery.data ?? []).map((c) => [c.id, c])),
    [cardsQuery.data],
  );

  const eventTypesFilterActive = hiddenEventGroupIds.size > 0;
  const visibleEventTypes = eventTypesFilterActive
    ? EVENT_TYPE_GROUPS.filter((g) => !hiddenEventGroupIds.has(g.id)).flatMap(
        (g) => g.types,
      )
    : undefined;
  const eventTypesTriggerLabel = eventTypesFilterActive
    ? `Tipo de evento (${EVENT_TYPE_GROUPS.length - hiddenEventGroupIds.size}/${EVENT_TYPE_GROUPS.length})`
    : "Todos os tipos";
  const categoryFilterLabel = categoryFilterId
    ? ((categoriesQuery.data ?? []).find((c) => c.id === categoryFilterId)
        ?.name ?? "Categoria")
    : "Todas as categorias";

  const timelineQuery = useInfiniteQuery({
    queryKey: [
      "timeline",
      [...hiddenChipIds].sort(),
      visibleEventTypes,
      categoryFilterId,
      periodRange.from ? toYmd(periodRange.from) : null,
      periodRange.to ? toYmd(periodRange.to) : null,
    ],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      if (hasActiveFilter) {
        params.set("accountIds", visibleAccountIds.join(","));
        params.set("cardIds", visibleCardIds.join(","));
      }
      if (visibleEventTypes) params.set("types", visibleEventTypes.join(","));
      if (categoryFilterId) params.set("categoryId", categoryFilterId);
      if (periodRange.from) params.set("from", toYmd(periodRange.from));
      if (periodRange.to) params.set("to", toYmd(periodRange.to));
      const qs = params.toString();
      return apiFetchJson<TimelinePageDto>(`/timeline${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: hasSession,
  });

  const alertedEntities: AlertedEntity[] = [
    ...(accountsQuery.data ?? [])
      .filter((a) => a.isOverLimit)
      .map(
        (a): AlertedEntity => ({
          id: a.id,
          kind: "account",
          institutionName: a.institutionName,
          overAmountCents: Math.abs(a.balanceCents) - a.overdraftLimitCents,
          onConfigure: () => {},
        }),
      ),
    ...(cardsQuery.data ?? [])
      .filter((c) => c.isOverLimit)
      .map(
        (c): AlertedEntity => ({
          id: c.id,
          kind: "card",
          institutionName: c.institutionName,
          usagePercent: (c.usedCents / c.limitCents) * 100,
          onConfigure: () => {},
        }),
      ),
  ];

  const netBalanceCents = (accountsQuery.data ?? []).reduce(
    (sum, a) => sum + a.balanceCents,
    0,
  );
  const openInvoices = (cardsQuery.data ?? []).filter((c) => c.usedCents > 0);
  const totalInvoicesCents = openInvoices.reduce(
    (sum, c) => sum + c.usedCents,
    0,
  );

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  const days = timelineQuery.data?.pages.flatMap((page) => page.days) ?? [];
  const { greeting, dateLabel } = greetingAndDate();

  return (
    <div className="mx-auto max-w-[1180px] px-12 pt-10 pb-24">
      {!user.hasCompleteProfile ? (
        <div className="mb-6">
          <ProfileIncompleteAlert
            onGoToSettings={() => navigate({ to: "/settings" })}
          />
        </div>
      ) : null}

      {alertedEntities.length > 0 ? (
        <div className="mb-6">
          <TimelineAlertBanner entities={alertedEntities} />
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-7 flex items-end justify-between gap-6">
            <div>
              <p className="lr-label mb-2">{dateLabel}</p>
              <h1 className="mb-1.5 text-[2rem] font-normal tracking-[-0.02em] text-[var(--lr-text)]">
                {greeting}, {user.name}.
              </h1>
              <Body muted>
                A narrativa do seu dinheiro — causa e efeito, dia a dia.
              </Body>
            </div>
            {/* Hidden during ativação (§6.11): sem conta/cartão cadastrado, os
                selects de destino do NewTransactionDialog ficam vazios e o
                usuário nunca consegue submeter o formulário — um beco sem
                saída em vez de um botão utilizável. "Importar" (§2) fica de fora:
                o pipeline de importação/revisão ainda não existe no app (design
                doc de conformância, decisão de escopo #1). */}
            {pendingActivation.length === 0 ? (
              <Button
                variant="primary"
                icon={<PlusIcon />}
                onClick={() => setTxDialogOpen(true)}
              >
                Nova transação
              </Button>
            ) : null}
          </div>
          <NewTransactionDialog
            open={txDialogOpen}
            onClose={() => setTxDialogOpen(false)}
            accounts={accountsQuery.data ?? []}
            cards={cardsQuery.data ?? []}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
              queryClient.invalidateQueries({ queryKey: ["insights"] });
            }}
          />
          <EditTransactionDialog
            key={editingTx?.id ?? "closed"}
            tx={editingTx}
            onClose={() => setEditingTx(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
              queryClient.invalidateQueries({ queryKey: ["cards"] });
              queryClient.invalidateQueries({ queryKey: ["insights"] });
            }}
          />

          {pendingActivation.length > 0 ? (
            <div>
              <p className="mb-4 text-[.9375rem] text-[var(--lr-text-secondary)]">
                Sua história ainda vai começar. Cadastre suas contas e cartões —
                na ordem que quiser — e tudo aparece aqui em ordem, com o saldo
                de cada dia.
              </p>
              <section>
                <h2 className="mb-1 text-[.8125rem] font-bold text-[var(--lr-text)]">
                  PRIMEIROS PASSOS
                </h2>
                <p className="mb-4 text-sm text-[var(--lr-text-secondary)]">
                  {activationDoneCount} de 3 concluídos
                </p>
                <div className="flex flex-col gap-2">
                  {hasWallet ? (
                    <Alert
                      variant="success"
                      title="Carteira registrada"
                      description="Seu dinheiro físico já faz parte da Timeline."
                    />
                  ) : (
                    <Alert
                      variant="warning"
                      title="Carteira"
                      description="Quanto de dinheiro físico você tem hoje?"
                      actions={[
                        {
                          label: "Adicionar",
                          onClick: () => setWalletDialogOpen(true),
                        },
                      ]}
                    />
                  )}
                  {hasBankAccount ? (
                    <Alert
                      variant="success"
                      title="Contas registradas"
                      description="Suas contas já aparecem na Timeline."
                    />
                  ) : (
                    <Alert
                      variant="info"
                      title="Contas"
                      description="Adicione as contas de banco onde seu dinheiro vive — corrente ou poupança."
                      actions={[
                        {
                          label: "Adicionar contas",
                          onClick: () => navigate({ to: "/accounts" }),
                        },
                      ]}
                    />
                  )}
                  {hasCard ? (
                    <Alert
                      variant="success"
                      title="Cartões registrados"
                      description="Seus cartões já aparecem na Timeline."
                    />
                  ) : (
                    <Alert
                      variant="info"
                      title="Cartões"
                      description="Adicione seus cartões de crédito — limite, fechamento e vencimento."
                      actions={[
                        {
                          label: "Adicionar cartões",
                          onClick: () => navigate({ to: "/accounts" }),
                        },
                      ]}
                    />
                  )}
                </div>
              </section>
              <WalletDialog
                open={walletDialogOpen}
                onClose={() => setWalletDialogOpen(false)}
                onCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ["accounts"] });
                  queryClient.invalidateQueries({ queryKey: ["insights"] });
                }}
              />
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2.5 border-y border-[var(--lr-border)] py-3">
                <span className="lr-label">MOSTRAR</span>
                {chips.length > 0 ? (
                  <Popover
                    label="Filtrar por conta ou cartão"
                    triggerLabel={
                      hasActiveFilter
                        ? `${chips.length - hiddenChipIds.size} de ${chips.length} contas`
                        : "Todas as contas"
                    }
                    open={accountsOpen}
                    onOpenChange={setAccountsOpen}
                  >
                    <div className="flex w-[260px] flex-col gap-0.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-1.5 shadow-[var(--lr-e2)]">
                      {chips.map((chip) => {
                        const checked = !hiddenChipIds.has(chip.id);
                        // Same guard as the event-type filter above: an empty
                        // accountIds/cardIds CSV collapses back to "no filter"
                        // server-side (splitCsv, apps/api/src/timeline/routes.ts),
                        // so hiding the last visible chip would silently show
                        // everything instead of nothing.
                        const isLastVisible =
                          checked && hiddenChipIds.size >= chips.length - 1;
                        return (
                          <div
                            key={chip.id}
                            className="flex items-center gap-2.5 rounded-[var(--lr-r-sm)] px-2 py-1.5"
                          >
                            <span
                              aria-hidden="true"
                              className={[
                                "h-2 w-2 flex-none rounded-full",
                                institutionDotColor(chip.id),
                              ].join(" ")}
                            />
                            <span className="min-w-0 flex-1 truncate text-[.875rem] text-[var(--lr-text)]">
                              {chip.label}
                            </span>
                            <button
                              type="button"
                              aria-label={
                                isLastVisible
                                  ? `${chip.label} — última conta visível`
                                  : `${checked ? "Ocultar" : "Mostrar"} ${chip.label}`
                              }
                              disabled={isLastVisible}
                              onClick={() =>
                                setHiddenChipIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(chip.id)) next.delete(chip.id);
                                  else next.add(chip.id);
                                  return next;
                                })
                              }
                              className={[
                                "flex h-7 w-7 flex-none items-center justify-center rounded-[var(--lr-r-sm)] [&>svg]:h-4 [&>svg]:w-4",
                                "text-[var(--lr-text-secondary)] hover:bg-[var(--lr-surface-sunken)] hover:text-[var(--lr-text)]",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                              ].join(" ")}
                            >
                              <EyeIcon open={checked} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </Popover>
                ) : null}

                <Popover
                  label="Filtrar por período"
                  triggerLabel={periodLabel(periodRange)}
                  open={periodOpen}
                  onOpenChange={setPeriodOpen}
                >
                  <Calendar
                    label="Selecione o período"
                    mode="range"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selected={periodRange}
                    onSelect={(value) => {
                      const range = value as CalendarRange;
                      setPeriodRange(range);
                      if (range.from && range.to) setPeriodOpen(false);
                    }}
                    footer={
                      <>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setPeriodRange(thisMonthRange());
                            setPeriodOpen(false);
                          }}
                        >
                          Este mês
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setPeriodRange({});
                            setPeriodOpen(false);
                          }}
                        >
                          Limpar
                        </Button>
                      </>
                    }
                  />
                </Popover>

                <Popover
                  label="Filtrar por tipo de evento"
                  triggerLabel={eventTypesTriggerLabel}
                  open={eventTypesOpen}
                  onOpenChange={setEventTypesOpen}
                >
                  <div className="flex w-64 flex-col gap-2.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-3.5 shadow-[var(--lr-e2)]">
                    {EVENT_TYPE_GROUPS.map((group) => {
                      const checked = !hiddenEventGroupIds.has(group.id);
                      const isLastVisible =
                        checked &&
                        hiddenEventGroupIds.size >=
                          EVENT_TYPE_GROUPS.length - 1;
                      return (
                        <Checkbox
                          key={group.id}
                          label={group.label}
                          checked={checked}
                          disabled={isLastVisible}
                          onChange={() => toggleEventGroup(group.id)}
                        />
                      );
                    })}
                  </div>
                </Popover>

                <Popover
                  label="Filtrar por categoria"
                  triggerLabel={categoryFilterLabel}
                  open={categoryOpen}
                  onOpenChange={setCategoryOpen}
                >
                  <div className="flex w-56 flex-col overflow-hidden rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] py-1 shadow-[var(--lr-e2)]">
                    {[
                      {
                        id: null as string | null,
                        label: "Todas as categorias",
                      },
                      ...(categoriesQuery.data ?? []).map((c) => ({
                        id: c.id,
                        label: c.name,
                      })),
                    ].map((option) => (
                      <button
                        key={option.id ?? "__all__"}
                        type="button"
                        onClick={() => {
                          setCategoryFilterId(option.id);
                          setCategoryOpen(false);
                        }}
                        className={[
                          "px-3.5 py-2 text-left text-[.875rem]",
                          // REBRAND (Task 1.3): blue-100/700 -> petrol-100/700.
                          // Not in the task-1.3 brief's original site list (this
                          // usage was missed by the recon grep) but structurally
                          // identical to Select.tsx's "selected item" treatment
                          // (same classes, same purpose: a selected filter
                          // option) — classified as selection-state/Petrol per
                          // DESIGN_SYSTEM.md §1.2, not the info/link/graphite
                          // bucket, despite living in the same file as the
                          // graphite-classified plain link further down.
                          categoryFilterId === option.id
                            ? "bg-[var(--lr-petrol-100)] font-bold text-[var(--lr-text)] dark:bg-[var(--lr-petrol-700)]/30"
                            : "text-[var(--lr-text)] hover:bg-[var(--lr-surface-sunken)]",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Popover>
              </div>

              {timelineQuery.isLoading ? <TimelineSkeleton /> : null}
              {timelineQuery.isError ? (
                <p
                  role="alert"
                  className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]"
                >
                  Não foi possível carregar a timeline.
                </p>
              ) : null}
              {!timelineQuery.isLoading && days.length === 0 ? (
                <EmptyState
                  title="Nada por aqui ainda"
                  description="Suas contas, cartões e transações vão aparecer aqui conforme você usar o Lurem."
                />
              ) : null}

              <div className="flex flex-col gap-6">
                {days.map((day) => {
                  const today = isToday(day.date);
                  const dow = dayOfWeek(day.date);
                  const isBirthday =
                    day.date.slice(5, 10) === user.birthDate.slice(5, 10) &&
                    user.birthDate.slice(0, 10) !==
                      GOOGLE_PLACEHOLDER_BIRTH_DATE;
                  const showBirthdayAlert = isBirthdayWindow(
                    day.date,
                    user.birthDate,
                  );

                  return (
                    <section
                      key={day.date}
                      className={
                        today
                          ? "rounded-[var(--lr-r-md)] bg-[var(--lr-surface-sunken)] p-4"
                          : ""
                      }
                    >
                      {showBirthdayAlert ? (
                        <div className="mb-3">
                          <Alert
                            variant="success"
                            layout="inline"
                            emoji="🥳"
                            title={
                              isBirthday
                                ? "Feliz aniversário!"
                                : `Seu aniversário é dia ${longDayMonth(user.birthDate.slice(0, 10))}!`
                            }
                          />
                        </div>
                      ) : null}
                      <div className="mb-3 flex items-center justify-between gap-2">
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
                        {day.items.map((item) => {
                          if (item.itemType !== "transaction") {
                            return (
                              <TimelineEventRow
                                key={item.id}
                                // DomainEvent.type/payload are untyped String/Json
                                // at the DB boundary (§6 catalog) —
                                // TimelineEventRow owns the actual type union, so
                                // this cast is the API contract's boundary, not a
                                // real type escape.
                                type={item.type as DomainEventType}
                                payload={item.payload}
                                createdAt={item.createdAt}
                              />
                            );
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
                            toggleInstallment,
                            (t) => setEditingTx(t),
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {timelineQuery.hasNextPage ? (
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    loading={timelineQuery.isFetchingNextPage}
                    onClick={() => timelineQuery.fetchNextPage()}
                  >
                    Carregar mais
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-10">
          <TimelineSummaryAside
            hasPendingActivation={pendingActivation.length > 0}
            netBalanceCents={netBalanceCents}
            accounts={accountsQuery.data ?? []}
            totalInvoicesCents={totalInvoicesCents}
            openInvoices={openInvoices}
            insights={insightsQuery.data}
          />
        </aside>
      </div>
    </div>
  );
}
