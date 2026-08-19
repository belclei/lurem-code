// apps/web/src/routes/ImportReviewPage.tsx
// ARQUITETURA.md §6.8 item 6 — "a tela mais importante do fluxo": revisão
// linha a linha do que o LLM extraiu. Confidence exibida como pips (3
// indicadores discretos), não percentual, pra não sugerir uma precisão que
// a extração não tem.
import {
  Alert,
  Button,
  EmptyState,
  StagingReviewRow,
  formatMoney,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  ConnectionDto,
  DuplicateTransactionSummary,
  ExtractedTransactionDto,
  ImportedDocumentDto,
  TagDto,
} from "../auth/types";
import { reaisToCentsPositive } from "../lib/money";
import type { CategoryDto } from "./timeline/types";

function LineRow({
  line,
  categories,
  tagSuggestions,
  duplicate,
  connections,
  onSaved,
}: {
  line: ExtractedTransactionDto;
  categories: CategoryDto[];
  tagSuggestions: string[];
  duplicate: DuplicateTransactionSummary | undefined;
  connections: ConnectionDto[];
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(
    (line.amountCents / 100).toFixed(2).replace(".", ","),
  );
  const [categoryId, setCategoryId] = useState(line.suggestedCategoryId);
  const [tagNames, setTagNames] = useState(line.suggestedTagNames);
  const [portadorUserId, setPortadorUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = categories
    .filter((c) => c.kind === line.kind)
    .map((c) => ({ value: c.id, label: c.name }));
  const connectionOptions = connections.map((c) => ({
    value: c.counterpartUserId,
    label: c.counterpartName,
  }));

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<ExtractedTransactionDto>(
        `/imports/${line.importedDocumentId}/lines/${line.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
  });

  // Sem alias persistido nome→usuário (diferente do precedente money-flow,
  // que guarda um PortadorAlias por nome): o portador (§6.10) do Lurem já
  // atribui por Transaction real via /v1/portador/assign, então a sugestão
  // aqui é só "quem confirma escolhe um conectado" — nada é lembrado entre
  // importações, cada linha com cardHolderRaw pede de novo.
  const assignPortadorMutation = useMutation({
    mutationFn: (transactionId: string) =>
      apiFetchJson("/portador/assign", {
        method: "POST",
        body: JSON.stringify({ transactionId, portadorUserId }),
      }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (resolution?: "keep_both" | "replace") => {
      const cents = reaisToCentsPositive(amount);
      if (cents === null) throw new Error("Valor inválido.");
      const tagsChanged =
        tagNames.length !== line.suggestedTagNames.length ||
        tagNames.some((t) => !line.suggestedTagNames.includes(t));
      if (
        description !== line.description ||
        cents !== line.amountCents ||
        categoryId !== line.suggestedCategoryId ||
        tagsChanged
      ) {
        await patchMutation.mutateAsync({
          description,
          amountCents: cents,
          categoryId,
          ...(tagsChanged ? { tagNames } : {}),
        });
      }
      const confirmed = await apiFetchJson<ExtractedTransactionDto>(
        `/imports/${line.importedDocumentId}/lines/${line.id}/confirm`,
        {
          method: "POST",
          body: resolution ? JSON.stringify({ resolution }) : undefined,
        },
      );
      if (portadorUserId && confirmed.confirmedTransactionId) {
        await assignPortadorMutation.mutateAsync(
          confirmed.confirmedTransactionId,
        );
      }
      return confirmed;
    },
    onSuccess: onSaved,
    onError: (err: unknown) => {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível confirmar.",
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiFetchJson(
        `/imports/${line.importedDocumentId}/lines/${line.id}/reject`,
        { method: "POST" },
      ),
    onSuccess: onSaved,
  });

  return (
    <StagingReviewRow
      description={description}
      onDescriptionChange={setDescription}
      descriptionHint={
        line.originalDescription
          ? `Original: ${line.originalDescription}`
          : undefined
      }
      amount={amount}
      onAmountChange={setAmount}
      categoryOptions={categoryOptions}
      categoryId={categoryId}
      onCategoryIdChange={setCategoryId}
      tagNames={tagNames}
      onTagNamesChange={setTagNames}
      tagSuggestions={tagSuggestions}
      date={line.transactionDate}
      installmentNumber={line.installmentNumber}
      installmentTotal={line.installmentTotal}
      cardHolderRaw={line.cardHolderRaw}
      confidence={line.confidence}
      status={line.status}
      portadorOptions={connectionOptions}
      portadorUserId={portadorUserId}
      onPortadorUserIdChange={setPortadorUserId}
      duplicateDescription={
        duplicate
          ? `Já existe: ${duplicate.description} · ${duplicate.transactionDate.split("-").reverse().join("/")} · ${formatMoney(duplicate.amountCents)}`
          : undefined
      }
      error={error}
      onConfirm={
        line.status === "pending"
          ? () => confirmMutation.mutate(undefined)
          : undefined
      }
      onReject={
        line.status === "pending" ? () => rejectMutation.mutate() : undefined
      }
      onReplace={
        line.status === "pending" && duplicate
          ? () => confirmMutation.mutate("replace")
          : undefined
      }
      confirmLoading={
        confirmMutation.isPending && confirmMutation.variables !== "replace"
      }
      rejectLoading={rejectMutation.isPending}
      replaceLoading={
        confirmMutation.isPending && confirmMutation.variables === "replace"
      }
    />
  );
}

export function ImportReviewPage() {
  const { id } = useParams({ from: "/app-layout/imports/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);

  const docQuery = useQuery({
    queryKey: ["imports", id],
    queryFn: () =>
      apiFetchJson<{
        document: ImportedDocumentDto;
        lines: ExtractedTransactionDto[];
        duplicates: Record<string, DuplicateTransactionSummary>;
      }>(`/imports/${id}`),
    enabled: hasSession,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: hasSession,
  });
  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiFetchJson<ConnectionDto[]>("/connections"),
    enabled: hasSession,
  });
  const acceptedConnections = (connectionsQuery.data ?? []).filter(
    (c) => c.status === "accepted",
  );
  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetchJson<TagDto[]>("/tags"),
    enabled: hasSession,
  });
  const tagSuggestions = (tagsQuery.data ?? []).map((t) => t.name);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["imports", id] });
    queryClient.invalidateQueries({ queryKey: ["imports"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["cards"] });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
  };

  const confirmHighConfidenceMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<{ confirmedCount: number }>(
        `/imports/${id}/confirm-high-confidence`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });

  if (!docQuery.data) {
    return <div className="mx-auto max-w-3xl px-4 py-8">Carregando…</div>;
  }

  const { document: importDoc, lines, duplicates } = docQuery.data;
  const pendingLines = lines.filter((l) => l.status === "pending");
  const resolvedLines = lines.filter((l) => l.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold text-[var(--lr-text)]">
        Revisão da importação
      </h1>
      <p className="mb-6 text-sm text-[var(--lr-text-secondary)]">
        {importDoc.type === "card_invoice"
          ? "Fatura de cartão"
          : "Extrato de conta"}
        {" · "}
        {pendingLines.length} de {lines.length} linhas por revisar
      </p>

      {importDoc.status === "error" ? (
        <Alert
          variant="error"
          title="Falha ao processar este documento"
          description={importDoc.errorMessage ?? undefined}
        />
      ) : null}

      {pendingLines.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            loading={confirmHighConfidenceMutation.isPending}
            onClick={() => confirmHighConfidenceMutation.mutate()}
          >
            Confirmar todas de alta confiança
          </Button>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <EmptyState
          title="Nenhuma transação encontrada"
          description="Não conseguimos extrair transações deste documento."
          actions={[
            {
              label: "Voltar para importações",
              onClick: () => navigate({ to: "/imports" }),
            },
          ]}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pendingLines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              categories={categoriesQuery.data ?? []}
              tagSuggestions={tagSuggestions}
              duplicate={
                line.duplicateOfTxId
                  ? duplicates[line.duplicateOfTxId]
                  : undefined
              }
              connections={acceptedConnections}
              onSaved={invalidate}
            />
          ))}
          {resolvedLines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              categories={categoriesQuery.data ?? []}
              tagSuggestions={tagSuggestions}
              duplicate={
                line.duplicateOfTxId
                  ? duplicates[line.duplicateOfTxId]
                  : undefined
              }
              connections={acceptedConnections}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
