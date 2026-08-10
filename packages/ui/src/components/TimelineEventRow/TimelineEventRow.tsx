import { Alert, type AlertVariant } from "../Alert/Alert";
import { formatDate } from "../shared/formatDate";
import { formatMoney } from "../shared/formatMoney";

export type DomainEventType =
  | "account.created"
  | "account.updated"
  | "account.balance_adjusted"
  | "account.over_limit_entered"
  | "account.over_limit_cleared"
  | "card.created"
  | "card.updated"
  | "card.over_limit_entered"
  | "card.over_limit_cleared"
  | "card.invoice_closed"
  | "card.invoice_due"
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted"
  | "scheduled.confirmed"
  | "scheduled.skipped"
  | "scheduled.deleted"
  | "recurring.created"
  | "recurring.paused"
  | "recurring.ended"
  | "import.completed"
  | "invite.deleted"
  | "invite.resent"
  | "connection.requested"
  | "connection.accepted"
  | "connection.rejected"
  | "connection.deleted"
  | "connection.resent"
  | "share.granted"
  | "share.permission_changed"
  | "share.revoked"
  | "portador.assigned"
  | "portador.accepted"
  | "portador.rejected"
  | "portador.settled";

/** Loosely-typed union of every field any catalog entry's copy needs — see Task 5's judgment-call note (mirrors `DomainEvent.payload: Json` in the Prisma schema). */
export interface DomainEventPayload {
  institutionName?: string;
  /** Apelido da conta/cartão (ex.: "Nubank PJ") — quando presente, some junto do institutionName na copy, igual à lista de contas. */
  name?: string;
  counterpartName?: string;
  changed?: string[];
  balanceCents?: number;
  openingBalanceCents?: number;
  overdraftLimitCents?: number;
  usedCents?: number;
  limitCents?: number;
  totalCents?: number;
  dueDate?: string;
  autoDebitAccountName?: string;
  count?: number;
  permission?: "view" | "edit";
  itemLabel?: string;
}

export interface TimelineEventRowProps {
  type: DomainEventType;
  payload: DomainEventPayload;
}

function pct(
  usedCents: number | undefined,
  limitCents: number | undefined,
): string {
  if (!usedCents || !limitCents) return "";
  return `${Math.round((usedCents / limitCents) * 100)}%`;
}

