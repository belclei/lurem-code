// packages/ui/src/components/TransactionRow/TransactionRow.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransactionRow } from "./TransactionRow";

const meta: Meta<typeof TransactionRow> = {
  title: "Componentes/TransactionRow",
  component: TransactionRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Linha de transação — 5 variantes (IMPLEMENTACAO.md §10.1b item 4, §6.6 arq). " +
          "Manual/importada compartilham o variant `default`, distinguidas só pela tag `source`.",
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
        categoryLabel="Alimentação"
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
        categoryLabel="Salário"
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
        transferToLabel="Poupança Itaú"
      />
    </div>
  ),
};

export const ParceladaFechada: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="installment"
        description="Notebook Dell"
        date="2026-05-10T12:00:00.000Z"
        kind="expense"
        amountCents={45000}
        source="manual"
        categoryLabel="Compras"
        installment={{
          originalAmountCents: 450000,
          originalDate: "2026-05-10T12:00:00.000Z",
          installmentNumber: 3,
          installmentTotal: 10,
          paidCount: 3,
          paidAmountCents: 135000,
          remainingCount: 7,
          remainingAmountCents: 315000,
          nextInstallmentDate: "2026-08-10T12:00:00.000Z",
          payoffDate: "2027-02-10T12:00:00.000Z",
        }}
      />
    </div>
  ),
};

export const ParceladaExpandida: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="installment"
        expanded
        description="Notebook Dell"
        date="2026-05-10T12:00:00.000Z"
        kind="expense"
        amountCents={45000}
        source="manual"
        categoryLabel="Compras"
        onViewAllInstallments={() => {}}
        onEdit={() => {}}
        installment={{
          originalAmountCents: 450000,
          originalDate: "2026-05-10T12:00:00.000Z",
          installmentNumber: 3,
          installmentTotal: 10,
          paidCount: 3,
          paidAmountCents: 135000,
          remainingCount: 7,
          remainingAmountCents: 315000,
          nextInstallmentDate: "2026-08-10T12:00:00.000Z",
          payoffDate: "2027-02-10T12:00:00.000Z",
        }}
      />
    </div>
  ),
};

export const Agendada: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransactionRow
        variant="scheduled"
        description="Aluguel"
        date="2026-08-10T12:00:00.000Z"
        kind="expense"
        amountCents={180000}
        source="manual"
        categoryLabel="Moradia"
        onConfirm={() => {}}
        onEdit={() => {}}
        onSkip={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
};
