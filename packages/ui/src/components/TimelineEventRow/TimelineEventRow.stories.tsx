import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type DomainEventPayload,
  type DomainEventType,
  TimelineEventRow,
} from "./TimelineEventRow";

const meta: Meta<typeof TimelineEventRow> = {
  title: "Componentes/TimelineEventRow",
  component: TimelineEventRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Linha de evento estrutural genérico da Timeline (IMPLEMENTACAO.md §10.1b item 5, catálogo §6). " +
          "Cobre os 35 tipos de DomainEvent despachados para a timeline (BACKLOG US-2.4).",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TimelineEventRow>;

const SAMPLES: Array<{ type: DomainEventType; payload: DomainEventPayload }> = [
  { type: "account.created", payload: { institutionName: "Nubank" } },
  {
    type: "account.updated",
    payload: { institutionName: "Itaú", changed: ["overdraftLimitCents"] },
  },
  {
    type: "account.balance_adjusted",
    payload: { institutionName: "Bradesco" },
  },
  {
    type: "account.over_limit_entered",
    payload: { institutionName: "Nubank", balanceCents: 34000 },
  },
  {
    type: "account.over_limit_cleared",
    payload: { institutionName: "Nubank" },
  },
  { type: "card.created", payload: { institutionName: "C6 Bank" } },
  { type: "card.updated", payload: { institutionName: "C6 Bank" } },
  {
    type: "card.over_limit_entered",
    payload: {
      institutionName: "Inter",
      usedCents: 590000,
      limitCents: 500000,
    },
  },
  { type: "card.over_limit_cleared", payload: { institutionName: "Inter" } },
  {
    type: "card.invoice_closed",
    payload: {
      institutionName: "Itaú",
      totalCents: 234050,
      dueDate: "2026-08-10T12:00:00.000Z",
    },
  },
  {
    type: "card.invoice_due",
    payload: {
      institutionName: "Itaú",
      totalCents: 234050,
      autoDebitAccountName: "Conta corrente",
    },
  },
  { type: "transaction.created", payload: {} },
  { type: "transaction.updated", payload: {} },
  { type: "transaction.deleted", payload: {} },
  { type: "scheduled.confirmed", payload: {} },
  { type: "scheduled.skipped", payload: {} },
  { type: "scheduled.deleted", payload: {} },
  { type: "recurring.created", payload: {} },
  { type: "recurring.paused", payload: {} },
  { type: "recurring.ended", payload: {} },
  {
    type: "import.completed",
    payload: { institutionName: "Nubank de julho", count: 34 },
  },
  {
    type: "invite.created",
    payload: { inviteeEmail: "maria@example.com" },
  },
  {
    type: "invite.deleted",
    payload: { inviteeEmail: "maria@example.com" },
  },
  { type: "invite.resent", payload: {} },
  { type: "connection.requested", payload: { counterpartName: "Maria" } },
  { type: "connection.accepted", payload: { counterpartName: "Maria" } },
  { type: "connection.rejected", payload: { counterpartName: "Maria" } },
  { type: "connection.deleted", payload: { counterpartName: "Maria" } },
  { type: "connection.resent", payload: { counterpartName: "Maria" } },
  {
    type: "share.granted",
    payload: {
      counterpartName: "Maria",
      itemLabel: "Conta Nubank",
      permission: "view",
    },
  },
  {
    type: "share.permission_changed",
    payload: { counterpartName: "Maria", itemLabel: "Conta Nubank" },
  },
  {
    type: "share.revoked",
    payload: { counterpartName: "Maria", itemLabel: "Conta Nubank" },
  },
  { type: "portador.assigned", payload: { counterpartName: "Maria" } },
  { type: "portador.accepted", payload: { counterpartName: "Maria" } },
  { type: "portador.rejected", payload: { counterpartName: "Maria" } },
  { type: "portador.settled", payload: { counterpartName: "Maria" } },
];

export const CatalogoCompleto: Story = {
  render: () => (
    <div style={{ width: "32rem", display: "flex", flexDirection: "column" }}>
      {SAMPLES.map((sample) => (
        <TimelineEventRow key={sample.type} {...sample} />
      ))}
    </div>
  ),
};

export const Playground: Story = {
  args: {
    type: "account.created",
    payload: { institutionName: "Nubank" },
  },
  render: (args) => (
    <div style={{ width: "32rem" }}>
      <TimelineEventRow {...args} />
    </div>
  ),
};
