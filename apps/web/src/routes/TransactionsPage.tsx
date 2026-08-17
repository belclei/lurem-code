// apps/web/src/routes/TransactionsPage.tsx
// BACKLOG.md US-3.9 — tela de lançamento (form manual) + lista de transações.
// Registro em poucos campos (valor/tipo/descrição/data/conta-ou-cartão,
// categoria opcional); a lista renderiza via TransactionRow (Épico 2). Regra
// de dinheiro é do backend — esta tela só coleta, mostra e reage aos erros.
import {
  Alert,
  Button,
  DateField,
  EmptyState,
  Input,
  Segmented,
  Select,
  TransactionRow,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  TransactionDto,
  TxKind,
} from "../auth/types";
import { fieldErrorsFrom } from "../lib/field-errors";
import { reaisToCentsPositive } from "../lib/money";

interface CategoryDto {
  id: string;
  name: string;
  kind: TxKind;
}

function todayYmd(): string {
  // Data-calendário de hoje em America/Sao_Paulo (zona canônica do produto,
  // §0) — NUNCA `toISOString()` (UTC), que à noite no Brasil já virou amanhã e
  // faria o lançamento nascer com data futura (fora do saldo/cheque especial).
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

interface CreatePayload {
  kind: TxKind;
  description?: string;
  transactionDate: string;
  amountCents: number;
  accountId?: string;
  creditCardId?: string;
  toAccountId?: string;
  toCreditCardId?: string;
  categoryId?: string;
  isScheduled?: boolean;
}

export function TransactionsPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const queryClient = useQueryClient();

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
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: hasSession,
  });
  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => apiFetchJson<TransactionDto[]>("/transactions"),
    enabled: hasSession,
  });

  const [kind, setKind] = useState<TxKind>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayYmd());
  // origem: `acc:<id>` | `card:<id>`
  const [sourceValue, setSourceValue] = useState<string | null>(null);
  // destino da transferência: `acc:<id>` | `card:<id>`
  const [destValue, setDestValue] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const accounts = accountsQuery.data ?? [];
  const cards = cardsQuery.data ?? [];

  const sourceOptions = useMemo(
    () => [
      ...accounts.map((a) => ({
        value: `acc:${a.id}`,
        label: `${a.institutionName}${a.name ? ` · ${a.name}` : ""}`,
      })),
      ...cards.map((c) => ({
        value: `card:${c.id}`,
        label: `Cartão ${c.institutionName}${c.name ? ` · ${c.name}` : ""}`,
      })),
    ],
    [accounts, cards],
  );

  function resolveTarget(value: string | null): {
    accountId?: string;
    creditCardId?: string;
  } {
    if (!value) return {};
    const [prefix, id] = value.split(":");
    return prefix === "acc" ? { accountId: id } : { creditCardId: id };
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreatePayload) =>
      apiFetchJson<TransactionDto | TransactionDto[]>("/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setDescription("");
      setAmount("");
      setFormError(null);
      setFieldErrors({});
    },
    onError: (err) => {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar a transação.",
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<TransactionDto>(`/transactions/${id}/confirm`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<void>(`/transactions/${id}/skip`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<void>(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  function buildPayload(): CreatePayload | null {
    const cents = reaisToCentsPositive(amount);
    if (kind !== "transfer" && !description.trim()) {
      setFormError("Descreva a transação.");
      setFieldErrors({ description: "Descreva a transação." });
      return null;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      setFieldErrors({ amountCents: "Informe um valor válido." });
      return null;
    }
    if (!sourceValue) {
      setFormError("Escolha a conta ou o cartão.");
      setFieldErrors({ accountId: "Escolha a conta ou o cartão." });
      return null;
    }
    const source = resolveTarget(sourceValue);
    // Vazio (transferência sem descrição) precisa virar `undefined`, não "" —
    // o backend valida `description` com min(1) quando o campo está
    // presente; uma string vazia falharia mesmo sendo tecnicamente opcional.
    const base: CreatePayload = {
      kind,
      description: description.trim() || undefined,
      transactionDate: date,
      amountCents: cents,
      categoryId: categoryId ?? undefined,
    };
    if (kind === "transfer") {
      if (!source.accountId) {
        setFormError("A transferência sai de uma conta.");
        setFieldErrors({ accountId: "A transferência sai de uma conta." });
        return null;
      }
      if (!destValue) {
        setFormError("Escolha o destino da transferência.");
        setFieldErrors({ toAccountId: "Escolha o destino da transferência." });
        return null;
      }
      const dest = resolveTarget(destValue);
      return {
        ...base,
        accountId: source.accountId,
        toAccountId: dest.accountId,
        toCreditCardId: dest.creditCardId,
      };
    }
    return { ...base, ...source };
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const payload = buildPayload();
    if (payload) createMutation.mutate(payload);
  }

  const categoryOptions = (categoriesQuery.data ?? [])
    .filter((c) => (kind === "transfer" ? true : c.kind === kind))
    .map((c) => ({ value: c.id, label: c.name }));

  const transactions = txQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link
          to="/timeline"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Timeline
        </Link>
        <Link
          to="/dashboard"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Dashboard
        </Link>
        <Link
          to="/accounts"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Contas
        </Link>
        <span className="font-semibold text-[var(--lr-text)]">Transações</span>
        <Link
          to="/recurring"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Recorrências
        </Link>
        <Link
          to="/connections"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Conexões
        </Link>
        <Link
          to="/settings"
          className="text-[var(--lr-text-secondary)] hover:underline"
        >
          Configurações
        </Link>
      </nav>

      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Transações
      </h1>

      <form
        onSubmit={onSubmit}
        className="mb-8 grid gap-4 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
      >
        <Segmented
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as TxKind)}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
            { value: "transfer", label: "Transferência" },
          ]}
        />
        <Input
          label={kind === "transfer" ? "Descrição (opcional)" : "Descrição"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mercado, salário, aluguel…"
          error={fieldErrors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Valor"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            money
            affix="R$"
            inputMode="decimal"
            placeholder="0,00"
            error={fieldErrors.amountCents}
          />
          <DateField
            label="Data"
            value={date}
            onChange={setDate}
            error={fieldErrors.transactionDate}
          />
        </div>
        <Select
          label={kind === "transfer" ? "De (conta)" : "Conta ou cartão"}
          options={sourceOptions}
          value={sourceValue}
          onChange={setSourceValue}
          placeholder="Selecione…"
          error={fieldErrors.accountId}
        />
        {kind === "transfer" ? (
          <Select
            label="Para (destino)"
            options={sourceOptions.filter((o) => o.value !== sourceValue)}
            value={destValue}
            onChange={setDestValue}
            placeholder="Selecione…"
            error={fieldErrors.toAccountId}
          />
        ) : (
          <Select
            label="Categoria (opcional)"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Sem categoria"
          />
        )}

        {formError ? (
          <Alert
            variant="error"
            title="Confira os campos"
            description={formError}
          />
        ) : null}

        <div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Registrando…" : "Registrar"}
          </Button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Lançamentos
        </h2>
        {txQuery.isLoading ? (
          <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
        ) : null}
        {!txQuery.isLoading && transactions.length === 0 ? (
          <EmptyState
            title="Nenhuma transação ainda"
            description="Registre seu primeiro lançamento no formulário acima."
          />
        ) : null}
        <div className="flex flex-col gap-2">
          {transactions.map((tx) => {
            const common = {
              description: tx.description,
              date: tx.transactionDate,
              kind: tx.kind,
              amountCents: tx.amountCents,
              source: tx.source,
              categoryName: undefined,
              categoryEmoji: undefined,
              institutionMark: undefined,
              onToggleExpand: undefined,
              expanded: false,
            };
            if (tx.isScheduled) {
              return (
                <TransactionRow
                  key={tx.id}
                  {...common}
                  variant="scheduled"
                  isScheduled={true}
                  onConfirm={() => confirmMutation.mutate(tx.id)}
                  onEdit={() => {}}
                  onDelete={() => deleteMutation.mutate(tx.id)}
                />
              );
            }
            if (tx.kind === "transfer") {
              return (
                <TransactionRow
                  key={tx.id}
                  {...common}
                  variant="transfer"
                  onEdit={() => {}}
                  onDelete={() => deleteMutation.mutate(tx.id)}
                />
              );
            }
            return (
              <TransactionRow
                key={tx.id}
                {...common}
                variant="default"
                onEdit={() => {}}
                onDelete={() => deleteMutation.mutate(tx.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