// One line of pt-BR copy per catalog entry (IMPLEMENTACAO.md §6). "Informação,
// não julgamento" tone throughout (ARQUITETURA.md, recurring theme) — never
// phrased as blame, even for `.rejected`/`.deleted` entries.
const EVENT_TEXT: Record<DomainEventType, (p: DomainEventPayload) => string> = {
  "account.created": (p) =>
    `Você criou a conta ${p.institutionName ?? ""}${p.name ? ` - ${p.name}` : ""} — saldo inicial de ${formatMoney(p.openingBalanceCents ?? 0)}`,
  "account.updated": (p) =>
    p.changed?.includes("overdraftLimitCents")
      ? `Você alterou o limite de cheque especial de ${p.institutionName ?? "conta"}`
      : `Você atualizou a conta ${p.institutionName ?? ""}`,
  "account.balance_adjusted": (p) =>
    `Você ajustou manualmente o saldo de ${p.institutionName ?? "conta"}`,
  // over_limit_entered/cleared and invoice_closed/due are system-detected
  // state changes, not something the user directly did — "Sua conta
  // entrou em alerta" keeps the first-person *perspective* (possessive
  // "sua/seu") without a false "Você entrou em alerta" subject.
  "account.over_limit_entered": (p) =>
    `Sua conta ${p.institutionName ?? ""} entrou em alerta — ${formatMoney(p.balanceCents ?? 0)} além do limite`,
  "account.over_limit_cleared": (p) =>
    `Sua conta ${p.institutionName ?? ""} voltou para dentro do limite`,
  "card.created": (p) =>
    `Você adicionou o cartão ${p.institutionName ?? ""}${p.name ? ` - ${p.name}` : ""}`,
  "card.updated": (p) => `Você atualizou o cartão ${p.institutionName ?? ""}`,
  "card.over_limit_entered": (p) =>
    `Seu cartão ${p.institutionName ?? ""} entrou em alerta — ${pct(p.usedCents, p.limitCents)} do limite`,
  "card.over_limit_cleared": (p) =>
    `Seu cartão ${p.institutionName ?? ""} voltou para dentro do limite`,
  "card.invoice_closed": (p) =>
    `Sua fatura ${p.institutionName ?? ""} fechou — ${formatMoney(p.totalCents ?? 0)}, vence em ${p.dueDate ? formatDate(p.dueDate) : "—"}`,
  "card.invoice_due": (p) =>
    `Sua fatura ${p.institutionName ?? ""} vence hoje — ${formatMoney(p.totalCents ?? 0)}${
      p.autoDebitAccountName
        ? ` (descontada automaticamente de ${p.autoDebitAccountName})`
        : ""
    }`,
  "transaction.created": () => "Você registrou uma transação",
  "transaction.updated": () => "Você corrigiu uma transação",
  "transaction.deleted": () => "Você removeu uma transação",
  "scheduled.confirmed": () => "Você confirmou uma transação agendada",
  "scheduled.skipped": () => "Você pulou a ocorrência do mês",
  "scheduled.deleted": () => "Você encerrou uma série de agendamento",
  "recurring.created": () => "Você cadastrou uma nova recorrência",
  "recurring.paused": () => "Você pausou uma recorrência",
  "recurring.ended": () => "Você encerrou uma recorrência",
  "import.completed": (p) =>
    `Você importou a fatura ${p.institutionName ?? ""} — ${p.count ?? 0} transações`,
  "invite.deleted": () => "Você excluiu um convite",
  "invite.resent": () => "Você reenviou um convite",
  // connection.*/share.* (8 types below) are deliberately NOT converted to
  // "Você [verbo]" — DomainEventPayload has no actor/direction field, so
  // this event type could represent either the current user's own action
  // or the counterpart's action toward the user (e.g. connection.rejected
  // could mean "you rejected their request" or "they rejected yours").
  // The original passive phrasing was already neutral about who acted;
  // forcing first person risks misattributing the other party's action to
  // the viewing user. Judgment call — flagged in the plan's report.
  "connection.requested": (p) =>
    `Convite de conexão enviado a ${p.counterpartName ?? ""}`,
  "connection.accepted": (p) => `Conexão com ${p.counterpartName ?? ""} aceita`,
  "connection.rejected": (p) =>
    `Conexão com ${p.counterpartName ?? ""} recusada`,
  "connection.deleted": (p) =>
    `Conexão com ${p.counterpartName ?? ""} excluída`,
  "connection.resent": (p) =>
    `Convite de conexão reenviado a ${p.counterpartName ?? ""}`,
  "share.granted": (p) =>
    `${p.itemLabel ?? "Item"} compartilhado com ${p.counterpartName ?? ""} (${p.permission === "edit" ? "edição" : "visualização"})`,
  "share.permission_changed": (p) =>
    `Permissão de ${p.counterpartName ?? ""} em ${p.itemLabel ?? "item"} alterada`,
  "share.revoked": (p) =>
    `Compartilhamento de ${p.itemLabel ?? "item"} com ${p.counterpartName ?? ""} revogado`,
  "portador.assigned": (p) =>
    `Você atribuiu uma transação a ${p.counterpartName ?? ""}`,
  // accepted/rejected are the counterpart's own action, not the user's —
  // grounded in "que você atribuiu" (which you assigned) instead of
  // guessing a pronoun for the counterpart.
  "portador.accepted": (p) =>
    `${p.counterpartName ?? ""} aceitou a transação que você atribuiu`,
  "portador.rejected": (p) =>
    `${p.counterpartName ?? ""} rejeitou a transação que você atribuiu`,
  "portador.settled": (p) =>
    `Você registrou o acerto com ${p.counterpartName ?? ""}`,
};

// Category → icon mapping (line icons, viewBox 24×24, stroke 1.8 — Alert.tsx's
// issues.md: só Alert e Card podem compor o conteúdo da timeline — este
// componente não desenha mais sua própria linha (ícone svg + texto + data),
// delega a um Alert inline. A data já aparece no cabeçalho do dia (§7,
// TimelinePage), então este row nunca repete um timestamp próprio; o emoji
// por família substitui o antigo ícone svg por família (mesmo espírito, ver
// Alert's `emoji` prop).
function eventEmoji(type: DomainEventType): string {
  if (type.endsWith("over_limit_entered")) return "⚠️";
  if (type.endsWith("over_limit_cleared")) return "✅";
  if (type.startsWith("card.invoice")) return "🧾";
  if (type.startsWith("account") || type.startsWith("card")) return "🏦";
  if (type.startsWith("transaction")) return "💸";
  if (type.startsWith("scheduled")) return "⏰";
  if (type.startsWith("recurring")) return "🔁";
  if (type.startsWith("import")) return "📥";
  // connection.*/share.*/portador.*: eventos sobre outra pessoa.
  return "🤝";
}

function eventVariant(type: DomainEventType): AlertVariant {
  if (type.endsWith("over_limit_entered")) return "warning";
  if (type.endsWith("over_limit_cleared")) return "success";
  if (type === "card.invoice_due") return "warning";
  return "info";
}

/**
 * Lurem's generic structural timeline event line. Dumb component: reads a
 * `type` + loosely-typed `payload` and renders one of the catalog's 35
 * pt-BR copy templates (IMPLEMENTACAO.md §6, BACKLOG US-2.4) as an inline
 * Alert — never decides which event happened.
 */
export function TimelineEventRow({ type, payload }: TimelineEventRowProps) {
  return (
    <Alert
      layout="inline"
      variant={eventVariant(type)}
      emoji={eventEmoji(type)}
      title={EVENT_TEXT[type](payload)}
    />
  );
}
