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
  // Projeção futura (BACKLOG: "fechamento/vencimento com antecedência") —
  // sintetizados por timeline/aggregate.ts's `synthesizeStructuralDates`,
  // não backed por um DomainEvent real (o real só nasce no dia exato, via
  // invoice-events-job.ts). Tipos próprios (não reaproveitam
  // card.invoice_closed/due) porque o total ainda é uma estimativa da
  // fatura em andamento, não o valor final fechado.
  | "card.invoice_closing_upcoming"
  | "card.invoice_due_upcoming"
  // Calendário global administrado (BACKLOG item A) — nunca backed por um
  // DomainEvent real, sempre sintetizado (mesmo mecanismo acima).
  | "calendar.global_entry"
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted"
  | "scheduled.confirmed"
  | "scheduled.skipped"
  | "scheduled.deleted"
  | "recurring.created"
  | "recurring.paused"
  | "recurring.ended"
  | "recurring.occurrence_upcoming"
  | "import.completed"
  | "invite.created"
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
  | "portador.settled"
  // Ação do admin sobre a fila de acesso/convite de outro usuário (§7.1) —
  // achado em produção (15/08): faltava no catálogo inteiro, então
  // EVENT_TEXT[type] undefined quebrava a Timeline pra qualquer admin que já
  // tivesse aprovado/recusado alguém — exatamente a conta que "sempre
  // quebrava" enquanto uma conta sem esse histórico funcionava normalmente.
  | "admin.access_approved"
  | "admin.access_rejected";

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
  /** card.invoice_closing_upcoming's own projected date (dueDate above is reused by card.invoice_closed/due). */
  closingDate?: string;
  autoDebitAccountName?: string;
  count?: number;
  permission?: "view" | "edit";
  itemLabel?: string;
  inviteeEmail?: string;
  /** admin.access_approved/.rejected's own field name (routes.ts's fireAdminEvent payload) — distinct from inviteeEmail above (invite.* events), same value shape. */
  email?: string;
  /** calendar.global_entry — the admin-authored line itself (GlobalCalendarEntry.title), not composed from other fields. */
  title?: string;
  /** calendar.global_entry — GlobalCalendarEntry.displayStyle ("box" | "inline"); unused by this row today (both render as an inline Alert), kept so the payload round-trips the admin's choice for a future "box" treatment. */
  displayStyle?: string;
  /** admin.access_approved/.rejected — "waitlist" ou "invite", qual fila o admin agiu sobre. */
  kind?: "waitlist" | "invite";
}

export interface TimelineEventRowProps {
  type: DomainEventType;
  payload: DomainEventPayload;
  aggregateId?: string;
  onCloseInvoice?: (cardId: string) => void;
  onPayInvoice?: (cardId: string) => void;
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
  "card.invoice_closing_upcoming": (p) =>
    `Sua fatura ${p.institutionName ?? ""} fecha em breve — dia ${p.closingDate ? formatDate(p.closingDate) : "—"}, ${formatMoney(p.totalCents ?? 0)} até agora`,
  "card.invoice_due_upcoming": (p) =>
    `Sua fatura ${p.institutionName ?? ""} vence dia ${p.dueDate ? formatDate(p.dueDate) : "—"} — ${formatMoney(p.totalCents ?? 0)}`,
  "calendar.global_entry": (p) => p.title ?? "",
  "transaction.created": () => "Você registrou uma transação",
  "transaction.updated": () => "Você corrigiu uma transação",
  "transaction.deleted": () => "Você removeu uma transação",
  "scheduled.confirmed": () => "Você confirmou uma transação agendada",
  "scheduled.skipped": () => "Você pulou a ocorrência do mês",
  "scheduled.deleted": () => "Você encerrou uma série de agendamento",
  "recurring.created": () => "Você cadastrou uma nova recorrência",
  "recurring.paused": () => "Você pausou uma recorrência",
  "recurring.ended": () => "Você encerrou uma recorrência",
  "recurring.occurrence_upcoming": () => "Próxima ocorrência de recorrência",
  "import.completed": (p) =>
    `Você importou a fatura ${p.institutionName ?? ""} — ${p.count ?? 0} transações`,
  "invite.created": (p) => `Você enviou convite para ${p.inviteeEmail ?? ""}`,
  "invite.deleted": (p) =>
    `Você excluiu o convite para ${p.inviteeEmail ?? ""}`,
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
  "admin.access_approved": (p) =>
    `Você aprovou ${p.kind === "invite" ? "o convite" : "o acesso"} de ${p.email ?? ""}`,
  "admin.access_rejected": (p) =>
    `Você recusou ${p.kind === "invite" ? "o convite" : "o acesso"} de ${p.email ?? ""}`,
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
  if (type === "calendar.global_entry") return "🗓️";
  if (type.startsWith("card.invoice")) return "🧾";
  if (type.startsWith("account") || type.startsWith("card")) return "🏦";
  if (type.startsWith("transaction")) return "💸";
  if (type.startsWith("scheduled")) return "⏰";
  if (type.startsWith("recurring")) return "🔁";
  if (type.startsWith("import")) return "📥";
  if (type.startsWith("admin")) return "🛡️";
  // connection.*/share.*/portador.*: eventos sobre outra pessoa.
  return "🤝";
}

