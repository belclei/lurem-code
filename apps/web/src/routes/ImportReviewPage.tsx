// apps/web/src/routes/ImportReviewPage.tsx
// ARQUITETURA.md §6.8 item 6 — "a tela mais importante do fluxo": revisão
// linha a linha do que o LLM extraiu. Confidence exibida como pips (3
// indicadores discretos), não percentual, pra não sugerir uma precisão que
// a extração não tem.
import {
  Alert,
  Badge,
  Body,
  Button,
  EmptyState,
  Input,
  Select,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  ExtractedTransactionDto,
  ImportedDocumentDto,
} from "../auth/types";
import { reaisToCentsPositive } from "../lib/money";
import type { CategoryDto } from "./timeline/types";

function ConfidencePips({ confidence }: { confidence: number }) {
  const lit = confidence >= 0.8 ? 3 : confidence >= 0.5 ? 2 : 1;
  return (
    <span
      className="flex items-center gap-0.5"
      title={`Confiança: ${Math.round(confidence * 100)}%`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < lit ? "bg-[var(--lr-text)]" : "bg-[var(--lr-border)]"
          }`}
        />
      ))}
    </span>
  );
}

function LineRow({
  line,
  categories,
  onSaved,
}: {
  line: ExtractedTransactionDto;
  categories: CategoryDto[];
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(
    (line.amountCents / 100).toFixed(2).replace(".", ","),
  );
  const [categoryId, setCategoryId] = useState(line.suggestedCategoryId);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = categories
    .filter((c) => c.kind === line.kind)
    .map((c) => ({ value: c.id, label: c.name }));

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchJson<ExtractedTransactionDto>(
        `/imports/${line.importedDocumentId}/lines/${line.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const cents = reaisToCentsPositive(amount);
      if (cents === null) throw new Error("Valor inválido.");
      if (
        description !== line.description ||
        cents !== line.amountCents ||
        categoryId !== line.suggestedCategoryId
      ) {
        await patchMutation.mutateAsync({
          description,
          amountCents: cents,
          categoryId,
        });
      }
      return apiFetchJson(
        `/imports/${line.importedDocumentId}/lines/${line.id}/confirm`,
        { method: "POST" },
      );
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

  if (line.status !== "pending") {
    return (
      <div className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-3 opacity-60">
        <Body>{line.description}</Body>
        <Badge
          kind="status"
          status={line.status === "confirmed" ? "active" : "inactive"}
        >
          {line.status === "confirmed" ? "Confirmada" : "Rejeitada"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <ConfidencePips confidence={line.confidence} />
        <Body muted className="text-xs">
          {line.transactionDate.split("-").reverse().join("/")}
          {line.installmentNumber && line.installmentTotal
            ? ` · ${line.installmentNumber}/${line.installmentTotal}`
            : ""}
          {line.cardHolderRaw ? ` · ${line.cardHolderRaw}` : ""}
        </Body>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <Input
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          label="Valor"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          money
          affix="R$"
        />
        <Select
          label="Categoria"
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
        />
      </div>
      {error ? <Alert variant="error" layout="inline" title={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          loading={rejectMutation.isPending}
          onClick={() => rejectMutation.mutate()}
        >
          Rejeitar
        </Button>
        <Button
          type="button"
          loading={confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}

export function ImportReviewPage() {
  const { id } = useParams({ from: "/app-layout/imports/$id" });
  const queryClient = useQueryClient();
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);

  const docQuery = useQuery({
    queryKey: ["imports", id],
    queryFn: () =>
      apiFetchJson<{
        document: ImportedDocumentDto;
        lines: ExtractedTransactionDto[];
      }>(`/imports/${id}`),
    enabled: hasSession,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: hasSession,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["imports", id] });
    queryClient.invalidateQueries({ queryKey: ["imports"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["cards"] });
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

  const { document: importDoc, lines } = docQuery.data;
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
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pendingLines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              categories={categoriesQuery.data ?? []}
              onSaved={invalidate}
            />
          ))}
          {resolvedLines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              categories={categoriesQuery.data ?? []}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
