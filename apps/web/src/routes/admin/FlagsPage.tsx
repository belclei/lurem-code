import { Alert, Button, Select } from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { ApiError, apiFetchJson } from "../../auth/api-client";

interface FeatureFlag {
  key: string;
  description: string;
  state: "off" | "beta" | "on";
  rolloutPercent: number;
  updatedAt: string;
}

export function FlagsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<"off" | "beta" | "on">("off");
  const [editRollout, setEditRollout] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== "admin") {
    return <div className="p-6">Acesso negado</div>;
  }

  const flagsQuery = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => apiFetchJson<FeatureFlag[]>("/admin/flags"),
  });

  const updateMutation = useMutation({
    mutationFn: (params: {
      key: string;
      state: "off" | "beta" | "on";
      rolloutPercent: number;
    }) =>
      apiFetchJson(`/admin/flags/${params.key}`, {
        method: "PATCH",
        body: JSON.stringify({
          state: params.state,
          rolloutPercent: params.rolloutPercent,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-flags"] });
      setEditingKey(null);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(
        err instanceof ApiError ? err.message : "Erro ao atualizar flag",
      );
    },
  });

  const flags = flagsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Feature Flags
      </h1>

      {flagsQuery.isLoading && (
        <p className="text-[var(--lr-text-secondary)]">Carregando...</p>
      )}
      {flagsQuery.isError && (
        <Alert variant="error" layout="inline" title="Erro ao carregar flags" />
      )}
      {error && <Alert variant="error" layout="inline" title={error} />}

      <div className="flex flex-col gap-3">
        {flags.map((flag) => (
          <div
            key={flag.key}
            className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
          >
            <div className="mb-3">
              <h3 className="font-semibold text-[var(--lr-text)]">
                {flag.key}
              </h3>
              <p className="text-sm text-[var(--lr-text-secondary)]">
                {flag.description}
              </p>
            </div>

            {editingKey === flag.key ? (
              <div className="mt-4 flex flex-col gap-3 rounded-[var(--lr-r-md)] bg-[var(--lr-bg)] p-3">
                <Select
                  label="Estado"
                  options={[
                    { value: "off", label: "Off" },
                    { value: "beta", label: "Beta" },
                    { value: "on", label: "On" },
                  ]}
                  value={editState}
                  onChange={(v) => setEditState(v as "off" | "beta" | "on")}
                />
                {editState === "on" && (
                  <div>
                    <label
                      htmlFor="rollout-range"
                      className="mb-2 block text-sm font-medium text-[var(--lr-text)]"
                    >
                      Rollout: {editRollout}%
                    </label>
                    <input
                      id="rollout-range"
                      type="range"
                      min="0"
                      max="100"
                      value={editRollout}
                      onChange={(e) =>
                        setEditRollout(Number.parseInt(e.target.value))
                      }
                      className="w-full"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEditingKey(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    loading={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        key: flag.key,
                        state: editState,
                        rolloutPercent: editState === "on" ? editRollout : 0,
                      })
                    }
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--lr-text-secondary)]">
                  <span className="font-mono text-[var(--lr-text)]">
                    {flag.state}
                  </span>
                  {flag.state === "on" && (
                    <span className="ml-2 text-xs">
                      ({flag.rolloutPercent}%)
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingKey(flag.key);
                    setEditState(flag.state);
                    setEditRollout(flag.rolloutPercent);
                  }}
                >
                  Editar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
