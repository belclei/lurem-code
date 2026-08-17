// apps/web/src/routes/timeline/NewCardDialog.tsx
// Extracted from AccountsPage.tsx so the Timeline's activation flow can
// open it directly too (issues.md: clicar em "Adicionar cartões" deve abrir
// o dialog, não navegar para /accounts).
import { Alert, Button, Dialog, Input, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, CardDto, InstitutionDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsPositive } from "../../lib/money";

export function NewCardDialog({
  open,
  onClose,
  institutions,
  accounts,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  institutions: InstitutionDto[];
  accounts: AccountDto[];
  onCreated: () => void;
}) {
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");
  const [autoDebitAccountId, setAutoDebitAccountId] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<CardDto>("/cards", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setName("");
      setLimit("");
      setInstitutionId(null);
      setAutoDebitAccountId(null);
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
          : "Não foi possível criar o cartão.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!institutionId) {
      setFormError("Escolha uma instituição.");
      return;
    }
    const limitCents = reaisToCentsPositive(limit);
    if (limitCents === null) {
      setFormError("Informe um limite válido.");
      return;
    }
    const closing = Number(closingDay);
    const due = Number(dueDay);
    if (!Number.isInteger(closing) || closing < 1 || closing > 31) {
      setFormError("Dia de fechamento deve ser entre 1 e 31.");
      return;
    }
    if (!Number.isInteger(due) || due < 1 || due > 31) {
      setFormError("Dia de vencimento deve ser entre 1 e 31.");
      return;
    }
    createMutation.mutate({
      institutionId,
      name: name.trim() || undefined,
      limitCents,
      closingDay: closing,
      dueDay: due,
      autoDebitAccountId: autoDebitAccountId ?? undefined,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo cartão">
      <form onSubmit={onSubmit} className="grid gap-3">
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
          label="Apelido (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />
        <Input
          money
          label="Limite"
          affix="R$"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={fieldErrors.limitCents}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            label="Dia de fechamento"
            value={closingDay}
            onChange={(event) => setClosingDay(event.target.value)}
            error={fieldErrors.closingDay}
          />
          <Input
            type="number"
            label="Dia de vencimento"
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
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
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar cartão
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
