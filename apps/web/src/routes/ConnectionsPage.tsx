// apps/web/src/routes/ConnectionsPage.tsx
// BACKLOG.md US-6.2/US-6.3 — conexões, compartilhamento e portador
// (ARQUITETURA.md §6.10). Copy de acerto é sempre "acerto pendente / a seu
// favor / a acertar" — nunca linguagem de cobrança ("te deve", "cobrar"),
// mesmo reframe já documentado em IMPLEMENTACAO.md §8.2 para a versão
// anterior deste fluxo.
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  formatMoney,
} from "@lurem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  ConnectionDto,
  MyInviteDto,
  PortadorPendingDto,
  ShareDto,
} from "../auth/types";

function settlementCopy(cents: number, counterpartName: string): string {
  if (cents === 0) return `Contas em dia com ${counterpartName}`;
  if (cents > 0) {
    return `Acerto pendente com ${counterpartName} · ${formatMoney(cents)} a seu favor`;
  }
  return `Acerto pendente com ${counterpartName} · ${formatMoney(-cents)} a acertar`;
}

function NewConnectionForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (addresseeEmail: string) =>
      apiFetchJson("/connections", {
        method: "POST",
        body: JSON.stringify({ addresseeEmail }),
      }),
    onSuccess: () => {
      setEmail("");
      setFormError(null);
      onCreated();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível conectar.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate(email);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-col gap-3 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
    >
      <Input
        type="email"
        label="E-mail do conectado"
        hint="A pessoa já precisa ter uma conta no Lurem."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {formError ? (
        <Alert variant="error" layout="inline" title={formError} />
      ) : null}
      <div>
        <Button type="submit" loading={createMutation.isPending}>
          Conectar
        </Button>
      </div>
    </form>
  );
}

const INVITE_STATUS_LABEL: Record<MyInviteDto["status"], string> = {
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovado — aguardando cadastro",
  registered: "Cadastrado",
  rejected: "Recusado",
  expired: "Expirado",
};

