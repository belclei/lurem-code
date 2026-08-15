// apps/web/src/routes/UpdatesPage.tsx
// issues.md: página que o Alert de "o que há de novo" (UpdatesBanner.tsx)
// linka — histórico de releases, mais recente primeiro.
import { Body, EmptyState, formatDate } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "../auth/api-client";
import type { ReleaseDto } from "../auth/types";

export function UpdatesPage() {
  const releasesQuery = useQuery({
    queryKey: ["releases"],
    queryFn: () => apiFetchJson<ReleaseDto[]>("/releases"),
  });

  const releases = releasesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Novidades
      </h1>
      {releases.length === 0 ? (
        <EmptyState
          title="Nada por aqui ainda"
          description="Quando a Lurem ganhar novidades, elas aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {releases.map((release) => (
            <article
              key={release.id}
              className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
            >
              <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                {formatDate(release.publishedAt)} · v{release.version}
              </p>
              <h2 className="mt-1 mb-2 text-lg font-semibold text-[var(--lr-text)]">
                {release.title}
              </h2>
              <Body className="whitespace-pre-wrap">{release.body}</Body>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
