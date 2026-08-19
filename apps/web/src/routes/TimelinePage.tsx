// apps/web/src/routes/TimelinePage.tsx
// BACKLOG.md US-6.1 — a Timeline é a home real do app (§6.12, ver também
// ARQUITETURA.md §6.11 para o estado vazio/ativação, que chega na Sprint 7).
// Os totais do painel lateral derivam de /v1/accounts e /v1/cards (que já
// expõem isOverLimit/balanceCents/usedCents) — não existe endpoint próprio
// para eles (ver comentário em timeline/routes.ts no backend). issues.md: o
// banner reativo de "conta além do limite" foi removido daqui — o aviso
// agora acontece no momento do cadastro da transação (NewTransactionDialog),
// não como um lembrete permanente no topo da página.
import {
  Alert,
  Body,
  Button,
  Card,
  Mono,
  PlusIcon,
  ProfileIncompleteAlert,
  UploadIcon,
  formatDate,
  formatMoney,
} from "@lurem/ui";
import type { CalendarRange } from "@lurem/ui";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  ImportedDocumentDto,
  InstitutionDto,
  PendingRecurringDto,
  TimelinePageDto,
  TransactionDto,
  TxKind,
} from "../auth/types";
import {
  deserializeDate,
  deserializeDateRange,
  deserializeNullableString,
  deserializeStringSet,
  serializeDate,
  serializeDateRange,
  serializeNullableString,
  serializeStringSet,
  useSessionState,
} from "../lib/sessionState";
import type { DashboardInsights } from "./DashboardView";
import { EditAccountDialog } from "./timeline/EditAccountDialog";
import { EditCardDialog } from "./timeline/EditCardDialog";
import { EditTransactionDialog } from "./timeline/EditTransactionDialog";
import { ImportTransactionsDialog } from "./timeline/ImportTransactionsDialog";
import { NewAccountDialog } from "./timeline/NewAccountDialog";
import { NewCardDialog } from "./timeline/NewCardDialog";
import { NewTransactionDialog } from "./timeline/NewTransactionDialog";
import { SelectionSummaryBar } from "./timeline/SelectionSummaryBar";
import { TimelineActivationSection } from "./timeline/TimelineActivationSection";
import { TimelineFeed } from "./timeline/TimelineFeed";
import { TimelineFilterBar } from "./timeline/TimelineFilterBar";
import { TimelineSummaryAside } from "./timeline/TimelineSummaryAside";
import { greetingAndDate, thisMonthRange, toYmd } from "./timeline/dateHelpers";
import { EVENT_TYPE_GROUPS } from "./timeline/eventTypeGroups";
import type { Chip, ScheduledHandlers } from "./timeline/transactionRowHelpers";
import type { CategoryDto } from "./timeline/types";

