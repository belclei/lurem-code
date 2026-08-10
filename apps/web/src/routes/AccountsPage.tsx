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
  formatMoney,
} from "@lurem/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import type { AccountDto, CardDto, InstitutionDto } from "../auth/types";
import { NewAccountDialog } from "./timeline/NewAccountDialog";
import { NewCardDialog } from "./timeline/NewCardDialog";
import { PayInvoiceDialog } from "./timeline/PayInvoiceDialog";

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

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  const invalidateAccounts = () =>
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  const invalidateCards = () =>
    queryClient.invalidateQueries({ queryKey: ["cards"] });

  const accountsById = new Map(
    (accountsQuery.data ?? []).map((account) => [account.id, account]),
  );
  const netBalanceCents = (accountsQuery.data ?? [])
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
            {accountsQuery.data.map((account) => (
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
              />
            ))}
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
            {cardsQuery.data.map((card) => (
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
                onPayNow={() => setPayingCard(card)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
