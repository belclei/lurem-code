// apps/web/src/routes/RecurringPage.tsx
// BACKLOG.md US-3.9b — tela de Recorrências: lista as séries (RecurringRow,
// Épico 2) e as ações de gestão (editar/pausar/retomar/encerrar/excluir).
// Cadastro NÃO acontece mais aqui (ver nota abaixo) — edição nunca cascateia
// sobre ocorrências passadas — isso é garantido pelo backend.
import {
  Alert,
  Body,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  RecurringRow,
  Select,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type { AccountDto, CardDto, RecurringDto } from "../auth/types";
import { fieldErrorsFrom } from "../lib/field-errors";

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
  // <= (not <): "Encerrar" sets endDate to today, and that end takes effect
  // immediately — a series ended today must show "Encerrada" today, not
  // tomorrow. The old `<` meant a just-ended series still looked "Ativa"
  // for the rest of the day it was ended on.
  if (r.endDate && r.endDate <= todayYmd()) return "ended";
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

function sourceValueOf(r: RecurringDto): string | null {
  if (r.accountId) return `acc:${r.accountId}`;
  if (r.creditCardId) return `card:${r.creditCardId}`;
  return null;
}

/** Editing dialog for an existing series — reuses the fields the old
 * creation form had (description, valor de referência, dia do mês,
 * conta/cartão, "Confirmar todo mês"), now driving PATCH
 * /v1/recurring-transactions/:id instead of POST. `kind` isn't editable:
 * apps/api/src/recurring-transactions/routes.ts's UpdateBody doesn't accept
 * it — changing income↔expense on an established series is a bigger call
 * (it would silently re-sign every future projection) than this pass
 * covers, so the field is simply absent from this form rather than shown
 * disabled — there's no value in displaying a field the user can't act on. */
function EditRecurringDialog({
  series,
  accounts,
  cards,
  onClose,
  onSaved,
}: {
  series: RecurringDto | null;
  accounts: AccountDto[];
  cards: CardDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("5");
  const [sourceValue, setSourceValue] = useState<string | null>(null);
  const [isVariable, setIsVariable] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Same "adjust state during render" pattern as EditTransactionDialog: the
  // dialog stays mounted, toggled via `series`, so a plain useState
  // initializer wouldn't pick up a newly-opened row.
  if (series && series.id !== loadedId) {
    setLoadedId(series.id);
    setDescription(series.description);
    setAmount((series.referenceAmountCents / 100).toFixed(2).replace(".", ","));
    setDayOfMonth(String(series.dayOfMonth));
    setSourceValue(sourceValueOf(series));
    setIsVariable(series.isVariableAmount);
    setFormError(null);
    setFieldErrors({});
  }

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

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<RecurringDto>(`/recurring-transactions/${series?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setFormError(null);
      setFieldErrors({});
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar as alterações.",
      );
    },
  });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!series) return;
    const cents = reaisToCents(amount);
    const day = Number(dayOfMonth);
    if (!description.trim()) {
      setFieldErrors({ description: "Descreva a série." });
      setFormError("Descreva a série.");
      return;
    }
    if (cents === null) {
      setFieldErrors({ referenceAmountCents: "Informe um valor válido." });
      setFormError("Informe um valor válido.");
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      setFieldErrors({ dayOfMonth: "Dia do mês entre 1 e 31." });
      setFormError("Dia do mês entre 1 e 31.");
      return;
    }
    if (!sourceValue) {
      setFieldErrors({ accountId: "Escolha a conta ou o cartão." });
      setFormError("Escolha a conta ou o cartão.");
      return;
    }
    const [prefix, id] = sourceValue.split(":");
    patchMutation.mutate({
      description: description.trim(),
      referenceAmountCents: cents,
      dayOfMonth: day,
      isVariableAmount: isVariable,
      accountId: prefix === "acc" ? id : null,
      creditCardId: prefix === "card" ? id : null,
    });
  }

  return (
    <Dialog open={series !== null} onClose={onClose} title="Editar recorrência">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Aluguel, assinatura, salário…"
          error={fieldErrors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Valor de referência"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            money
            affix="R$"
            inputMode="decimal"
            placeholder="0,00"
            error={fieldErrors.referenceAmountCents}
          />
          <Input
            label="Dia do mês"
            type="number"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            error={fieldErrors.dayOfMonth}
          />
        </div>
        <Select
          label="Conta ou cartão"
          options={sourceOptions}
          value={sourceValue}
          onChange={setSourceValue}
          placeholder="Selecione…"
          error={fieldErrors.accountId}
        />
        <Checkbox
          checked={isVariable}
          onChange={(e) => setIsVariable(e.target.checked)}
          label="Confirmar todo mês (ex.: conta de luz)"
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={patchMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RecurringPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const accounts = accountsQuery.data ?? [];
  const cards = cardsQuery.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recurring"] });

  // Page-level action error: Pausar/Retomar/Encerrar/Excluir all failed
  // completely silently before — no onError, no way to tell a failed click
  // from a slow one. One shared banner is enough for a list of one-off
  // per-row actions; each new attempt clears the previous message.
  const [actionError, setActionError] = useState<string | null>(null);
  const onActionError = (err: unknown) =>
    setActionError(
      err instanceof ApiError
        ? err.message
        : "Não foi possível concluir a ação.",
    );

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
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: onActionError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson<void>(`/recurring-transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: onActionError,
  });

  // Excluir hard-deletes the whole series — arm-then-confirm the same way
  // TransactionRow's "Apagar" does, instead of firing on a single click.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  // Backlog "clicar na ocorrência futura da Timeline abre a edição da série":
  // TimelineFeed navigates here with `?edit=<id>` (TimelinePage.tsx's
  // onManageRecurring). Read once on mount via the plain URL — this page
  // has no other search-param usage, so a dedicated `validateSearch`+
  // `useSearch` round trip would be more machinery than the one field
  // needs; router.tsx still declares `edit` in `validateSearch` so the
  // `navigate({ search })` call on the sending side stays typed.
  const [editingId, setEditingId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("edit")
      : null,
  );

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  const series = seriesQuery.data ?? [];
  const editingSeries = series.find((s) => s.id === editingId) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-xl font-bold text-[var(--lr-text)]">
        Recorrências
      </h1>
      {/* Creation now only happens from the "Recorrente" checkbox in
          NewTransactionDialog (Timeline's "Nova transação") — a series
          always starts from a real first occurrence, this page is purely
          for managing series that already exist. */}
      <p className="mb-6 text-[.875rem] text-[var(--lr-text-secondary)]">
        Para cadastrar uma nova recorrência, marque "Recorrente" ao criar uma
        transação na Timeline.
      </p>

      <EditRecurringDialog
        series={editingSeries}
        accounts={accounts}
        cards={cards}
        onClose={() => setEditingId(null)}
        onSaved={invalidate}
      />

      {actionError ? (
        <Alert
          variant="error"
          layout="inline"
          title={actionError}
          className="mb-4"
        />
      ) : null}

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
            description='Marque "Recorrente" ao criar uma transação na Timeline para começar uma série.'
            actions={[
              {
                label: "Ir para a Timeline",
                onClick: () => navigate({ to: "/timeline" }),
              },
            ]}
          />
        ) : null}
        <div className="flex flex-col gap-3">
          {series.map((s) => {
            const status = statusOf(s);
            const isPatchPending =
              patchMutation.isPending && patchMutation.variables?.id === s.id;
            const isDeletePending =
              deleteMutation.isPending && deleteMutation.variables === s.id;
            const isConfirmingDelete = confirmingDeleteId === s.id;
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <RecurringRow
                  description={s.description}
                  kind={s.kind}
                  referenceAmountCents={s.referenceAmountCents}
                  isVariableAmount={s.isVariableAmount}
                  status={status}
                  nextOccurrenceDate={
                    status === "active"
                      ? nextOccurrence(s.dayOfMonth)
                      : undefined
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="tertiary"
                    disabled={isDeletePending}
                    onClick={() => setEditingId(s.id)}
                  >
                    Editar
                  </Button>
                  {/* Guarded the same way "Encerrar" already is below: an
                      ended series has endDate in the past but isActive is
                      untouched by Encerrar, so statusOf() reads it as
                      "ended" only while isActive stays true. Clicking
                      Pausar here would flip isActive to false, which makes
                      statusOf() report "paused" instead — silently
                      resurrecting the Encerrar button and letting the user
                      push endDate forward again on a series that had
                      already ended. Ended is a terminal state in this UI;
                      neither Pausar nor Retomar make sense on it. */}
                  {status === "ended" ? null : status === "paused" ? (
                    <Button
                      variant="tertiary"
                      loading={isPatchPending}
                      disabled={isDeletePending}
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
                      loading={isPatchPending}
                      disabled={isDeletePending}
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
                  {status !== "ended" ? (
                    <Button
                      variant="tertiary"
                      loading={isPatchPending}
                      disabled={isDeletePending}
                      onClick={() =>
                        patchMutation.mutate({
                          id: s.id,
                          body: { endDate: todayYmd() },
                        })
                      }
                    >
                      Encerrar
                    </Button>
                  ) : null}
                  {isConfirmingDelete ? (
                    <>
                      <Body
                        as="span"
                        className="text-[.8125rem] text-[var(--lr-negative)]"
                      >
                        Excluir esta recorrência?
                      </Body>
                      <Button
                        variant="secondary"
                        disabled={isPatchPending}
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="danger"
                        loading={isDeletePending}
                        disabled={isPatchPending}
                        onClick={() => {
                          setConfirmingDeleteId(null);
                          deleteMutation.mutate(s.id);
                        }}
                      >
                        Sim, excluir
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={isPatchPending}
                      onClick={() => setConfirmingDeleteId(s.id)}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
                {status !== "ended" ? (
                  <Body muted className="text-[.75rem]">
                    Pausar ou encerrar não apaga transações já registradas — só
                    a próxima ocorrência prevista some da Timeline.
                  </Body>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