export function TimelinePage() {
  const { isBooting, user } = useAuth();
  const navigate = useNavigate();
  const hasSession = !isBooting && Boolean(user);
  // issues.md: filtros sobrevivem a trocar de tela e voltar — só resetam
  // num reload de verdade (sessionStorage, ver lib/sessionState.ts). Os
  // estados de popover aberto/fechado abaixo (periodOpen/eventTypesOpen/
  // categoryOpen/accountsOpen) NÃO são filtro, são só UI transitória —
  // continuam em useState normal, de propósito.
  const [hiddenChipIds, setHiddenChipIds] = useSessionState<Set<string>>(
    "timeline.hiddenChipIds",
    () => new Set(),
    serializeStringSet,
    deserializeStringSet,
  );
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [periodRange, setPeriodRange] = useSessionState<CalendarRange>(
    "timeline.periodRange",
    thisMonthRange,
    serializeDateRange,
    deserializeDateRange,
  );
  const [calendarMonth, setCalendarMonth] = useSessionState<Date>(
    "timeline.calendarMonth",
    () => new Date(),
    serializeDate,
    deserializeDate,
  );
  const [periodOpen, setPeriodOpen] = useState(false);
  const [eventTypesOpen, setEventTypesOpen] = useState(false);
  const [hiddenEventGroupIds, setHiddenEventGroupIds] = useSessionState<
    Set<string>
  >(
    "timeline.hiddenEventGroupIds",
    () => new Set(),
    serializeStringSet,
    deserializeStringSet,
  );
  const [categoryFilterId, setCategoryFilterId] = useSessionState<
    string | null
  >(
    "timeline.categoryFilterId",
    () => null,
    serializeNullableString,
    deserializeNullableString,
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  // Per-row expand/collapse toggle for all transaction variants, keyed by transaction id.
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(
    new Set(),
  );
  // Manual-sum selection (transaction-card redesign, 2026-08): real
  // transactions are looked up live from `days` by id (so editing a
  // selected row's amount updates the sum for free) — recurringPreview
  // items are synthetic (a `recurring.occurrence_upcoming` event payload,
  // not a real `Transaction`, keyed by the event's own id, not a
  // transaction id) and have nothing to look up later, so their
  // kind/amount are snapshotted at the moment of selection instead.
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    Set<string>
  >(new Set());
  const [selectedRecurringPreviews, setSelectedRecurringPreviews] = useState<
    Map<string, { kind: TxKind; amountCents: number }>
  >(new Map());

  function toggleSelectTransaction(id: string) {
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectRecurringPreview(
    id: string,
    kind: TxKind,
    amountCents: number,
  ) {
    setSelectedRecurringPreviews((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { kind, amountCents });
      return next;
    });
  }

  function clearSelection() {
    setSelectedTransactionIds(new Set());
    setSelectedRecurringPreviews(new Map());
  }
  // Task 18/19 (§5b/§5c) — the transaction currently open in
  // EditTransactionDialog; null means closed.
  const [editingTx, setEditingTx] = useState<TransactionDto | null>(null);
  // issues.md: clicar num evento de conta/cartão na timeline abre a edição.
  const [editingAccount, setEditingAccount] = useState<AccountDto | null>(null);
  const [editingCard, setEditingCard] = useState<CardDto | null>(null);
  const queryClient = useQueryClient();

  function toggleExpandTransaction(id: string) {
    setExpandedTransactions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChip(id: string) {
    setHiddenChipIds((prev) => {
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
      // Closes the confirm → RecurringFulfillment loop (see
      // apps/api/src/transactions/routes.ts's recordFulfillment): a series
      // that was showing up under "pendente de aprovação" may not be
      // anymore.
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });
  const skipMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}/skip`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setSelectedTransactionIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      // Selected transaction just got deleted from under the selection —
      // drop it so the summary bar doesn't sum a ghost id.
      setSelectedTransactionIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const closeInvoiceMutation = useMutation({
    mutationFn: (cardId: string) =>
      apiFetchJson(`/cards/${cardId}/close-invoice`, { method: "POST" }),
    onSuccess: () => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["cards"] });
    },
  });

  const payInvoiceMutation = useMutation({
    mutationFn: (cardId: string) => {
      const card = cardsQuery.data?.find((c) => c.id === cardId);
      if (card) {
        setEditingCard(card);
      }
      return Promise.resolve();
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
  const institutionsQuery = useQuery({
    queryKey: ["institutions"],
    queryFn: () => apiFetchJson<InstitutionDto[]>("/institutions"),
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
  // Backlog "fila de pendência de aprovação" (§6.7 item 3, "Confirmar todo
  // mês"): séries isVariableAmount cujo mês corrente já venceu sem
  // confirmação. Banner acima dos filtros, não um item por dia na Timeline —
  // é uma fila de pendências, não um evento histórico do dia em que
  // venceu.
  const pendingRecurringQuery = useQuery({
    queryKey: ["recurring", "pending"],
    queryFn: () =>
      apiFetchJson<PendingRecurringDto[]>("/recurring-transactions/pending"),
    enabled: hasSession,
  });

  // Documentos com transações em staging prontas para análise
  const importsQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiFetchJson<ImportedDocumentDto[]>("/imports"),
    enabled: hasSession,
  });

  // US-4.1 — while any of the 3 items is missing, the Timeline shows
  // activation cards for just the missing ones (never a linear wizard: each
  // card is independent, any order, and the ones already done simply aren't
  // rendered) *alongside* the feed, not instead of it — issues.md: the feed
  // (and "Nova transação", and the sidebar's real numbers) only need ONE of
  // the 3 to exist, not all of them. Loading is treated as "not pending
  // yet" — rendering activation cards for a beat while accounts/cards are
  // still in flight would flash them for a returning user who already has
  // data.
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
  // issues.md: o botão "Nova transação" (e o painel lateral, e o feed) só
  // precisam de UM destino cadastrado (carteira, conta ou cartão) — não
  // esperam os 3 tipos de ativação completarem.
  const hasAnyTransactionDestination =
    accountsLoaded && cardsLoaded && activationDoneCount > 0;

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
    <div className="mx-auto max-w-[1180px] px-4 pt-6 pb-6 sm:px-8 sm:pt-10 lg:px-12 lg:pb-24">
      {!user.hasCompleteProfile ? (
        <div className="mb-6">
          <ProfileIncompleteAlert
            onGoToSettings={() => navigate({ to: "/settings" })}
          />
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px] lg:gap-8">
        {/* overflow-x-hidden scoped to the feed column only, not to any
            ancestor of the sticky balance aside below — see AppLayout.tsx's
            comment on <main> for why that ancestor scoping breaks sticky. */}
        <div className="overflow-x-hidden">
          <div className="mb-7 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="lr-label mb-2">{dateLabel}</p>
              <h1 className="mb-1.5 text-[1.5rem] font-normal tracking-[-0.02em] text-[var(--lr-text)] sm:text-[2rem]">
                {greeting}, {user.name}.
              </h1>
              <Body muted>
                A narrativa do seu dinheiro — causa e efeito, dia a dia.
              </Body>
            </div>
            {/* Hidden during ativação (§6.11): sem conta/cartão cadastrado, os
                selects de destino do NewTransactionDialog (e do
                ImportTransactionsDialog) ficam vazios e o usuário nunca
                consegue submeter o formulário — um beco sem saída em vez de
                um botão utilizável. */}
            {hasAnyTransactionDestination ? (
              <div className="flex gap-2">
                {user.flags["imports.pipeline"] ? (
                  <Button
                    variant="primary"
                    icon={<UploadIcon />}
                    onClick={() => setImportDialogOpen(true)}
                  >
                    Importar transações
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  icon={<PlusIcon />}
                  onClick={() => setTxDialogOpen(true)}
                >
                  Nova transação
                </Button>
              </div>
            ) : null}
          </div>
          <ImportTransactionsDialog
            open={importDialogOpen && Boolean(user.flags["imports.pipeline"])}
            onClose={() => setImportDialogOpen(false)}
            accounts={accountsQuery.data ?? []}
            cards={cardsQuery.data ?? []}
            institutions={institutionsQuery.data ?? []}
            onAccountsCreated={() => {
              accountsQuery.refetch?.();
            }}
            onCardsCreated={() => {
              cardsQuery.refetch?.();
            }}
          />
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
            key={editingTx?.id ?? "edit-tx-closed"}
            tx={editingTx}
            accounts={accountsQuery.data ?? []}
            cards={cardsQuery.data ?? []}
            onClose={() => setEditingTx(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
              queryClient.invalidateQueries({ queryKey: ["cards"] });
              queryClient.invalidateQueries({ queryKey: ["insights"] });
              // Confirm/skip (both possible from this dialog now) can change
              // whether a variable-amount series still counts as "pendente
              // de aprovação" — see apps/api/src/transactions/routes.ts's
              // recordFulfillment.
              queryClient.invalidateQueries({ queryKey: ["recurring"] });
            }}
            onDelete={(t) =>
              deleteMutation.mutate(t.id, {
                onSuccess: () => setEditingTx(null),
              })
            }
            deleting={deleteMutation.isPending}
          />

          {pendingActivation.length > 0 ? (
            <TimelineActivationSection
              activationDoneCount={activationDoneCount}
              hasWallet={hasWallet}
              hasBankAccount={hasBankAccount}
              hasCard={hasCard}
              walletDialogOpen={walletDialogOpen}
              onWalletDialogOpenChange={setWalletDialogOpen}
              onOpenAccountDialog={() => setAccountDialogOpen(true)}
              onOpenCardDialog={() => setCardDialogOpen(true)}
              onWalletCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["accounts"] });
                queryClient.invalidateQueries({ queryKey: ["insights"] });
              }}
            />
          ) : null}

          <NewAccountDialog
            key={accountDialogOpen ? "new-account-open" : "new-account-closed"}
            open={accountDialogOpen}
            onClose={() => setAccountDialogOpen(false)}
            institutions={institutionsQuery.data ?? []}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
              queryClient.invalidateQueries({ queryKey: ["insights"] });
            }}
          />
          <NewCardDialog
            key={cardDialogOpen ? "new-card-open" : "new-card-closed"}
            open={cardDialogOpen}
            onClose={() => setCardDialogOpen(false)}
            institutions={institutionsQuery.data ?? []}
            accounts={accountsQuery.data ?? []}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["cards"] });
              queryClient.invalidateQueries({ queryKey: ["insights"] });
            }}
          />
          <EditAccountDialog
            key={editingAccount?.id ?? "edit-account-closed"}
            account={editingAccount}
            institutions={institutionsQuery.data ?? []}
            onClose={() => setEditingAccount(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
            }}
          />
          <EditCardDialog
            key={editingCard?.id ?? "edit-card-closed"}
            card={editingCard}
            accounts={accountsQuery.data ?? []}
            institutions={institutionsQuery.data ?? []}
            onClose={() => setEditingCard(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["cards"] });
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
            }}
          />

          {(pendingRecurringQuery.data ?? []).length > 0 ? (
            <Card className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Body weight="medium">
                  {pendingRecurringQuery.data?.length === 1
                    ? "1 recorrência pendente de aprovação"
                    : `${pendingRecurringQuery.data?.length} recorrências pendentes de aprovação`}
                </Body>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => navigate({ to: "/recurring" })}
                >
                  Revisar
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {(pendingRecurringQuery.data ?? []).map((p) => (
                  <Alert
                    key={p.id}
                    variant="warning"
                    layout="inline"
                    title={p.description}
                    description={`Vencida em ${formatDate(p.dueDate)} · valor de referência ${formatMoney(p.referenceAmountCents)} · confirme o valor real`}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <TimelineFilterBar
            chips={chips}
            hiddenChipIds={hiddenChipIds}
            onToggleChip={toggleChip}
            hasActiveFilter={hasActiveFilter}
            accountsOpen={accountsOpen}
            onAccountsOpenChange={setAccountsOpen}
            periodRange={periodRange}
            onPeriodRangeChange={setPeriodRange}
            calendarMonth={calendarMonth}
            onCalendarMonthChange={setCalendarMonth}
            periodOpen={periodOpen}
            onPeriodOpenChange={setPeriodOpen}
            hiddenEventGroupIds={hiddenEventGroupIds}
            onToggleEventGroup={toggleEventGroup}
            eventTypesOpen={eventTypesOpen}
            onEventTypesOpenChange={setEventTypesOpen}
            categories={categoriesQuery.data ?? []}
            categoryFilterId={categoryFilterId}
            onCategoryFilterIdChange={setCategoryFilterId}
            categoryOpen={categoryOpen}
            onCategoryOpenChange={setCategoryOpen}
          />

          <TimelineFeed
            isLoading={timelineQuery.isLoading}
            isError={timelineQuery.isError}
            days={days}
            hasNextPage={timelineQuery.hasNextPage}
            isFetchingNextPage={timelineQuery.isFetchingNextPage}
            onFetchNextPage={() => timelineQuery.fetchNextPage()}
            userBirthDate={user.birthDate}
            userCreatedAt={user.createdAt}
            scheduledHandlers={scheduledHandlers}
            categoriesById={categoriesById}
            accountsById={accountsById}
            cardsById={cardsById}
            expandedTransactions={expandedTransactions}
            onToggleExpandTransaction={toggleExpandTransaction}
            selectedTransactionIds={selectedTransactionIds}
            onToggleSelectTransaction={toggleSelectTransaction}
            selectedRecurringPreviewIds={
              new Set(selectedRecurringPreviews.keys())
            }
            onToggleSelectRecurringPreview={toggleSelectRecurringPreview}
            onEditTransaction={(t) => setEditingTx(t)}
            onEditAccount={(a) => setEditingAccount(a)}
            onEditCard={(c) => setEditingCard(c)}
            onManageRecurring={(id) =>
              navigate({ to: "/recurring", search: { edit: id } })
            }
            onCloseInvoice={(cardId) => closeInvoiceMutation.mutate(cardId)}
            onPayInvoice={(cardId) => payInvoiceMutation.mutate(cardId)}
            importedDocuments={importsQuery.data ?? []}
            onNavigateToImport={(id) =>
              navigate({ to: "/imports/$id", params: { id } })
            }
          />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-10">
          <TimelineSummaryAside
            hasPendingActivation={!hasAnyTransactionDestination}
            netBalanceCents={netBalanceCents}
            accounts={accountsQuery.data ?? []}
            totalInvoicesCents={totalInvoicesCents}
            openInvoices={openInvoices}
            insights={insightsQuery.data}
          />
        </aside>
      </div>

      <SelectionSummaryBar
        days={days}
        selectedTransactionIds={selectedTransactionIds}
        selectedRecurringPreviews={selectedRecurringPreviews}
        onClear={clearSelection}
      />
    </div>
  );
}
