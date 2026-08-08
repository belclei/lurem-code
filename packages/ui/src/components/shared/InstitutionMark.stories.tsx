import type { Meta, StoryObj } from "@storybook/react-vite";
import { InstitutionMark } from "./InstitutionMark";

const meta: Meta<typeof InstitutionMark> = {
  title: "Componentes/InstitutionMark",
  component: InstitutionMark,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Logo de instituição (ou inicial em cor de marca, sem logo) — usado por " +
          "TransferPairCard e pela lista de contas do aside da Timeline (§6.4).",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof InstitutionMark>;

export const Fallback: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <InstitutionMark name="Itaú" size="md" />
      <InstitutionMark name="Nubank" size="sm" />
      <InstitutionMark name="Carteira" tone="gold" size="md" />
      <InstitutionMark name="Carteira" tone="gold" size="sm" />
    </div>
  ),
};

export const ComLogo: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <InstitutionMark
        name="Itaú"
        logoUrl="/ui-tokens/institutions/itau.svg"
        size="md"
      />
      <InstitutionMark
        name="Itaú"
        logoUrl="/ui-tokens/institutions/itau.svg"
        size="sm"
      />
    </div>
  ),
};
