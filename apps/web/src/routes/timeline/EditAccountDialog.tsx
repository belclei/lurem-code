// apps/web/src/routes/timeline/EditAccountDialog.tsx
// issues.md: clicar no evento "Você criou a conta X" na timeline deve abrir
// a edição desta conta — sem permitir editar o saldo (não é campo do PATCH
// /v1/accounts/:id — apps/api/src/accounts/routes.ts's UpdateAccountBody —
// então nem precisa ser omitido deliberadamente aqui, o contrato já não aceita).
import { Alert, Button, Dialog, Input } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsOrZero } from "../../lib/money";

export function EditAccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [overdraftLimit, setOverdraftLimit] = useState(
    account
      ? (account.overdraftLimitCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<AccountDto>(`/accounts/${account?.id}`, {
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
    if (!account) return;
    const body: Record<string, unknown> = { name: name.trim() || null };
    if (account.type !== "cash") {
      const overdraft = reaisToCentsOrZero(overdraftLimit);
      if (overdraft === null) {
        setFormError("Informe um limite válido.");
        setFieldErrors({ overdraftLimitCents: "Informe um limite válido." });
        return;
      }
      body.overdraftLimitCents = overdraft;
    }
    updateMutation.mutate(body);
  }

  return (
    <Dialog open={account !== null} onClose={onClose} title="Editar conta">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          label="Apelido (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        {account?.type !== "cash" ? (
          <Input
            money
            label="Limite de cheque especial"
            affix="R$"
            value={overdraftLimit}
            onChange={(e) => setOverdraftLimit(e.target.value)}
            error={fieldErrors.overdraftLimitCents}
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
