// apps/web/src/routes/timeline/eventTypeGroups.ts
// ARQUITETURA.md §6.12 item 3: a Timeline filtra por tipo de evento além de
// conta/cartão. `DomainEvent.type` tem 35 valores concretos (TimelineEventRow's
// catalog) — granular demais pra um filtro; agrupados nas mesmas famílias que
// TimelineEventRow já usa pra ícone (eventIcon()), então o rótulo do filtro e o
// ícone que o usuário vê na lista sempre concordam. "transaction" é o
// pseudo-tipo que GET /v1/timeline usa pra alternar as `Transaction` reais
// (que não são DomainEvent) — ver apps/api/src/timeline/routes.ts.
export interface EventTypeGroup {
  id: string;
  label: string;
  types: string[];
}

export const EVENT_TYPE_GROUPS: EventTypeGroup[] = [
  { id: "transaction", label: "Transações", types: ["transaction"] },
  {
    id: "account_card",
    label: "Contas e cartões",
    types: [
      "account.created",
      "account.updated",
      "account.balance_adjusted",
      "account.over_limit_entered",
      "account.over_limit_cleared",
      "card.created",
      "card.updated",
      "card.over_limit_entered",
      "card.over_limit_cleared",
      "card.invoice_closed",
      "card.invoice_due",
    ],
  },
  {
    id: "scheduled",
    label: "Agendadas",
    types: ["scheduled.confirmed", "scheduled.skipped", "scheduled.deleted"],
  },
  {
    id: "recurring",
    label: "Recorrências",
    types: ["recurring.created", "recurring.paused", "recurring.ended"],
  },
  { id: "import", label: "Importação", types: ["import.completed"] },
  {
    id: "connections",
    label: "Conexões e portador",
    types: [
      "invite.created",
      "invite.deleted",
      "invite.resent",
      "connection.requested",
      "connection.accepted",
      "connection.rejected",
      "connection.deleted",
      "connection.resent",
      "share.granted",
      "share.permission_changed",
      "share.revoked",
      "portador.assigned",
      "portador.accepted",
      "portador.rejected",
      "portador.settled",
    ],
  },
];
