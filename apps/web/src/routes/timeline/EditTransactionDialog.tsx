// apps/web/src/routes/timeline/EditTransactionDialog.tsx
import { Alert, Button, DateField, Dialog, Input, Select } from "@lurem/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { TransactionDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";
import type { CategoryDto } from "./types";

interface UpdateTxPayload {
  description?: string;
  categoryId?: string | null;
  transactionDate?: string;
  amountCents?: number;
}

/** Edits description/category/date/amount for an existing transaction —
 * the 4 fields PATCH /v1/transactions/:id accepts
 * (apps/api/src/transactions/routes.ts's UpdateTransactionBody).
 * Kind/account/destination aren't editable here: the backend contract
 * doesn't accept them, and building that (would it move money between
 * accounts retroactively? re-run overdraft checks?) is a bigger product
 * decision than this conformance pass covers. Opened from the "default",
 * "scheduled" and "installment" TransactionRow variants' click/"Editar"
 * — see this task's judgment-call note above.
 *
 * Backlog "recorrência: não consigo confirmar" — when `tx.isScheduled`, this
 * also exposes Confirmar/Pular (POST /transactions/:id/confirm|skip), the
 * same actions already available inline on the "scheduled" TransactionRow
 * variant. Having them here too lets the natural flow be "edit the real
 * amount first, then confirm" in one dialog instead of two separate
 * interactions. */
export function EditTransactionDialog({
  tx,
  onClose,
  onSaved,
  onDelete,
  deleting = false,
}: {
  tx: TransactionDto | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (tx: TransactionDto) => void;
  deleting?: boolean;
}) {
  const [loadedTxId, setLoadedTxId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Resets the form's local state whenever a *different* transaction is
  // opened. The dialog is mounted once for the whole page and toggled
  // via `tx` (not remounted), so plain useState initializers wouldn't
  // pick up a newly-opened row's values — this is React's documented
  // "adjust state during render" pattern for exactly that case, guarded
  // by loadedTxId so it runs once per transaction, not every render.
  if (tx && tx.id !== loadedTxId) {
    setLoadedTxId(tx.id);
    setDescription(tx.description);
    setAmount((tx.amountCents / 100).toFixed(2).replace(".", ","));
    setDate(tx.transactionDate.slice(0, 10));
    setCategoryId(tx.categoryId);
    setFormError(null);
    setFieldErrors({});
  }

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: tx !== null,
  });

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((c) => !tx || tx.kind === "transfer" || c.kind === tx.kind)
        .map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data, tx],
  );

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateTxPayload) =>
      apiFetchJson<TransactionDto>(`/transactions/${tx?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // Confirmar saves whatever's currently in the form first (the natural
  // flow is "editar o valor real → Confirmar", not two separate steps) and
  // only then calls POST .../confirm — a scheduled occurrence's amount is
  // usually just a reference/estimate (§6.7) that needs correcting before
  // it becomes real.
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!tx) return;
      const cents = reaisToCentsPositive(amount);
      if (tx.kind !== "transfer" && !description.trim()) {
        throw new Error("Descreva a transação.");
      }
      if (cents === null) {
        throw new Error("Informe um valor válido.");
      }
      await apiFetchJson<TransactionDto>(`/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || undefined,
          categoryId,
          transactionDate: date,
          amountCents: cents,
        }),
      });
      await apiFetchJson<TransactionDto>(`/transactions/${tx.id}/confirm`, {
        method: "POST",
      });
    },
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
          : err instanceof Error
            ? err.message
            : "Não foi possível confirmar a transação.",
      );
    },
  });

  const skipMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<void>(`/transactions/${tx?.id}/skip`, { method: "POST" }),
    onSuccess: () => {
      setFormError(null);
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível pular esta ocorrência.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!tx) return;
    const cents = reaisToCentsPositive(amount);
    if (tx.kind !== "transfer" && !description.trim()) {
      setFormError("Descreva a transação.");
      setFieldErrors({ description: "Descreva a transação." });
      return;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      setFieldErrors({ amountCents: "Informe um valor válido." });
      return;
    }
    updateMutation.mutate({
      // Vazio (transferência sem descrição) precisa virar `undefined`, não
      // "" — o backend valida `description` com min(1) quando presente.
      description: description.trim() || undefined,
      categoryId,
      transactionDate: date,
      amountCents: cents,
    });
  }

  return (
    <Dialog open={tx !== null} onClose={onClose} title="Editar transação">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          label={tx?.kind === "transfer" ? "Descrição (opcional)" : "Descrição"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          label="Categoria (opcional)"
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
          error={fieldErrors.categoryId}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        {tx?.isScheduled ? (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--lr-border)] pt-4">
            <Button
              type="button"
              variant="secondary"
              loading={skipMutation.isPending}
              onClick={() => skipMutation.mutate()}
            >
              Pular esta vez
            </Button>
            <Button
              type="button"
              loading={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              Confirmar
            </Button>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="danger"
            loading={deleting}
            onClick={() => tx && onDelete(tx)}
          >
            Apagar transação
          </Button>
          <div className="flex gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
