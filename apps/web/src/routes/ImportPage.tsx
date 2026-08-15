// apps/web/src/routes/ImportPage.tsx
// ARQUITETURA.md §6.8 — upload de fatura/extrato. O arquivo nunca sai deste
// componente: extractPdfText/sha256 rodam no navegador, só o texto e o hash
// vão pro POST /v1/imports.
import { Alert, Badge, Button, EmptyState, Segmented, Select } from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type { AccountDto, CardDto, ImportedDocumentDto } from "../auth/types";
import {
  PdfNoTextLayerError,
  PdfPasswordRequiredError,
  extractPdfText,
  sha256,
} from "../lib/imports/extractPdfText";

const TYPE_OPTIONS = [
  { value: "card_invoice", label: "Fatura de cartão" },
  { value: "account_statement", label: "Extrato de conta" },
];

const STATUS_LABEL: Record<ImportedDocumentDto["status"], string> = {
  pending: "Pendente",
  processing: "Processando",
  extracted: "Aguardando revisão",
  reviewed: "Revisado",
  error: "Erro",
};

const STATUS_TONE: Record<
  ImportedDocumentDto["status"],
  "pending" | "estimate" | "active" | "alert"
> = {
  pending: "pending",
  processing: "estimate",
  extracted: "pending",
  reviewed: "active",
  error: "alert",
};

export function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const [type, setType] = useState<"card_invoice" | "account_statement">(
    "card_invoice",
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetchJson<AccountDto[]>("/accounts"),
    enabled: hasSession,
  });
  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetchJson<CardDto[]>("/cards"),
    enabled: hasSession,
  });
  const importsQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiFetchJson<ImportedDocumentDto[]>("/imports"),
    enabled: hasSession,
  });

  const targetOptions =
    type === "card_invoice"
      ? (cardsQuery.data ?? []).map((c) => ({
          value: c.id,
          label: `${c.institutionName}${c.name ? ` · ${c.name}` : ""}`,
        }))
      : (accountsQuery.data ?? [])
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
      navigate({ to: "/imports/$id", params: { id: result.document.id } });
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

  const documents = importsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold text-[var(--lr-text)]">
        Importar fatura ou extrato
      </h1>
      <p className="mb-6 text-sm text-[var(--lr-text-secondary)]">
        O arquivo nunca sai do seu dispositivo — o texto é extraído aqui mesmo,
        no navegador.
      </p>

      <div className="mb-6 flex flex-col gap-3 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
        <Segmented
          label="Tipo"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(value) => {
            setType(value as "card_invoice" | "account_statement");
            setTargetId(null);
          }}
        />
        <Select
          label={type === "card_invoice" ? "Cartão" : "Conta"}
          options={targetOptions}
          value={targetId}
          onChange={setTargetId}
          placeholder="Selecione…"
        />
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

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
        Importações
      </h2>
      {documents.length === 0 ? (
        <EmptyState
          title="Nenhuma importação ainda"
          description="Suas faturas e extratos importados aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() =>
                navigate({ to: "/imports/$id", params: { id: doc.id } })
              }
              className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4 text-left hover:border-[var(--lr-night-300)]"
            >
              <div>
                <p className="text-[var(--lr-text)]">
                  {doc.type === "card_invoice"
                    ? "Fatura de cartão"
                    : "Extrato de conta"}
                </p>
                <p className="text-sm text-[var(--lr-text-secondary)]">
                  {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Badge kind="status" status={STATUS_TONE[doc.status]}>
                {STATUS_LABEL[doc.status]}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
