// apps/web/src/routes/timeline/EditAccountDialog.tsx
// issues.md: clicar no evento "Você criou a conta X" na timeline deve abrir
// a edição desta conta — sem permitir editar o saldo (não é campo do PATCH
// /v1/accounts/:id — apps/api/src/accounts/routes.ts's UpdateAccountBody —
// então nem precisa ser omitido deliberadamente aqui, o contrato já não aceita).
//
// BACKLOG.md "Arquivar conta/cartão": also the single edit surface for
// archive/desarquivar and (when there's no history) hard delete — reused
// both from here (timeline click) and from AccountsPage (list click), so
// those actions live here once instead of duplicated per caller.
import { Alert, Button, Dialog, Input, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, InstitutionDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsOrZero } from "../../lib/money";

export function EditAccountDialog({
  account,
  institutions,
  onClose,
  onSaved,
  onArchiveToggled,
  onDeleted,
}: {
  account: AccountDto | null;
  institutions: InstitutionDto[];
  onClose: () => void;
  onSaved: () => void;
  /** Called after a successful archive/desarquivar PATCH — absent means the
   * caller doesn't offer the action (kept optional so TimelinePage's
   * existing usage doesn't have to grow this immediately). */
  onArchiveToggled?: (archived: boolean) => void;
  /** Called after a successful DELETE (hard or soft — the caller can't tell
   * which happened from here, only that the row is gone from this dialog's
   * perspective). */
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [institutionId, setInstitutionId] = useState(
    account?.institutionId ?? null,
  );
  const [overdraftLimit, setOverdraftLimit] = useState(
    account
      ? (account.overdraftLimitCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetchJson<AccountDto>(`/accounts/${account?.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      }),
    onSuccess: (_data, archived) => {
      onArchiveToggled?.(archived);
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível arquivar a conta.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<{ ok: true }>(`/accounts/${account?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      onDeleted?.();
      onClose();
    },
    onError: (error: unknown) => {
      setConfirmingDelete(false);
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível excluir a conta.",
      );
    },
  });

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
      if (!institutionId) {
        setFormError("Escolha uma instituição.");
        return;
      }
      if (institutionId !== account.institutionId) {
        body.institutionId = institutionId;
      }
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
          <>
            <Select
              label="Instituição"
              options={institutions.map((i) => ({
                value: i.id,
                label: i.name,
                icon: i.logoAsset ? <img src={i.logoAsset} alt="" className="h-full w-full object-contain" /> : undefined,
              }))}
              value={institutionId}
              onChange={setInstitutionId}
              error={fieldErrors.institutionId}
            />
            <Input
              money
              label="Limite de cheque especial"
              affix="R$"
              value={overdraftLimit}
              onChange={(e) => setOverdraftLimit(e.target.value)}
              error={fieldErrors.overdraftLimitCents}
            />
          </>
        ) : null}
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            {onArchiveToggled && account ? (
              <Button
                type="button"
                variant="secondary"
                loading={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate(!account.archivedAt)}
              >
                {account.archivedAt ? "Desarquivar" : "Arquivar"}
              </Button>
            ) : null}
            {onDeleted && account && !account.hasTransactions ? (
              confirmingDelete ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    Confirmar exclusão
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancelar exclusão
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Excluir
                </Button>
              )
            ) : null}
          </div>
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
