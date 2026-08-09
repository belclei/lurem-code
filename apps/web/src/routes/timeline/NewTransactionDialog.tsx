// apps/web/src/routes/timeline/NewTransactionDialog.tsx
import {
  Alert,
  Button,
  DateField,
  Dialog,
  Input,
  Segmented,
  Select,
} from "@lurem/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type {
  AccountDto,
  CardDto,
  TransactionDto,
  TxKind,
} from "../../auth/types";
import { reaisToCentsPositive } from "../../lib/money";
import { todayYmd } from "./dateHelpers";
import type { CategoryDto } from "./types";

interface CreateTxPayload {
  kind: TxKind;
  description: string;
  transactionDate: string;
  amountCents: number;
  accountId?: string;
  creditCardId?: string;
  toAccountId?: string;
  toCreditCardId?: string;
  categoryId?: string;
}

export function NewTransactionDialog({
  open,
  onClose,
  accounts,
  cards,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountDto[];
  cards: CardDto[];
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<TxKind>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [sourceValue, setSourceValue] = useState<string | null>(null);
  const [destValue, setDestValue] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
  });

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

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((c) => kind === "transfer" || c.kind === kind)
        .map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data, kind],
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
    mutationFn: (payload: CreateTxPayload) =>
      apiFetchJson<TransactionDto | TransactionDto[]>("/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setDescription("");
      setAmount("");
      setSourceValue(null);
      setDestValue(null);
      setCategoryId(null);
      setFormError(null);
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar a transação.",
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const cents = reaisToCentsPositive(amount);
    // Transferência entre contas próprias dispensa descrição (§6.6) — as
    // outras naturezas continuam exigindo uma.
    if (kind !== "transfer" && !description.trim()) {
      setFormError("Descreva a transação.");
      return;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      return;
    }
    if (!sourceValue) {
      setFormError("Escolha a conta ou o cartão.");
      return;
    }
    const source = resolveTarget(sourceValue);
    const base: CreateTxPayload = {
      kind,
      description: description.trim(),
      transactionDate: date,
      amountCents: cents,
      categoryId: categoryId ?? undefined,
    };
    if (kind === "transfer") {
      if (!source.accountId) {
        setFormError("A transferência sai de uma conta.");
        return;
      }
      if (!destValue) {
        setFormError("Escolha o destino da transferência.");
        return;
      }
      const dest = resolveTarget(destValue);
      createMutation.mutate({
        ...base,
        accountId: source.accountId,
        toAccountId: dest.accountId,
        toCreditCardId: dest.creditCardId,
      });
      return;
    }
    createMutation.mutate({ ...base, ...source });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova transação">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          label={kind === "transfer" ? "De (conta)" : "Conta ou cartão"}
          options={sourceOptions}
          value={sourceValue}
          onChange={setSourceValue}
          placeholder="Selecione…"
        />
        {kind === "transfer" ? (
          <Select
            label="Para (destino)"
            options={sourceOptions.filter((o) => o.value !== sourceValue)}
            value={destValue}
            onChange={setDestValue}
            placeholder="Selecione…"
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
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