function NewInviteForm({ onCreated }: { onCreated: () => void }) {
  const [inviteeName, setInviteeName] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetchJson("/invites", {
        method: "POST",
        body: JSON.stringify({ inviteeName, inviteeEmail }),
      }),
    onSuccess: () => {
      setInviteeName("");
      setInviteeEmail("");
      setFormError(null);
      onCreated();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível convidar.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-col gap-3 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
    >
      <Input
        id="invite-name-input"
        label="Nome de quem você quer convidar"
        value={inviteeName}
        onChange={(event) => setInviteeName(event.target.value)}
      />
      <Input
        type="email"
        label="E-mail"
        hint="Um administrador precisa aprovar antes do link ser enviado."
        value={inviteeEmail}
        onChange={(event) => setInviteeEmail(event.target.value)}
      />
      {formError ? (
        <Alert variant="error" layout="inline" title={formError} />
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={!inviteeName || !inviteeEmail}
          loading={createMutation.isPending}
        >
          Convidar
        </Button>
      </div>
    </form>
  );
}

function SettleDialog({
  connection,
  accounts,
  cards,
  open,
  onClose,
  onSettled,
}: {
  connection: ConnectionDto;
  accounts: AccountDto[];
  cards: CardDto[];
  open: boolean;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [destination, setDestination] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const settleMutation = useMutation({
    mutationFn: () => {
      const [prefix, id] = (destination ?? "").split(":");
      return apiFetchJson("/portador/settle", {
        method: "POST",
        body: JSON.stringify({
          counterpartUserId: connection.counterpartUserId,
          accountId: prefix === "acc" ? id : undefined,
          creditCardId: prefix === "card" ? id : undefined,
        }),
      });
    },
    onSuccess: () => {
      setFormError(null);
      onSettled();
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError ? error.message : "Não foi possível acertar.",
      );
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Marcar como acertado"
      description={settlementCopy(
        connection.settlementBalanceCents,
        connection.counterpartName,
      )}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Registrar em"
          options={[
            ...accounts.map((a) => ({
              value: `acc:${a.id}`,
              label: a.name || a.institutionName,
            })),
            ...cards.map((c) => ({
              value: `card:${c.id}`,
              label: `Cartão ${c.name || c.institutionName}`,
            })),
          ]}
          value={destination}
          onChange={setDestination}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="mt-2 flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!destination}
            loading={settleMutation.isPending}
            onClick={() => settleMutation.mutate()}
          >
            Marcar como acertado
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AcceptPortadorDialog({
  item,
  accounts,
  cards,
  open,
  onClose,
  onAccepted,
}: {
  item: PortadorPendingDto;
  accounts: AccountDto[];
  cards: CardDto[];
  open: boolean;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [destination, setDestination] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: () => {
      const [prefix, id] = (destination ?? "").split(":");
      return apiFetchJson(`/portador/${item.id}/accept`, {
        method: "POST",
        body: JSON.stringify({
          accountId: prefix === "acc" ? id : undefined,
          creditCardId: prefix === "card" ? id : undefined,
        }),
      });
    },
    onSuccess: () => {
      setFormError(null);
      onAccepted();
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError ? error.message : "Não foi possível aceitar.",
      );
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Aceitar transação"
      description={`${item.description} — ${formatMoney(item.amountCents)}, de ${item.ownerName}. Escolha onde ela entra nas suas contas.`}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Conta ou cartão de destino"
          options={[
            ...accounts.map((a) => ({
              value: `acc:${a.id}`,
              label: a.name || a.institutionName,
            })),
            ...cards.map((c) => ({
              value: `card:${c.id}`,
              label: `Cartão ${c.name || c.institutionName}`,
            })),
          ]}
          value={destination}
          onChange={setDestination}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="mt-2 flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!destination}
            loading={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            Aceitar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function NewShareForm({
  accounts,
  cards,
  connections,
  onCreated,
}: {
  accounts: AccountDto[];
  cards: CardDto[];
  connections: ConnectionDto[];
  onCreated: () => void;
}) {
  const [itemValue, setItemValue] = useState<string | null>(null);
  const [sharedWithUserId, setSharedWithUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [formError, setFormError] = useState<string | null>(null);

  const accepted = connections.filter((c) => c.status === "accepted");

  const createMutation = useMutation({
    mutationFn: () => {
      const [prefix, id] = (itemValue ?? "").split(":");
      return apiFetchJson("/shares", {
        method: "POST",
        body: JSON.stringify({
          sharedWithUserId,
          itemType: prefix === "acc" ? "account" : "credit_card",
          accountId: prefix === "acc" ? id : undefined,
          creditCardId: prefix === "card" ? id : undefined,
          permission,
        }),
      });
    },
    onSuccess: () => {
      setItemValue(null);
      setSharedWithUserId(null);
      setFormError(null);
      onCreated();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível compartilhar.",
      );
    },
  });

  if (accepted.length === 0) return null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        createMutation.mutate();
      }}
      className="mb-6 flex flex-col gap-3 rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
    >
      <Select
        label="Conta ou cartão"
        options={[
          ...accounts.map((a) => ({
            value: `acc:${a.id}`,
            label: a.name || a.institutionName,
          })),
          ...cards.map((c) => ({
            value: `card:${c.id}`,
            label: `Cartão ${c.name || c.institutionName}`,
          })),
        ]}
        value={itemValue}
        onChange={setItemValue}
      />
      <Select
        label="Compartilhar com"
        options={accepted.map((c) => ({
          value: c.counterpartUserId,
          label: c.counterpartName,
        }))}
        value={sharedWithUserId}
        onChange={setSharedWithUserId}
      />
      <Select
        label="Permissão"
        options={[
          { value: "view", label: "Só ver" },
          { value: "edit", label: "Ver e editar" },
        ]}
        value={permission}
        onChange={(value) => setPermission(value as "view" | "edit")}
      />
      {formError ? (
        <Alert variant="error" layout="inline" title={formError} />
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={!itemValue || !sharedWithUserId}
          loading={createMutation.isPending}
        >
          Compartilhar
        </Button>
      </div>
    </form>
  );
}

export function ConnectionsPage() {
  const { isBooting, user } = useAuth();
  const hasSession = !isBooting && Boolean(user);
  const queryClient = useQueryClient();

  const [settlingConnection, setSettlingConnection] =
    useState<ConnectionDto | null>(null);
  const [acceptingItem, setAcceptingItem] = useState<PortadorPendingDto | null>(
    null,
  );

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiFetchJson<ConnectionDto[]>("/connections"),
    enabled: hasSession,
  });
  const pendingQuery = useQuery({
    queryKey: ["portador-pending"],
    queryFn: () => apiFetchJson<PortadorPendingDto[]>("/portador/pending"),
    enabled: hasSession,
  });
  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: () => apiFetchJson<MyInviteDto[]>("/invites"),
    enabled: hasSession,
  });
  const sharesQuery = useQuery({
    queryKey: ["shares"],
    queryFn: () => apiFetchJson<ShareDto[]>("/shares"),
    enabled: hasSession,
  });
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

  const acceptConnectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/connections/${id}/accept`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
  });
  const rejectConnectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/connections/${id}/reject`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
  });
  const rejectPortadorMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/portador/${id}/reject`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["portador-pending"] }),
  });
  const revokeShareMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/shares/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }),
  });
  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/connections/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
  });
  const resendConnectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/connections/${id}/resend`, { method: "POST" }),
  });
  const deleteInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
  });
  const resendInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/invites/${id}/resend`, { method: "POST" }),
  });

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }
  // Moved below every hook above (was previously the function's first
  // statement, right after computing `hasSession`): an early return before
  // useState/useQuery/useMutation calls violates the Rules of Hooks — once
  // `hasSession` flips true on a later render, React would see fewer hooks
  // than the previous render and throw.
  if (!user.flags.connections) {
    return <Navigate to="/timeline" />;
  }

  const connections = connectionsQuery.data ?? [];
  const pendingInvites = connections.filter(
    (c) => c.status === "pending" && !c.isRequester,
  );
  const sentInvites = connections.filter(
    (c) => c.status === "pending" && c.isRequester,
  );
  const accepted = connections.filter((c) => c.status === "accepted");
  const accounts = accountsQuery.data ?? [];
  const cards = cardsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-[var(--lr-text)]">Conexões</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Conectar
        </h2>
        <NewConnectionForm
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["connections"] })
          }
        />
      </section>

      {pendingInvites.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
            Convites recebidos
          </h2>
          <div className="flex flex-col gap-2">
            {pendingInvites.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">{c.counterpartName}</p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {c.counterpartEmail}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    loading={rejectConnectionMutation.isPending}
                    onClick={() => rejectConnectionMutation.mutate(c.id)}
                  >
                    Recusar
                  </Button>
                  <Button
                    loading={acceptConnectionMutation.isPending}
                    onClick={() => acceptConnectionMutation.mutate(c.id)}
                  >
                    Aceitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sentInvites.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
            Convites enviados
          </h2>
          <div className="flex flex-col gap-2">
            {sentInvites.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">{c.counterpartName}</p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {c.counterpartEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    Aguardando resposta
                  </p>
                  <Button
                    variant="secondary"
                    loading={resendConnectionMutation.isPending}
                    onClick={() => resendConnectionMutation.mutate(c.id)}
                  >
                    Reenviar
                  </Button>
                  <Button
                    variant="secondary"
                    loading={deleteConnectionMutation.isPending}
                    onClick={() => deleteConnectionMutation.mutate(c.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Conectados
        </h2>
        {accepted.length === 0 ? (
          <EmptyState
            title="Nenhuma conexão ainda"
            description="Conecte-se com alguém para compartilhar contas ou dividir despesas."
            actions={[
              {
                label: "Convidar alguém",
                onClick: () =>
                  document.getElementById("invite-name-input")?.focus(),
              },
            ]}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {accepted.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">{c.counterpartName}</p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {settlementCopy(
                      c.settlementBalanceCents,
                      c.counterpartName,
                    )}
                  </p>
                </div>
                {c.settlementBalanceCents !== 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => setSettlingConnection(c)}
                  >
                    Marcar como acertado
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {pendingQuery.data && pendingQuery.data.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
            Transações para validar
          </h2>
          <div className="flex flex-col gap-2">
            {pendingQuery.data.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">{item.description}</p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {formatMoney(item.amountCents)} · de {item.ownerName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    loading={rejectPortadorMutation.isPending}
                    onClick={() => rejectPortadorMutation.mutate(item.id)}
                  >
                    Rejeitar
                  </Button>
                  <Button onClick={() => setAcceptingItem(item)}>
                    Aceitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Convidar para o Lurem
        </h2>
        <NewInviteForm
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["invites"] })
          }
        />
        {invitesQuery.data && invitesQuery.data.length > 0 ? (
          <div className="flex flex-col gap-2">
            {invitesQuery.data.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div>
                  <p className="text-[var(--lr-text)]">{invite.inviteeName}</p>
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {invite.inviteeEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[var(--lr-text-secondary)]">
                    {INVITE_STATUS_LABEL[invite.status]}
                  </p>
                  {invite.status === "approved" ? (
                    <Button
                      variant="secondary"
                      loading={resendInviteMutation.isPending}
                      onClick={() => resendInviteMutation.mutate(invite.id)}
                    >
                      Reenviar
                    </Button>
                  ) : null}
                  {invite.status !== "registered" ? (
                    <Button
                      variant="secondary"
                      loading={deleteInviteMutation.isPending}
                      onClick={() => deleteInviteMutation.mutate(invite.id)}
                    >
                      Excluir
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lr-text-secondary)]">
          Compartilhamentos
        </h2>
        <NewShareForm
          accounts={accounts}
          cards={cards}
          connections={connections}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["shares"] })
          }
        />
        <div className="flex flex-col gap-2">
          {(sharesQuery.data ?? []).map((share) => {
            const item =
              share.itemType === "account"
                ? accounts.find((a) => a.id === share.accountId)
                : cards.find((c) => c.id === share.creditCardId);
            return (
              <div
                key={share.id}
                className="flex items-center justify-between rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4"
              >
                <div className="flex items-center gap-3">
                  <p className="text-[var(--lr-text)]">
                    {item?.name || item?.institutionName || share.itemType}
                  </p>
                  <Badge
                    kind="category"
                    // Not kind="status": "active"/"inactive" are lifecycle
                    // semantics (petrol "confirmed" vs. grayed "disabled"),
                    // which inverted the risk signal here — the safer
                    // permission (view) read as disabled, the riskier one
                    // (edit) as affirmed. "ink" (bordered, more visual
                    // weight) for the higher-stakes grant, plain "blue"
                    // (graphite) for the lower-stakes one — permission
                    // level, not status.
                    color={share.permission === "edit" ? "ink" : "blue"}
                  >
                    {share.permission === "edit" ? "Ver e editar" : "Só ver"}
                  </Badge>
                </div>
                {share.isOwner ? (
                  <Button
                    variant="secondary"
                    loading={revokeShareMutation.isPending}
                    onClick={() => revokeShareMutation.mutate(share.id)}
                  >
                    Revogar
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {settlingConnection ? (
        <SettleDialog
          connection={settlingConnection}
          accounts={accounts}
          cards={cards}
          open={Boolean(settlingConnection)}
          onClose={() => setSettlingConnection(null)}
          onSettled={() =>
            queryClient.invalidateQueries({ queryKey: ["connections"] })
          }
        />
      ) : null}

      {acceptingItem ? (
        <AcceptPortadorDialog
          item={acceptingItem}
          accounts={accounts}
          cards={cards}
          open={Boolean(acceptingItem)}
          onClose={() => setAcceptingItem(null)}
          onAccepted={() =>
            queryClient.invalidateQueries({ queryKey: ["portador-pending"] })
          }
        />
      ) : null}
    </div>
  );
}
