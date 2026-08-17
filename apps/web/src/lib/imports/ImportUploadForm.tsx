// apps/web/src/lib/imports/ImportUploadForm.tsx
// ARQUITETURA.md §6.8 — upload de fatura/extrato. O arquivo nunca sai deste
// componente: extractPdfText/sha256 rodam no navegador, só o texto e o hash
// vão pro POST /v1/imports. Extraído de ImportPage.tsx pra ser reaproveitado
// pelo dialog de import na Timeline (ImportTransactionsDialog) sem duplicar
// a lógica de upload.
import { Alert, Button, Segmented, Select } from "@lurem/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetchJson } from "../../auth/api-client";
import type {
  AccountDto,
  CardDto,
  ImportedDocumentDto,
} from "../../auth/types";
import {
  PdfNoTextLayerError,
  PdfPasswordRequiredError,
  extractPdfText,
  sha256,
} from "./extractPdfText";

const TYPE_OPTIONS = [
  { value: "card_invoice", label: "Fatura de cartão" },
  { value: "account_statement", label: "Extrato de conta" },
];

export function ImportUploadForm({
  accounts,
  cards,
  onImported,
  onCreateCard,
  onCreateAccount,
}: {
  accounts: AccountDto[];
  cards: CardDto[];
  onImported: (documentId: string) => void;
  onCreateCard?: () => void;
  onCreateAccount?: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"card_invoice" | "account_statement">(
    "card_invoice",
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const targetOptions =
    type === "card_invoice"
      ? cards.map((c) => ({
          value: c.id,
          label: `${c.institutionName}${c.name ? ` · ${c.name}` : ""}`,
        }))
      : accounts
          .filter((a) => a.type !== "cash")
          .map((a) => ({
            value: a.id,
            label: `${a.institutionName}${a.name ? ` · ${a.name}` : ""}`,
          }));

  const uploadMutation = useMutation({
    mutationFn: (body: {
      type: string;
      accountId?: string;
      creditCardId?: string;
      contentHash: string;
      text: string;
    }) =>
      apiFetchJson<{
        duplicate: boolean;
        document: ImportedDocumentDto;
      }>("/imports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      onImported(result.document.id);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Falha ao importar.");
    },
  });

  async function handleFile(file: File, filePassword?: string) {
    setError(null);
    setExtracting(true);
    try {
      const [text, contentHash] = await Promise.all([
        extractPdfText(file, filePassword),
        sha256(file),
      ]);
      setNeedsPassword(false);
      setPendingFile(null);
      uploadMutation.mutate({
        type,
        ...(type === "card_invoice"
          ? { creditCardId: targetId ?? undefined }
          : { accountId: targetId ?? undefined }),
        contentHash,
        text,
      });
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        setPendingFile(file);
        setNeedsPassword(true);
      } else if (err instanceof PdfNoTextLayerError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error ? err.message : "Falha ao ler o arquivo.",
        );
      }
    } finally {
      setExtracting(false);
    }
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!targetId) {
      setError(
        type === "card_invoice" ? "Escolha um cartão." : "Escolha uma conta.",
      );
      return;
    }
    handleFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Tipo"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(value) => {
          setType(value as "card_invoice" | "account_statement");
          setTargetId(null);
        }}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            label={type === "card_invoice" ? "Cartão" : "Conta"}
            options={targetOptions}
            value={targetId}
            onChange={setTargetId}
            placeholder="Selecione…"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (type === "card_invoice") {
                onCreateCard?.();
              } else {
                onCreateAccount?.();
              }
            }}
            disabled={!onCreateCard || !onCreateAccount}
          >
            {type === "card_invoice" ? "Novo cartão" : "Nova conta"}
          </Button>
        </div>
      </div>
      {needsPassword ? (
        <div className="flex flex-col gap-2">
          <Alert
            variant="warning"
            layout="inline"
            title="Este PDF está protegido por senha."
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha do PDF"
            className="rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] px-3 py-2 text-[var(--lr-text)]"
          />
          <Button
            type="button"
            loading={extracting}
            onClick={() => pendingFile && handleFile(pendingFile, password)}
          >
            Desbloquear e importar
          </Button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--lr-r-md)] border border-dashed border-[var(--lr-border)] p-6 text-center text-sm text-[var(--lr-text-secondary)] hover:border-[var(--lr-night-300)]">
          {extracting || uploadMutation.isPending
            ? "Processando…"
            : "Clique para escolher um PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={extracting || uploadMutation.isPending}
            onChange={onFileSelected}
          />
        </label>
      )}
      {error ? <Alert variant="error" layout="inline" title={error} /> : null}
    </div>
  );
}
