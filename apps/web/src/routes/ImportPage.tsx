// apps/web/src/routes/ImportPage.tsx
// ARQUITETURA.md §6.8 — upload de fatura/extrato. O arquivo nunca sai deste
// componente: extractPdfText/sha256 rodam no navegador, só o texto e o hash
// vão pro POST /v1/imports.
import { Badge, EmptyState } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  ImportedDocumentDto,
  InstitutionDto,
} from "../auth/types";
import { ImportUploadForm } from "../lib/imports/ImportUploadForm";
import { NewAccountDialog } from "./timeline/NewAccountDialog";
import { NewCardDialog } from "./timeline/NewCardDialog";

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
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);

  if (hasSession && user && !user.flags["imports.pipeline"]) {
    return <Navigate to="/timeline" />;
  }

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);

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
  const institutionsQuery = useQuery({
    queryKey: ["institutions"],
    queryFn: () => apiFetchJson<InstitutionDto[]>("/institutions"),
    enabled: hasSession,
  });
  const importsQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiFetchJson<ImportedDocumentDto[]>("/imports"),
    enabled: hasSession,
  });

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

      <div className="mb-6 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
        <ImportUploadForm
          accounts={accountsQuery.data ?? []}
          cards={cardsQuery.data ?? []}
          onImported={(id) => navigate({ to: "/imports/$id", params: { id } })}
          onCreateCard={() => setCardDialogOpen(true)}
          onCreateAccount={() => setAccountDialogOpen(true)}
        />
      </div>

      <NewAccountDialog
        key={accountDialogOpen ? "new-account-open" : "new-account-closed"}
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        onCreated={() => {
          setAccountDialogOpen(false);
          accountsQuery.refetch?.();
        }}
      />
      <NewCardDialog
        key={cardDialogOpen ? "new-card-open" : "new-card-closed"}
        open={cardDialogOpen}
        onClose={() => setCardDialogOpen(false)}
        institutions={institutionsQuery.data ?? []}
        accounts={accountsQuery.data ?? []}
        onCreated={() => {
          setCardDialogOpen(false);
          cardsQuery.refetch?.();
        }}
      />

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
