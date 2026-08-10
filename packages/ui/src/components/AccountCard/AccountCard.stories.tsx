import type { Meta, StoryObj } from "@storybook/react-vite";
import bradescoLogo from "../../assets/institutions/bradesco.svg";
import interLogo from "../../assets/institutions/inter.svg";
import itauLogo from "../../assets/institutions/itau.svg";
import nubankLogo from "../../assets/institutions/nubank.svg";
import { AccountCard } from "./AccountCard";

const meta: Meta<typeof AccountCard> = {
  title: "Componentes/AccountCard",
  component: AccountCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Card de resumo de conta — composto de Card/Badge/Typography (IMPLEMENTACAO.md §10.1b item 1). " +
          "`overLimit` chega via prop; o componente nunca decide sozinho se a conta está além do limite.",
      },
    },
  },
  args: {
    institutionName: "Nubank",
    logoUrl: nubankLogo,
    type: "checking",
    balanceCents: 452030,
    isActive: true,
  },
};

export default meta;
type Story = StoryObj<typeof AccountCard>;

export const Playground: Story = {
  render: (args) => (
    <div style={{ width: "32rem" }}>
      <AccountCard {...args} />
    </div>
  ),
};

export const Estados: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "0.75rem", width: "32rem" }}>
      <AccountCard
        institutionName="Nubank"
        logoUrl={nubankLogo}
        type="checking"
        balanceCents={452030}
        overdraftLimitCents={200000}
        isActive
      />
      <AccountCard
        institutionName="Itaú Unibanco"
        logoUrl={itauLogo}
        name="Conta conjunta"
        type="checking"
        balanceCents={-8000}
        isActive
      />
      <AccountCard
        institutionName="Bradesco"
        logoUrl={bradescoLogo}
        type="checking"
        balanceCents={-150000}
        overLimit
        isActive
      />
      <AccountCard
        institutionName="Banco Inter"
        logoUrl={interLogo}
        type="checking"
        balanceCents={0}
        isActive={false}
      />
      <AccountCard
        institutionName="Carteira"
        type="cash"
        balanceCents={12000}
        isActive
      />
    </div>
  ),
};
