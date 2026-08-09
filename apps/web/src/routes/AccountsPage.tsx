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
  Dialog,
  Input,
  Segmented,
  Select,
  formatMoney,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  AccountType,
  CardDto,
  InstitutionDto,
} from "../auth/types";
import { reaisToCentsOrZero, reaisToCentsPositive } from "../lib/money";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "Conta bancária" },
  { value: "cash", label: "Espécie" },
];

function resolveAutoDebitLabel(
  card: CardDto,
  accountsById: Map<string, AccountDto>,
): string | undefined {
  if (!card.autoDebitAccountId) return undefined;
  const account = accountsById.get(card.autoDebitAccountId);
  return account ? account.name || account.institutionName : undefined;
}

function NewAccountDialog({
  open,
  onClose,
  institutions,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  institutions: InstitutionDto[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<AccountType>("checking");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [overdraftLimit, setOverdraftLimit] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<AccountDto>("/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setName("");
      setOpeningBalance("");
      setOverdraftLimit("");
      setInstitutionId(null);
      setFormError(null);
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível criar a conta.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const opening = reaisToCentsOrZero(openingBalance);
    if (opening === null) {
      setFormError("Informe um saldo inicial válido.");
      return;
    }
    if (type !== "cash" && !institutionId) {
      setFormError("Escolha uma instituição.");
      return;
    }
    const overdraft =
      type === "cash" ? 0 : (reaisToCentsOrZero(overdraftLimit) ?? 0);
    createMutation.mutate({
      type,
      institutionId: type === "cash" ? undefined : institutionId,
      name: name.trim() || undefined,
      openingBalanceCents: opening,
      overdraftLimitCents: overdraft,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova conta">
      <form onSubmit={onSubmit} className="grid gap-3">
        <Segmented
          label="Tipo"
          options={ACCOUNT_TYPE_OPTIONS}
          value={type}
          onChange={(value) => {
            const next = value as AccountType;
            setType(next);
            // "Espécie" (cash) tem "Carteira" como apelido default —
            // pré-preenche só se o usuário ainda não digitou nada.
            if (next === "cash" && !name.trim()) setName("Carteira");
          }}
        />
        {type !== "cash" ? (
          <Select
            label="Instituição"
            options={institutions.map((i) => ({ value: i.id, label: i.name }))}
            value={institutionId}
            onChange={setInstitutionId}
          />
        ) : null}
        <Input
          label="Apelido (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          money
          label="Saldo inicial"
          affix="R$"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
        />
        {type !== "cash" ? (
          <Input
            money
            label="Limite de cheque especial"
            affix="R$"
            value={overdraftLimit}
            onChange={(event) => setOverdraftLimit(event.target.value)}
          />
        ) : null}
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar conta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewCardDialog({
  open,
  onClose,
  institutions,
  accounts,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  institutions: InstitutionDto[];
  accounts: AccountDto[];
  onCreated: () => void;
}) {
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");
  const [autoDebitAccountId, setAutoDebitAccountId] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<CardDto>("/cards", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setName("");
      setLimit("");
      setInstitutionId(null);
      setAutoDebitAccountId(null);
      setFormError(null);
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível criar o cartão.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!institutionId) {
      setFormError("Escolha uma instituição.");
      return;
    }
    const limitCents = reaisToCentsPositive(limit);
    if (limitCents === null) {
      setFormError("Informe um limite válido.");
      return;
    }
    const closing = Number(closingDay);
    const due = Number(dueDay);
    if (!Number.isInteger(closing) || closing < 1 || closing > 31) {
      setFormError("Dia de fechamento deve ser entre 1 e 31.");
      return;
    }
    if (!Number.isInteger(due) || due < 1 || due > 31) {
      setFormError("Dia de vencimento deve ser entre 1 e 31.");
      return;
    }
    createMutation.mutate({
      institutionId,
      name: name.trim() || undefined,
      limitCents,
      closingDay: closing,
      dueDay: due,
      autoDebitAccountId: autoDebitAccountId ?? undefined,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo cartão">
      <form onSubmit={onSubmit} className="grid gap-3">
        <Select
          label="Instituição"
          options={institutions.map((i) => ({ value: i.id, label: i.name }))}
          value={institutionId}
          onChange={setInstitutionId}
        />
        <Input
          label="Apelido (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          money
          label="Limite"
          affix="R$"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            label="Dia de fechamento"
            value={closingDay}
            onChange={(event) => setClosingDay(event.target.value)}
          />
          <Input
            type="number"
            label="Dia de vencimento"
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
          />
        </div>
        {accounts.length > 0 ? (
          <Select
            label="Débito automático (opcional)"
            options={accounts.map((a) => ({
              value: a.id,
              label: a.name || a.institutionName,
            }))}
            value={autoDebitAccountId}
            onChange={setAutoDebitAccountId}
          />
        ) : null}
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar cartão
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AccountsPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const queryClient = useQueryClient();
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);

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
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        onCreated={invalidateAccounts}
      />
      <NewCardDialog
        open={cardDialogOpen}
        onClose={() => setCardDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        accounts={accountsQuery.data ?? []}
        onCreated={invalidateCards}
      />

      <section className="mb-9">
        <h2 className="mb-3.5 text-[.6875rem] tracking-[.16em] text-[var(--lr-text-secondary)] uppercase">
          Contas · saldo líquido {formatMoney(netBalanceCents)}
        </h2>
        {accountsQuery.isLoading ? (
          <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
        ) : null}
        {accountsQuery.isError ? (
          <p
            role="alert"
            className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]"
          >
            Não foi possível carregar suas contas.
          </p>
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
          <p
            role="alert"
            className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]"
          >
            Não foi possível carregar seus cartões.
          </p>
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
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
