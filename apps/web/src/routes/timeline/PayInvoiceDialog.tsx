// apps/web/src/routes/timeline/PayInvoiceDialog.tsx
// issues.md: "Pagar agora" — a fatura é paga como uma transferência
// conta→cartão (transactions/routes.ts já suporta toCreditCardId; nenhuma
// tabela de pagamento separada existe — ver nota em packages/core/src/invoice.ts).
import { Alert, Button, Dialog, Input, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, CardDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";
import { todayYmd } from "./dateHelpers";

export function PayInvoiceDialog({
  card,
  accounts,
  onClose,
  onPaid,
}: {
  card: CardDto | null;
  accounts: AccountDto[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const open = card !== null;
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState(
    card ? (card.usedCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.institutionName}${a.name ? ` · ${a.name}` : ""}`,
  }));

  const payMutation = useMutation({
    mutationFn: (payload: {
      accountId: string;
      toCreditCardId: string;
      amountCents: number;
    }) =>
      apiFetchJson("/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transfer",
          transactionDate: todayYmd(),
          accountId: payload.accountId,
          toCreditCardId: payload.toCreditCardId,
          amountCents: payload.amountCents,
        }),
      }),
    onSuccess: () => {
      setFormError(null);
      setFieldErrors({});
      onPaid();
      onClose();
    },
    onError: (err: unknown) => {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar o pagamento.",
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!card) return;
    const cents = reaisToCentsPositive(amount);
    if (cents === null) {
      setFormError("Informe um valor válido.");
      setFieldErrors({ amountCents: "Informe um valor válido." });
      return;
    }
    if (!accountId) {
      setFormError("Escolha a conta de origem.");
      setFieldErrors({ accountId: "Escolha a conta de origem." });
      return;
    }
    payMutation.mutate({
      accountId,
      toCreditCardId: card.id,
      amountCents: cents,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        card
          ? `Pagar fatura · ${card.institutionName}${card.name ? ` - ${card.name}` : ""}`
          : "Pagar fatura"
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Select
          label="Pagar com"
          options={accountOptions}
          value={accountId}
          onChange={setAccountId}
          placeholder="Selecione a conta…"
          error={fieldErrors.accountId}
        />
        <Input
          label="Valor"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          money
          affix="R$"
          inputMode="decimal"
          error={fieldErrors.amountCents}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={payMutation.isPending}>
            Pagar agora
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
