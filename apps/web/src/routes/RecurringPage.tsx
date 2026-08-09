// apps/web/src/routes/RecurringPage.tsx
// BACKLOG.md US-3.9b — tela de Recorrências: lista as séries (RecurringRow,
// Épico 2), cadastro direto (sem depender de transação) e as ações de gestão
// (pausar/retomar/encerrar/excluir). Edição nunca cascateia sobre ocorrências
// passadas — isso é garantido pelo backend.
import {
  Alert,
  Button,
  Checkbox,
  DateField,
  EmptyState,
  Input,
  RecurringRow,
  Segmented,
  Select,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type { AccountDto, CardDto, RecurringDto } from "../auth/types";

function todayYmd(): string {
  // Data-calendário de hoje em America/Sao_Paulo (zona canônica, §0) — não UTC.
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function reaisToCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

type Status = "active" | "paused" | "ended";

function statusOf(r: RecurringDto): Status {
  if (!r.isActive) return "paused";
  if (r.endDate && r.endDate < todayYmd()) return "ended";
  return "active";
}

/** Próxima data prevista (dia do mês clampado) a partir de hoje. */
function nextOccurrence(dayOfMonth: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const lastThis = new Date(y, m + 1, 0).getDate();
  const dueThis = Math.min(dayOfMonth, lastThis);
  if (now.getDate() <= dueThis) {
    return new Date(y, m, dueThis).toISOString().slice(0, 10);
  }
  const lastNext = new Date(y, m + 2, 0).getDate();
  const dueNext = Math.min(dayOfMonth, lastNext);
  return new Date(y, m + 1, dueNext).toISOString().slice(0, 10);
}

export function RecurringPage() {
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
  const seriesQuery = useQuery({
    queryKey: ["recurring"],
    queryFn: () => apiFetchJson<RecurringDto[]>("/recurring-transactions"),
    enabled: hasSession,
  });

  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("5");
  const [sourceValue, setSourceValue] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayYmd());
  const [isVariable, setIsVariable] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recurring"] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetchJson<RecurringDto>("/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidate();
      setDescription("");
      setAmount("");
      setFormError(null);
    },
    onError: (err) =>
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar a série.",
      ),
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) =>
      apiFetchJson<RecurringDto>(`/recurring-transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<void>(`/recurring-transactions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const cents = reaisToCents(amount);
    const day = Number(dayOfMonth);
    if (!description.trim()) return setFormError("Descreva a série.");
    if (cents === null) return setFormError("Informe um valor válido.");
    if (!Number.isInteger(day) || day < 1 || day > 31)
      return setFormError("Dia do mês entre 1 e 31.");
    if (!sourceValue) return setFormError("Escolha a conta ou o cartão.");
    const [prefix, id] = sourceValue.split(":");
    createMutation.mutate({
      description: description.trim(),
      kind,
      referenceAmountCents: cents,
      dayOfMonth: day,
      startDate,
      isVariableAmount: isVariable,
      ...(prefix === "acc" ? { accountId: id } : { creditCardId: id }),
    });
  }

  const series = seriesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Recorrências
      </h1>

      <form
        onSubmit={onSubmit}
        className="mb-8 grid gap-4 rounded-xl border border-[var(--lr-border)] p-4"
      >
        <Segmented
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as "income" | "expense")}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
          ]}
        />
        <Input
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Aluguel, assinatura, salário…"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Valor de referência"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            money
            affix="R$"
            inputMode="decimal"
            placeholder="0,00"
          />
          <Input
            label="Dia do mês"
            type="number"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
          <DateField label="Início" value={startDate} onChange={setStartDate} />
        </div>
        <Select
          label="Conta ou cartão"
          options={sourceOptions}
          value={sourceValue}
          onChange={setSourceValue}
          placeholder="Selecione…"
        />
        <Checkbox
          checked={isVariable}
          onChange={(e) => setIsVariable(e.target.checked)}
          label="Valor variável (ex.: conta de luz)"
        />

        {formError ? (
          <Alert
            variant="error"
            title="Confira os campos"
            description={formError}
          />
        ) : null}

        <div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando…" : "Criar série"}
          </Button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Séries
        </h2>
        {seriesQuery.isLoading ? (
          <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
        ) : null}
        {!seriesQuery.isLoading && series.length === 0 ? (
          <EmptyState
            title="Nenhuma recorrência ainda"
            description="Cadastre um compromisso fixo no formulário acima."
          />
        ) : null}
        <div className="flex flex-col gap-3">
          {series.map((s) => {
            const status = statusOf(s);
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <RecurringRow
                  description={s.description}
                  referenceAmountCents={s.referenceAmountCents}
                  isVariableAmount={s.isVariableAmount}
                  status={status}
                  nextOccurrenceDate={
                    status === "active"
                      ? nextOccurrence(s.dayOfMonth)
                      : undefined
                  }
                />
                <div className="flex gap-2">
                  {status === "paused" ? (
                    <Button
                      variant="tertiary"
                      onClick={() =>
                        patchMutation.mutate({
                          id: s.id,
                          body: { isActive: true },
                        })
                      }
                    >
                      Retomar
                    </Button>
                  ) : (
                    <Button
                      variant="tertiary"
                      onClick={() =>
                        patchMutation.mutate({
                          id: s.id,
                          body: { isActive: false },
                        })
                      }
                    >
                      Pausar
                    </Button>
                  )}
                  <Button
                    variant="tertiary"
                    onClick={() =>
                      patchMutation.mutate({
                        id: s.id,
                        body: { endDate: todayYmd() },
                      })
                    }
                  >
                    Encerrar
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => deleteMutation.mutate(s.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
