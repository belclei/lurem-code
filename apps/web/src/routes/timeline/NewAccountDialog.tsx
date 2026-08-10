// apps/web/src/routes/timeline/NewAccountDialog.tsx
// Extracted from AccountsPage.tsx so the Timeline's activation flow can
// open it directly too (issues.md: clicar em "Adicionar contas" deve abrir
// o dialog, não navegar para /accounts).
import { Alert, Button, Dialog, Input, Segmented, Select } from "@lurem/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type { AccountDto, AccountType, InstitutionDto } from "../../auth/types";
import { fieldErrorsFrom } from "../../lib/field-errors";
import { reaisToCentsOrZero } from "../../lib/money";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "Em instituição" },
  { value: "cash", label: "Em espécie" },
];

export function NewAccountDialog({
  open,
  onClose,
  institutions,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  institutions: InstitutionDto[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<AccountType>("checking");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [overdraftLimit, setOverdraftLimit] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<AccountDto>("/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setName("");
      setOpeningBalance("");
      setOverdraftLimit("");
      setInstitutionId(null);
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
          : "Não foi possível criar a conta.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const opening = reaisToCentsOrZero(openingBalance);
    if (opening === null) {
      setFormError("Informe um saldo inicial válido.");
      return;
    }
    if (type !== "cash" && !institutionId) {
      setFormError("Escolha uma instituição.");
      return;
    }
    const overdraft =
      type === "cash" ? 0 : (reaisToCentsOrZero(overdraftLimit) ?? 0);
    createMutation.mutate({
      type,
      institutionId: type === "cash" ? undefined : institutionId,
      name: name.trim() || undefined,
      openingBalanceCents: opening,
      overdraftLimitCents: overdraft,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova conta">
      <form onSubmit={onSubmit} className="grid gap-3">
        <Segmented
          label="Tipo"
          options={ACCOUNT_TYPE_OPTIONS}
          value={type}
          onChange={(value) => {
            const next = value as AccountType;
            setType(next);
            // "Espécie" (cash) tem "Carteira" como apelido default —
            // pré-preenche só se o usuário ainda não digitou nada.
            if (next === "cash" && !name.trim()) setName("Carteira");
          }}
        />
        {type !== "cash" ? (
          <Select
            label="Instituição"
            options={institutions.map((i) => ({ value: i.id, label: i.name }))}
            value={institutionId}
            onChange={setInstitutionId}
            error={fieldErrors.institutionId}
          />
        ) : null}
        <Input
          label="Apelido (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />
        <Input
          money
          label="Saldo inicial"
          affix="R$"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
          error={fieldErrors.openingBalanceCents}
        />
        {type !== "cash" ? (
          <Input
            money
            label="Limite de cheque especial"
            affix="R$"
            value={overdraftLimit}
            onChange={(event) => setOverdraftLimit(event.target.value)}
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
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar conta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
