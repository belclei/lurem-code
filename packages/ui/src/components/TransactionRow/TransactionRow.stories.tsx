// packages/ui/src/components/TransactionRow/TransactionRow.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { InstitutionMark } from "../shared/InstitutionMark";
import { TransactionRow } from "./TransactionRow";

const meta: Meta<typeof TransactionRow> = {
  title: "Componentes/TransactionRow",
  component: TransactionRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Unified transaction row — expandable card supporting default/transfer/installment/scheduled variants. " +
          "Collapsed by default; expands to show details and action buttons.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TransactionRow>;

export const Manual: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="default"
        description="Supermercado Extra"
        date="2026-07-20T12:00:00.000Z"
        kind="expense"
        amountCents={18790}
        source="manual"
        categoryEmoji="🍽️"
        categoryName="Alimentação"
        expanded={false}
      />
    </div>
  ),
};

export const ManualExpanded: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="default"
        description="Supermercado Extra"
        date="2026-07-20T12:00:00.000Z"
        kind="expense"
        amountCents={18790}
        source="manual"
        categoryEmoji="🍽️"
        categoryName="Alimentação"
        expanded={true}
        onToggleExpand={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
};

export const Importada: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="default"
        description="Salário"
        date="2026-07-05T12:00:00.000Z"
        kind="income"
        amountCents={520000}
        source="import"
        categoryEmoji="💰"
        categoryName="Renda"
        expanded={false}
      />
    </div>
  ),
};

export const Transferencia: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="transfer"
        description="PIX entre contas"
        date="2026-07-18T12:00:00.000Z"
        kind="transfer"
        amountCents={30000}
        source="manual"
        categoryEmoji="🔀"
        categoryName="Transferência"
        expanded={false}
      />
    </div>
  ),
};

export const Agendada: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="scheduled"
        isScheduled={true}
        description="Aluguel"
        date="2026-08-10T12:00:00.000Z"
        kind="expense"
        amountCents={180000}
        source="manual"
        categoryEmoji="🏠"
        categoryName="Moradia"
        expanded={false}
      />
    </div>
  ),
};

export const AgendadaExpandida: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="scheduled"
        isScheduled={true}
        description="Aluguel"
        date="2026-08-10T12:00:00.000Z"
        kind="expense"
        amountCents={180000}
        source="manual"
        categoryEmoji="🏠"
        categoryName="Moradia"
        expanded={true}
        onToggleExpand={() => {}}
        onConfirm={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
};

export const ContaVsCartao: Story = {
  name: "Conta vs. cartão (mesma instituição)",
  render: () => (
    <div
      style={{
        width: "28rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <TransactionRow
        variant="default"
        description="Supermercado Extra"
        date="2026-07-20T12:00:00.000Z"
        kind="expense"
        amountCents={18790}
        source="manual"
        categoryEmoji="🍽️"
        categoryName="Alimentação"
        institutionMark={
          <InstitutionMark name="Nubank" size="sm" kind="account" />
        }
        expanded={false}
      />
      <TransactionRow
        variant="default"
        description="Fatura Nubank — parcela"
        date="2026-07-20T12:00:00.000Z"
        kind="expense"
        amountCents={45000}
        source="manual"
        categoryEmoji="🛍️"
        categoryName="Compras"
        institutionMark={
          <InstitutionMark name="Nubank" size="sm" kind="card" />
        }
        expanded={false}
      />
    </div>
  ),
};

export const Selecionavel: Story = {
  name: "Selecionável (marcada / desmarcada)",
  render: () => (
    <div
      style={{
        width: "28rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <TransactionRow
        variant="default"
        description="Supermercado Extra"
        date="2026-07-20T12:00:00.000Z"
        kind="expense"
        amountCents={18790}
        source="manual"
        categoryEmoji="🍽️"
        categoryName="Alimentação"
        categoryColorToken="--lr-negative-500"
        expanded={false}
        selected={false}
        onToggleSelect={() => {}}
      />
      <TransactionRow
        variant="default"
        description="Salário"
        date="2026-07-05T12:00:00.000Z"
        kind="income"
        amountCents={520000}
        source="manual"
        categoryEmoji="💰"
        categoryName="Renda"
        categoryColorToken="--lr-petrol-600"
        expanded={false}
        selected={true}
        onToggleSelect={() => {}}
      />
    </div>
  ),
};