function eventVariant(type: DomainEventType): AlertVariant {
  if (type.endsWith("over_limit_entered")) return "warning";
  if (type.endsWith("over_limit_cleared")) return "success";
  if (type === "card.invoice_due") return "warning";
  if (type === "admin.access_rejected") return "warning";
  return "info";
}

export interface TimelineEventGroupRowProps {
  type: DomainEventType;
  payload: DomainEventPayload;
  count: number;
}

/** Collapses a run of ≥3 consecutive same-type audit/structural events (e.g.
 * several "Você removeu uma transação" rows in a row) into one demoted line,
 * so real money movements stay visually dominant on busy days — a day full
 * of routine audit events was outweighing the day's actual transactions.
 * Reuses the exact catalog copy from EVENT_TEXT (same wording, same tone),
 * just count-prefixed, so there's no separate plural catalog to maintain. */
export function TimelineEventGroupRow({
  type,
  payload,
  count,
}: TimelineEventGroupRowProps) {
  const renderText = EVENT_TEXT[type] ?? (() => "Um evento aconteceu.");
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-[.75rem] text-[var(--lr-text-secondary)]">
      <span aria-hidden="true">{eventEmoji(type)}</span>
      <span>
        {count}× {renderText(payload)}
      </span>
    </div>
  );
}

/**
 * Lurem's generic structural timeline event line. Dumb component: reads a
 * `type` + loosely-typed `payload` and renders one of the catalog's
 * pt-BR copy templates (IMPLEMENTACAO.md §6, BACKLOG US-2.4) as an Alert.
 * Invoice alerts use layout="box" with action buttons; others are inline.
 */
export function TimelineEventRow({
  type,
  payload,
  aggregateId,
  onCloseInvoice,
  onPayInvoice,
}: TimelineEventRowProps) {
  const renderText = EVENT_TEXT[type] ?? (() => "Um evento aconteceu.");

  // Invoice alerts: use box layout with action buttons
  if (type === "card.invoice_closing_upcoming") {
    return (
      <Alert
        layout="box"
        variant="info"
        emoji={eventEmoji(type)}
        title={renderText(payload)}
        actions={
          onCloseInvoice && aggregateId
            ? [
                {
                  label: "Fechar fatura",
                  onClick: () => onCloseInvoice(aggregateId),
                  variant: "secondary",
                },
              ]
            : undefined
        }
      />
    );
  }

  if (type === "card.invoice_due_upcoming") {
    return (
      <Alert
        layout="box"
        variant="warning"
        emoji={eventEmoji(type)}
        title={renderText(payload)}
        actions={
          onPayInvoice && aggregateId
            ? [
                {
                  label: "Pagar fatura",
                  onClick: () => onPayInvoice(aggregateId),
                  variant: "secondary",
                },
              ]
            : undefined
        }
      />
    );
  }

  // All other events: inline layout, no actions
  return (
    <Alert
      layout="inline"
      variant={eventVariant(type)}
      emoji={eventEmoji(type)}
      title={renderText(payload)}
    />
  );
}
