// apps/web/src/routes/timeline/WalletDialog.tsx
import { Alert, Button, Dialog, Input } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsOrZero } from "../../lib/money";

/** US-4.1's simplest case: no institution, so it's a small Dialog instead
 * of a trip to AccountsPage — a wallet is just an amount, not worth a
 * screen change for. Opened from the "Carteira" activation Alert below. */
export function WalletDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (openingBalanceCents: number) =>
      apiFetchJson("/accounts", {
        method: "POST",
        body: JSON.stringify({
          type: "cash",
          name: "Carteira",
          openingBalanceCents,
        }),
      }),
    onSuccess: () => {
      setFormError(null);
      setFieldErrors({});
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível registrar a carteira.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cents = reaisToCentsOrZero(amount);
    if (cents === null) {
      setFormError("Informe um valor válido.");
      setFieldErrors({ openingBalanceCents: "Informe um valor válido." });
      return;
    }
    setFormError(null);
    setFieldErrors({});
    createMutation.mutate(cents);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Carteira">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="text-[.9375rem] text-[var(--lr-text-secondary)]">
          Quanto de dinheiro físico você tem hoje?
        </p>
        <Input
          money
          label="Valor"
          affix="R$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={fieldErrors.openingBalanceCents}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
