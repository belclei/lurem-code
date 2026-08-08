import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransferPairCard } from "./TransferPairCard";

const meta: Meta<typeof TransferPairCard> = {
  title: "Componentes/TransferPairCard",
  component: TransferPairCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Par de transferência entre contas do usuário (TIMELINE.md §5d) — duas pernas " +
          "(saída/entrada) da mesma transferência, colapsadas em um único card.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TransferPairCard>;

export const ComLogo: Story = {
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransferPairCard
        amountCents={90000}
        from={{
          name: "Conta corrente",
          institution: "Itaú",
          logoUrl: "/ui-tokens/institutions/itau.svg",
          balanceAfterCents: 340000,
        }}
        to={{
          name: "Poupança",
          institution: "Nubank",
          logoUrl: "/ui-tokens/institutions/nubank.svg",
          balanceAfterCents: 120000,
        }}
      />
    </div>
  ),
};

export const SemLogo: Story = {
  name: "Sem logo (fallback com inicial)",
  render: () => (
    <div style={{ width: "28rem" }}>
      <TransferPairCard
        amountCents={45000}
        from={{
          name: "Conta corrente",
          institution: "C6 Bank",
          balanceAfterCents: 80000,
        }}
        to={{
          name: "Cartão Inter",
          institution: "Inter",
          balanceAfterCents: -120000,
        }}
      />
    </div>
  ),
};
