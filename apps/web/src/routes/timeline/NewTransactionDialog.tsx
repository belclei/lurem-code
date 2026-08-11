// apps/web/src/routes/timeline/NewTransactionDialog.tsx
import { splitInstallments } from "@lurem/core";
import {
  Alert,
  Button,
  Checkbox,
  DateField,
  Dialog,
  Input,
  Segmented,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  formatMoney,
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
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";
import { todayYmd } from "./dateHelpers";
import type { CategoryDto } from "./types";

interface CreateTxPayload {
  kind: TxKind;
  description?: string;
  transactionDate: string;
  amountCents: number;
  accountId?: string;
  creditCardId?: string;
  toAccountId?: string;
  toCreditCardId?: string;
  categoryId?: string;
  installmentTotal?: number;
  installmentHasInterest?: boolean;
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
  const [installmentEnabled, setInstallmentEnabled] = useState(false);
  const [installmentTotalStr, setInstallmentTotalStr] = useState("2");
  const [installmentHasInterest, setInstallmentHasInterest] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Parcelamento (§6.6) só existe em despesa de cartão de crédito.
  const isCardExpense = kind === "expense" && sourceValue?.startsWith("card:");
  const showInstallments = isCardExpense && installmentEnabled;

  const installmentTotalCount = Number(installmentTotalStr);
  const installmentTotalValid =
    Number.isInteger(installmentTotalCount) && installmentTotalCount >= 2;

  // Pré-visualização da divisão em parcelas — MESMA função (@lurem/core)
  // usada pelo backend ao criar as N linhas, para nunca divergir no
  // arredondamento (resto vai na última parcela). Edições manuais nas
  // linhas abaixo são só de conferência: o envio manda apenas o total e
  // `installmentTotal`, deixando o backend recalcular do jeito padrão —
  // aceitar valores editados linha a linha exigiria mudar a API de criação
  // para receber um array de centavos por parcela, o que não compensa o
  // ganho para este formulário.
  const installmentPreview = useMemo(() => {
    if (!showInstallments || !installmentTotalValid) return null;
    const cents = reaisToCentsPositive(amount);
    if (cents === null) return null;
    return splitInstallments(cents, installmentTotalCount);
  }, [showInstallments, installmentTotalValid, installmentTotalCount, amount]);

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

  // issues.md: o aviso de "vai passar do limite" acontece aqui, no momento
  // do cadastro — não mais como um banner reativo no topo da Timeline
  // depois que a conta já ficou negativa. Só informa, nunca bloqueia (§0:
  // a conta/cartão sempre pode extrapolar).
  const overLimitWarning = useMemo(() => {
    const cents = reaisToCentsPositive(amount);
    if (cents === null || !sourceValue) return null;
    const [prefix, id] = sourceValue.split(":");
    if (prefix === "acc" && (kind === "expense" || kind === "transfer")) {
      const account = accounts.find((a) => a.id === id);
      if (!account) return null;
      const projected = account.balanceCents - cents;
      if (projected >= -account.overdraftLimitCents) return null;
      const overBy = Math.abs(projected) - account.overdraftLimitCents;
      const label = `${account.institutionName}${account.name ? ` - ${account.name}` : ""}`;
      return `Essa transação deixa ${label} ${formatMoney(overBy)} além do limite.`;
    }
    if (prefix === "card" && kind === "expense") {
      const card = cards.find((c) => c.id === id);
      if (!card) return null;
      const projected = card.usedCents + cents;
      if (projected <= card.limitCents) return null;
      const overBy = projected - card.limitCents;
      const label = `${card.institutionName}${card.name ? ` - ${card.name}` : ""}`;
      return `Essa transação deixa a fatura ${label} ${formatMoney(overBy)} além do limite.`;
    }
    return null;
  }, [amount, sourceValue, kind, accounts, cards]);

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
      setInstallmentEnabled(false);
      setInstallmentTotalStr("2");
      setInstallmentHasInterest(false);
      setFormError(null);
      setFieldErrors({});
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      setFieldErrors(fieldErrorsFrom(err));
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
    setFieldErrors({});
    const cents = reaisToCentsPositive(amount);
    // Transferência entre contas próprias dispensa descrição (§6.6) — as
    // outras naturezas continuam exigindo uma.
    if (kind !== "transfer" && !description.trim()) {
      setFormError("Descreva a transação.");
      setFieldErrors({ description: "Descreva a transação." });
      return;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      setFieldErrors({ amountCents: "Informe um valor válido." });
      return;
    }
    if (!sourceValue) {
      setFormError("Escolha a conta ou o cartão.");
      setFieldErrors({ accountId: "Escolha a conta ou o cartão." });
      return;
    }
    if (showInstallments && !installmentTotalValid) {
      setFormError("Informe um número de parcelas válido (mínimo 2).");
      setFieldErrors({
        installmentTotal: "Mínimo de 2 parcelas.",
      });
      return;
    }
    const source = resolveTarget(sourceValue);
    // Vazio (transferência sem descrição) precisa virar `undefined`, não "" —
    // o backend valida `description` com min(1) quando o campo está
    // presente; uma string vazia falharia mesmo sendo tecnicamente opcional.
    const base: CreateTxPayload = {
      kind,
      description: description.trim() || undefined,
      transactionDate: date,
      amountCents: cents,
      categoryId: categoryId ?? undefined,
      ...(showInstallments
        ? {
            installmentTotal: installmentTotalCount,
            installmentHasInterest,
          }
        : {}),
    };
    if (kind === "transfer") {
      if (!source.accountId) {
        setFormError("A transferência sai de uma conta.");
        return;
      }
      if (!destValue) {
        setFormError("Escolha o destino da transferência.");
        setFieldErrors({ toAccountId: "Escolha o destino da transferência." });
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
          error={fieldErrors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={showInstallments ? "Valor total da compra" : "Valor"}
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
        {isCardExpense ? (
          <div className="flex flex-col gap-3">
            <Checkbox
              label="Parcelar"
              checked={installmentEnabled}
              onChange={(e) => setInstallmentEnabled(e.target.checked)}
            />
            {installmentEnabled ? (
              <div className="flex flex-col gap-3 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] p-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    type="number"
                    label="Número de parcelas"
                    value={installmentTotalStr}
                    onChange={(e) => setInstallmentTotalStr(e.target.value)}
                    min={2}
                    step={1}
                    error={fieldErrors.installmentTotal}
                  />
                  <div className="flex items-end pb-2.5">
                    <Checkbox
                      label="Compra com juros"
                      checked={installmentHasInterest}
                      onChange={(e) =>
                        setInstallmentHasInterest(e.target.checked)
                      }
                    />
                  </div>
                </div>
                {installmentPreview ? (
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Parcela</TableHeaderCell>
                        <TableHeaderCell numeric>Valor</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {installmentPreview.map((cents, i) => {
                        // Parcelas não têm id estável — são posicionais (1ª,
                        // 2ª, ...). A chave inclui total/valor de propósito
                        // (não é um índice "puro"): força o Input a remontar
                        // — e repopular seu `defaultValue` não-controlado —
                        // sempre que o usuário recalcula a divisão.
                        const rowKey = `${installmentTotalCount}-${amount}-${i}`;
                        return (
                          <TableRow key={rowKey}>
                            <TableCell>
                              {i + 1}/{installmentPreview.length}
                            </TableCell>
                            <TableCell numeric>
                              {/* Editável só para conferência do usuário — o
                              envio manda o total + `installmentTotal` e
                              deixa o backend recalcular com a mesma regra
                              (@lurem/core#splitInstallments); ver comentário
                              acima de `installmentPreview`. */}
                              <Input
                                label=""
                                aria-label={`Valor da parcela ${i + 1}`}
                                money
                                affix="R$"
                                inputMode="decimal"
                                defaultValue={formatMoney(cents)
                                  .replace("R$", "")
                                  .trim()}
                                className="text-right"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-[.8125rem] text-[var(--lr-label)]">
                    Informe o valor total e o número de parcelas para ver a
                    divisão.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
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
        {overLimitWarning ? (
          <Alert variant="warning" layout="inline" title={overLimitWarning} />
        ) : null}
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
