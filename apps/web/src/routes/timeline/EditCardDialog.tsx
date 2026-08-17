// apps/web/src/routes/timeline/EditCardDialog.tsx
// issues.md: clicar no evento "Você adicionou o cartão X" na timeline deve
// abrir a edição deste cartão.
//
// BACKLOG.md "Arquivar conta/cartão" — see EditAccountDialog.tsx's header
// note for the archive/delete rationale, mirrored here for cards.
import { Alert, Button, Dialog, Input, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, CardDto, InstitutionDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";

export function EditCardDialog({
  card,
  accounts,
  institutions,
  onClose,
  onSaved,
  onArchiveToggled,
  onDeleted,
}: {
  card: CardDto | null;
  accounts: AccountDto[];
  institutions: InstitutionDto[];
  onClose: () => void;
  onSaved: () => void;
  onArchiveToggled?: (archived: boolean) => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [institutionId, setInstitutionId] = useState(
    card?.institutionId ?? null,
  );
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetchJson<CardDto>(`/cards/${card?.id}`, {
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
          : "Não foi possível arquivar o cartão.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<{ ok: true }>(`/cards/${card?.id}`, {
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
          : "Não foi possível excluir o cartão.",
      );
    },
  });

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
    if (!institutionId) {
      setFormError("Escolha uma instituição.");
      return;
    }
    updateMutation.mutate({
      name: name.trim() || null,
      ...(institutionId !== card.institutionId ? { institutionId } : {}),
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
        <Select
          label="Instituição"
          // Inline <img>, not <InstitutionMark>: Select's icon slot is a
          // fixed 24px box (SelectOption.icon contract) and
          // InstitutionMark's smallest size is 28px (sm) — reusing it here
          // would get corners clipped by Select's overflow-hidden wrapper.
          options={institutions.map((i) => ({
            value: i.id,
            label: i.name,
            icon: i.logoUrl ? (
              // biome-ignore lint/a11y/useAltText: src is runtime-bound, alt="" is correct for decorative icon
              <img
                src={i.logoUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : undefined,
          }))}
          value={institutionId}
          onChange={setInstitutionId}
          error={fieldErrors.institutionId}
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
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            {onArchiveToggled && card ? (
              <Button
                type="button"
                variant="secondary"
                loading={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate(!card.archivedAt)}
              >
                {card.archivedAt ? "Desarquivar" : "Arquivar"}
              </Button>
            ) : null}
            {onDeleted && card && !card.hasTransactions ? (
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
