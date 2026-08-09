// apps/web/src/routes/timeline/EditTransactionDialog.tsx
import { Alert, Button, DateField, Dialog, Input, Select } from "@lurem/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { TransactionDto } from "../../auth/types";
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
 * decision than this conformance pass covers. Opened from both the
 * "scheduled" and "installment" TransactionRow variants' "Editar"
 * button (§5b/§5c) — see this task's judgment-call note above. */
export function EditTransactionDialog({
  tx,
  onClose,
  onSaved,
}: {
  tx: TransactionDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loadedTxId, setLoadedTxId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar as alterações.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!tx) return;
    const cents = reaisToCentsPositive(amount);
    if (tx.kind !== "transfer" && !description.trim()) {
      setFormError("Descreva a transação.");
      return;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      return;
    }
    updateMutation.mutate({
      description: description.trim(),
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
          />
          <DateField label="Data" value={date} onChange={setDate} />
        </div>
        <Select
          label="Categoria (opcional)"
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={updateMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
