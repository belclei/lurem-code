// apps/web/src/routes/AdminPage.tsx
// BACKLOG.md US-7.1/US-7.2 — painéis Acessos e Usuários. role=user é
// bloqueado na UI (espelha o 403 admin.forbidden do backend); nunca mostra
// valor financeiro, só contagens (§6.2).
import { Badge, Button, EmptyState, Switch } from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "../auth/AuthContext";
import { apiFetchJson } from "../auth/api-client";
import type {
  AdminAccessDto,
  AdminHealthDto,
  AdminUsageDto,
  AdminUserDto,
} from "../auth/types";

const NOT_AVAILABLE_LABEL: Record<string, string> = {
  jobQueue: "Fila de jobs",
  importErrors: "Erros de importação",
  apiP95Ms: "Latência p95 da API",
  deepSeekCostCents: "Custo estimado DeepSeek",
  resendDeliverability: "Deliverability do Resend",
};

export function AdminPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const accessQuery = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => apiFetchJson<AdminAccessDto>("/admin/access"),
    enabled: hasSession && isAdmin,
  });
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetchJson<AdminUserDto[]>("/admin/users"),
    enabled: hasSession && isAdmin,
  });
  const usageQuery = useQuery({
    queryKey: ["admin-usage"],
    queryFn: () => apiFetchJson<AdminUsageDto>("/admin/usage"),
    enabled: hasSession && isAdmin,
  });
  const healthQuery = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => apiFetchJson<AdminHealthDto>("/admin/health"),
    enabled: hasSession && isAdmin,
  });

  const invalidateAccess = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-access"] });
  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const approveWaitlistMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/admin/access/waitlist/${id}/approve`, { method: "POST" }),
    onSuccess: invalidateAccess,
  });
  const rejectWaitlistMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/admin/access/waitlist/${id}/reject`, { method: "POST" }),
    onSuccess: invalidateAccess,
  });
  const approveInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/admin/access/invites/${id}/approve`, { method: "POST" }),
    onSuccess: invalidateAccess,
  });
  const rejectInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/admin/access/invites/${id}/reject`, { method: "POST" }),
    onSuccess: invalidateAccess,
  });
  const deleteInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/invites/${id}`, { method: "DELETE" }),
    onSuccess: invalidateAccess,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "user" | "admin" }) =>
      apiFetchJson(`/admin/users/${id}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
    onSuccess: invalidateUsers,
  });
  const betaMutation = useMutation({
    mutationFn: ({ id, isBetaTester }: { id: string; isBetaTester: boolean }) =>
      apiFetchJson(`/admin/users/${id}/beta`, {
        method: "POST",
        body: JSON.stringify({ isBetaTester }),
      }),
    onSuccess: invalidateUsers,
  });
  const disableMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      apiFetchJson(`/admin/users/${id}/disable`, {
        method: "POST",
        body: JSON.stringify({ disabled }),
      }),
    onSuccess: invalidateUsers,
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }
  if (!isAdmin) {
    return <Navigate to="/timeline" />;
  }

  const waitlist = accessQuery.data?.waitlist ?? [];
  const invites = accessQuery.data?.invites ?? [];
  const users = usersQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">
        Painel administrativo
      </h1>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Acessos
        </h2>
        {waitlist.length === 0 && invites.length === 0 ? (
          <EmptyState
            title="Nada pendente"
            description="Fila de acesso e convites aguardando aprovação aparecem aqui."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {waitlist.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">
                    {entry.name}{" "}
                    <Badge kind="status" status="pending">
                      Fila de acesso
                    </Badge>
                  </p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {entry.email}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    loading={rejectWaitlistMutation.isPending}
                    onClick={() => rejectWaitlistMutation.mutate(entry.id)}
                  >
                    Recusar
                  </Button>
                  <Button
                    loading={approveWaitlistMutation.isPending}
                    onClick={() => approveWaitlistMutation.mutate(entry.id)}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            ))}
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">
                    {invite.inviteeName}{" "}
                    <Badge kind="status" status="pending">
                      Convite
                    </Badge>
                  </p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {invite.inviteeEmail}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    loading={deleteInviteMutation.isPending}
                    onClick={() => deleteInviteMutation.mutate(invite.id)}
                  >
                    Excluir
                  </Button>
                  <Button
                    variant="secondary"
                    loading={rejectInviteMutation.isPending}
                    onClick={() => rejectInviteMutation.mutate(invite.id)}
                  >
                    Recusar
                  </Button>
                  <Button
                    loading={approveInviteMutation.isPending}
                    onClick={() => approveInviteMutation.mutate(invite.id)}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Usuários
        </h2>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-3 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[var(--lr-text)]">
                  {u.name}{" "}
                  <Badge
                    kind="status"
                    status={u.status === "active" ? "active" : "inactive"}
                  >
                    {u.role === "admin" ? "Admin" : "Usuário"}
                  </Badge>
                </p>
                <p className="text-sm text-[var(--lr-text-secondary)]">
                  {u.email} · {u.accountCount} contas · {u.cardCount} cartões ·{" "}
                  {u.transactionCount} transações
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Switch
                  label="Beta"
                  checked={u.isBetaTester}
                  disabled={betaMutation.isPending}
                  onChange={(checked) =>
                    betaMutation.mutate({ id: u.id, isBetaTester: checked })
                  }
                />
                <Button
                  variant="secondary"
                  disabled={u.id === user.id && u.role === "admin"}
                  loading={roleMutation.isPending}
                  onClick={() =>
                    roleMutation.mutate({
                      id: u.id,
                      role: u.role === "admin" ? "user" : "admin",
                    })
                  }
                >
                  {u.role === "admin" ? "Rebaixar" : "Promover"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={u.id === user.id}
                  loading={disableMutation.isPending}
                  onClick={() =>
                    disableMutation.mutate({
                      id: u.id,
                      disabled: u.status === "active",
                    })
                  }
                >
                  {u.status === "active" ? "Desabilitar" : "Reabilitar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Frequência de uso
        </h2>
        {usageQuery.data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  DAU
                </p>
                <p className="text-lg font-semibold text-[var(--lr-text)]">
                  {usageQuery.data.dau}
                </p>
              </div>
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  WAU
                </p>
                <p className="text-lg font-semibold text-[var(--lr-text)]">
                  {usageQuery.data.wau}
                </p>
              </div>
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  MAU
                </p>
                <p className="text-lg font-semibold text-[var(--lr-text)]">
                  {usageQuery.data.mau}
                </p>
              </div>
            </div>
            <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                Retenção
              </p>
              <p className="text-sm text-[var(--lr-text)]">
                D1: {usageQuery.data.retention.d1}% · D7:{" "}
                {usageQuery.data.retention.d7}% · D30:{" "}
                {usageQuery.data.retention.d30}%
              </p>
            </div>
            <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                Funil de ativação ({usageQuery.data.activationFunnel.totalUsers}{" "}
                usuários)
              </p>
              <p className="text-sm text-[var(--lr-text)]">
                Carteira: {usageQuery.data.activationFunnel.wallet} · Contas:{" "}
                {usageQuery.data.activationFunnel.accounts} · Cartões:{" "}
                {usageQuery.data.activationFunnel.cards} · Completou os 3:{" "}
                {usageQuery.data.activationFunnel.allThree}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Saúde do sistema
        </h2>
        {healthQuery.data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  Banco de dados
                </p>
                <Badge
                  kind="status"
                  status={
                    healthQuery.data.database === "ok" ? "active" : "alert"
                  }
                >
                  {healthQuery.data.database === "ok" ? "OK" : "Erro"}
                </Badge>
              </div>
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  Redis
                </p>
                <Badge
                  kind="status"
                  status={healthQuery.data.redis === "ok" ? "active" : "alert"}
                >
                  {healthQuery.data.redis === "ok" ? "OK" : "Erro"}
                </Badge>
              </div>
            </div>
            {healthQuery.data.notAvailable.length > 0 ? (
              <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-[var(--lr-text-secondary)]">
                  Ainda não disponível
                </p>
                <p className="text-sm text-[var(--lr-text-secondary)]">
                  {healthQuery.data.notAvailable
                    .map((key) => NOT_AVAILABLE_LABEL[key] ?? key)
                    .join(" · ")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
