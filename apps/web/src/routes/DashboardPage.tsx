// apps/web/src/routes/DashboardPage.tsx
// US-3.11 — a rota /dashboard: busca os 3 cards em /v1/insights/dashboard e
// delega a renderização ao DashboardView (puro). Cuida dos estados §4.4:
// loading (skeleton sereno), error (acionável, com retry) e ready. Não há
// estado "empty" distinto — o endpoint sempre devolve os 3 cards (mesmo que
// zerados); a ativação (Timeline vazia, §6.11) é a Sprint 7, não esta tela.
import { Skeleton } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import { type DashboardInsights, DashboardView } from "./DashboardView";
import { SpendBreakdownSection } from "./SpendBreakdownSection";

function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-40 w-full rounded-[var(--lr-r-lg)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-[var(--lr-r-lg)]" />
        <Skeleton className="h-28 w-full rounded-[var(--lr-r-lg)]" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);

  const query = useQuery({
    queryKey: ["insights", "dashboard"],
    queryFn: () => apiFetchJson<DashboardInsights>("/insights/dashboard"),
    enabled: hasSession,
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Seu dinheiro hoje
      </h1>

      {query.isLoading ? <DashboardSkeleton /> : null}
      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]">
            Não foi possível carregar seus insights.
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="text-sm font-semibold text-[var(--lr-text)] underline"
          >
            Tentar de novo
          </button>
        </div>
      ) : null}
      {query.data ? <DashboardView insights={query.data} /> : null}
      {query.data ? <SpendBreakdownSection /> : null}
    </div>
  );
}
