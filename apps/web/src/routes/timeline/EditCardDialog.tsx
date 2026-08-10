// apps/web/src/routes/timeline/EditCardDialog.tsx
// issues.md: clicar no evento "Você adicionou o cartão X" na timeline deve
// abrir a edição deste cartão.
import { Alert, Button, Dialog, Input, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, CardDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";

export function EditCardDialog({
  card,
  accounts,
  onClose,
  onSaved,
}: {
  card: CardDto | null;
  accounts: AccountDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [limit, setLimit] = useState(
    card ? (card.limitCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 1));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 10));
  const [autoDebitAccountId, setAutoDebitAccountId] = useState<string | null>(
    card?.autoDebitAccountId ?? null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<CardDto>(`/cards/${card?.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setFormError(null);
      setFieldErrors({});
      onSaved();
      onClose();
    },
    onError: (error: unknown) => {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível salvar as alterações.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!card) return;
    const limitCents = reaisToCentsPositive(limit);
    if (limitCents === null) {
      setFormError("Informe um limite válido.");
      setFieldErrors({ limitCents: "Informe um limite válido." });
      return;
    }
    const closing = Number(closingDay);
    const due = Number(dueDay);
    if (!Number.isInteger(closing) || closing < 1 || closing > 31) {
      setFormError("Dia de fechamento deve ser entre 1 e 31.");
      setFieldErrors({
        closingDay: "Dia de fechamento deve ser entre 1 e 31.",
      });
      return;
    }
    if (!Number.isInteger(due) || due < 1 || due > 31) {
      setFormError("Dia de vencimento deve ser entre 1 e 31.");
      setFieldErrors({ dueDay: "Dia de vencimento deve ser entre 1 e 31." });
      return;
    }
    updateMutation.mutate({
      name: name.trim() || null,
      limitCents,
      closingDay: closing,
      dueDay: due,
      autoDebitAccountId: autoDebitAccountId ?? null,
    });
  }

  return (
    <Dialog open={card !== null} onClose={onClose} title="Editar cartão">
      <form onSubmit={onSubmit} className="grid gap-3">
        <Input
          label="Apelido (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Input
          money
          label="Limite"
          affix="R$"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          error={fieldErrors.limitCents}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            label="Dia de fechamento"
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            error={fieldErrors.closingDay}
          />
          <Input
            type="number"
            label="Dia de vencimento"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            error={fieldErrors.dueDay}
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
            error={fieldErrors.autoDebitAccountId}
          />
        ) : null}
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
