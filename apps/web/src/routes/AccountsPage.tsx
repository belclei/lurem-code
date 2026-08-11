// apps/web/src/routes/AccountsPage.tsx
// BACKLOG.md US-3.3 — tela de contas e cartões. Creation forms added in
// Sprint 7 (US-4.1): this page previously only listed accounts/cards — there
// was no UI anywhere to create one, only the API (covered by its own tests).
// The activation cards on the Timeline's empty state need something real to
// link to; building a second, narrower creation form just for activation
// would duplicate this screen's own job.
import {
  AccountCard,
  Alert,
  Button,
  CreditCardCard,
  Toast,
  formatMoney,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import type { AccountDto, CardDto, InstitutionDto } from "../auth/types";
import { EditAccountDialog } from "./timeline/EditAccountDialog";
import { EditCardDialog } from "./timeline/EditCardDialog";
import { NewAccountDialog } from "./timeline/NewAccountDialog";
import { NewCardDialog } from "./timeline/NewCardDialog";
import { PayInvoiceDialog } from "./timeline/PayInvoiceDialog";

// BACKLOG.md "Arquivar conta/cartão" — undo window (index.html: "toda ação
// destrutiva reversível oferece Desfazer por 8s"), same duration Toast's own
// doc comment cites.
const ARCHIVE_UNDO_MS = 8000;

type ArchiveUndo =
  | { kind: "account"; id: string; label: string }
  | { kind: "card"; id: string; label: string };

function resolveAutoDebitLabel(
  card: CardDto,
  accountsById: Map<string, AccountDto>,
): string | undefined {
  if (!card.autoDebitAccountId) return undefined;
  const account = accountsById.get(card.autoDebitAccountId);
  return account ? account.name || account.institutionName : undefined;
}

export function AccountsPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const queryClient = useQueryClient();
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [payingCard, setPayingCard] = useState<CardDto | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountDto | null>(null);
  const [editingCard, setEditingCard] = useState<CardDto | null>(null);
  const [archiveUndo, setArchiveUndo] = useState<ArchiveUndo | null>(null);
  const archiveUndoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (archiveUndoTimeout.current) clearTimeout(archiveUndoTimeout.current);
    },
    [],
  );

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

  const invalidateAccounts = () =>
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  const invalidateCards = () =>
    queryClient.invalidateQueries({ queryKey: ["cards"] });

  const unarchiveAccountMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<AccountDto>(`/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      }),
    onSuccess: invalidateAccounts,
  });
  const unarchiveCardMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<CardDto>(`/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      }),
    onSuccess: invalidateCards,
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  function scheduleArchiveUndo(undo: ArchiveUndo) {
    if (archiveUndoTimeout.current) clearTimeout(archiveUndoTimeout.current);
    setArchiveUndo(undo);
    archiveUndoTimeout.current = setTimeout(
      () => setArchiveUndo(null),
      ARCHIVE_UNDO_MS,
    );
  }

  function dismissArchiveUndo() {
    if (archiveUndoTimeout.current) clearTimeout(archiveUndoTimeout.current);
    setArchiveUndo(null);
  }

  const accountsById = new Map(
    (accountsQuery.data ?? []).map((account) => [account.id, account]),
  );
  const activeAccounts = (accountsQuery.data ?? []).filter(
    (account) => !account.archivedAt,
  );
  const archivedAccounts = (accountsQuery.data ?? []).filter(
    (account) => account.archivedAt,
  );
  const activeCards = (cardsQuery.data ?? []).filter(
    (card) => !card.archivedAt,
  );
  const archivedCards = (cardsQuery.data ?? []).filter(
    (card) => card.archivedAt,
  );
  const netBalanceCents = activeAccounts
    .filter((account) => account.isActive)
    .reduce((sum, account) => sum + account.balanceCents, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <p className="m-0 mb-2 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
            Onde seu dinheiro está
          </p>
          <h1 className="m-0 text-xl font-bold text-[var(--lr-text)]">
            Contas e cartões
          </h1>
        </div>
        <div className="flex flex-none gap-2">
          <Button type="button" onClick={() => setAccountDialogOpen(true)}>
            Nova conta
          </Button>
          <Button type="button" onClick={() => setCardDialogOpen(true)}>
            Novo cartão
          </Button>
        </div>
      </div>

      <NewAccountDialog
        key={accountDialogOpen ? "open" : "closed"}
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        onCreated={invalidateAccounts}
      />
      <NewCardDialog
        key={cardDialogOpen ? "open" : "closed"}
        open={cardDialogOpen}
        onClose={() => setCardDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        accounts={accountsQuery.data ?? []}
        onCreated={invalidateCards}
      />
      <PayInvoiceDialog
        key={payingCard?.id ?? "closed"}
        card={payingCard}
        accounts={accountsQuery.data ?? []}
        onClose={() => setPayingCard(null)}
        onPaid={() => {
          invalidateAccounts();
          invalidateCards();
        }}
      />
      <EditAccountDialog
        key={editingAccount?.id ?? "closed"}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSaved={invalidateAccounts}
        onArchiveToggled={(archived) => {
          invalidateAccounts();
          if (archived && editingAccount) {
            scheduleArchiveUndo({
              kind: "account",
              id: editingAccount.id,
              label: editingAccount.name || editingAccount.institutionName,
            });
          }
        }}
        onDeleted={invalidateAccounts}
      />
      <EditCardDialog
        key={editingCard?.id ?? "closed"}
        card={editingCard}
        accounts={accountsQuery.data ?? []}
        onClose={() => setEditingCard(null)}
        onSaved={invalidateCards}
        onArchiveToggled={(archived) => {
          invalidateCards();
          if (archived && editingCard) {
            scheduleArchiveUndo({
              kind: "card",
              id: editingCard.id,
              label: editingCard.name || editingCard.institutionName,
            });
          }
        }}
        onDeleted={invalidateCards}
      />

      <section className="mb-9">
        <h2 className="mb-3.5 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
          Contas · saldo líquido {formatMoney(netBalanceCents)}
        </h2>
        {accountsQuery.isLoading ? (
          <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
        ) : null}
        {accountsQuery.isError ? (
          <Alert
            variant="error"
            layout="inline"
            title="Não foi possível carregar suas contas."
          />
        ) : null}
        {accountsQuery.data ? (
          <div className="grid gap-3">
            {activeAccounts.map((account) => (
              <AccountCard
                key={account.id}
                institutionName={account.institutionName}
                logoUrl={account.logoUrl}
                name={account.name}
                type={account.type}
                balanceCents={account.balanceCents}
                overdraftLimitCents={account.overdraftLimitCents}
                isActive={account.isActive}
                overLimit={account.isOverLimit}
                onClick={() => setEditingAccount(account)}
              />
            ))}
          </div>
        ) : null}
        {archivedAccounts.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-3 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
              Arquivados
            </h3>
            <div className="grid gap-3">
              {archivedAccounts.map((account) => (
                <div key={account.id} className="flex flex-col gap-1.5">
                  <div className="opacity-60">
                    <AccountCard
                      institutionName={account.institutionName}
                      logoUrl={account.logoUrl}
                      name={account.name}
                      type={account.type}
                      balanceCents={account.balanceCents}
                      overdraftLimitCents={account.overdraftLimitCents}
                      isActive={account.isActive}
                      overLimit={account.isOverLimit}
                      onClick={() => setEditingAccount(account)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={
                        unarchiveAccountMutation.isPending &&
                        unarchiveAccountMutation.variables === account.id
                      }
                      onClick={() =>
                        unarchiveAccountMutation.mutate(account.id)
                      }
                    >
                      Desarquivar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3.5 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
          Cartões de crédito
        </h2>
        {cardsQuery.isLoading ? (
          <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
        ) : null}
        {cardsQuery.isError ? (
          <Alert
            variant="error"
            layout="inline"
            title="Não foi possível carregar seus cartões."
          />
        ) : null}
        {cardsQuery.data ? (
          <div className="grid gap-3">
            {activeCards.map((card) => (
              <CreditCardCard
                key={card.id}
                institutionName={card.institutionName}
                logoUrl={card.logoUrl}
                name={card.name}
                usedCents={card.usedCents}
                limitCents={card.limitCents}
                invoiceStatus={card.invoiceStatus}
                closingDay={card.closingDay}
                dueDay={card.dueDay}
                autoDebitAccountLabel={resolveAutoDebitLabel(
                  card,
                  accountsById,
                )}
                onClick={() => setEditingCard(card)}
                onPayNow={() => setPayingCard(card)}
              />
            ))}
          </div>
        ) : null}
        {archivedCards.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-3 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
              Arquivados
            </h3>
            <div className="grid gap-3">
              {archivedCards.map((card) => (
                <div key={card.id} className="flex flex-col gap-1.5">
                  <div className="opacity-60">
                    <CreditCardCard
                      institutionName={card.institutionName}
                      logoUrl={card.logoUrl}
                      name={card.name}
                      usedCents={card.usedCents}
                      limitCents={card.limitCents}
                      invoiceStatus={card.invoiceStatus}
                      closingDay={card.closingDay}
                      dueDay={card.dueDay}
                      autoDebitAccountLabel={resolveAutoDebitLabel(
                        card,
                        accountsById,
                      )}
                      onClick={() => setEditingCard(card)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={
                        unarchiveCardMutation.isPending &&
                        unarchiveCardMutation.variables === card.id
                      }
                      onClick={() => unarchiveCardMutation.mutate(card.id)}
                    >
                      Desarquivar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {archiveUndo ? (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-4">
          <Toast
            variant="neutral"
            message={
              archiveUndo.kind === "account"
                ? `${archiveUndo.label} arquivada.`
                : `${archiveUndo.label} arquivado.`
            }
            action={{
              label: "Desfazer",
              onClick: () => {
                if (archiveUndo.kind === "account") {
                  unarchiveAccountMutation.mutate(archiveUndo.id);
                } else {
                  unarchiveCardMutation.mutate(archiveUndo.id);
                }
                dismissArchiveUndo();
              },
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
