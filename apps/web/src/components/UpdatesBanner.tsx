// apps/web/src/components/UpdatesBanner.tsx
// issues.md: "a cada nova versão que entrar em produção, exibir um Alert no
// topo da página explicando o que há de novo". "Vista" é puramente
// client-side (localStorage, comparando o id da Release mais recente) — não
// existe campo por-usuário no servidor pra isso (ver Release no
// schema.prisma), então esse componente é a única fonte da verdade de
// "o usuário já viu essa release".
import { Alert } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiFetchJson } from "../auth/api-client";
import type { ReleaseDto } from "../auth/types";

const LAST_SEEN_KEY = "lurem.lastSeenReleaseId";

export function UpdatesBanner() {
  const navigate = useNavigate();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const releasesQuery = useQuery({
    queryKey: ["releases"],
    queryFn: () => apiFetchJson<ReleaseDto[]>("/releases"),
  });

  const latest = releasesQuery.data?.[0];
  if (!latest) return null;

  const lastSeenId = dismissedId ?? window.localStorage.getItem(LAST_SEEN_KEY);
  if (lastSeenId === latest.id) return null;

  function markSeen() {
    if (!latest) return;
    window.localStorage.setItem(LAST_SEEN_KEY, latest.id);
    setDismissedId(latest.id);
  }

  return (
    <Alert
      variant="info"
      layout="box"
      emoji="✨"
      title={`Novidade: ${latest.title}`}
      description="Confira o que mudou na Lurem."
      onClose={markSeen}
      actions={[
        {
          label: "Ver o que mudou",
          onClick: () => {
            markSeen();
            navigate({ to: "/updates" });
          },
        },
      ]}
    />
  );
}
