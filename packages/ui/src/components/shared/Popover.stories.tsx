import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Popover } from "./Popover";

const meta: Meta<typeof Popover> = {
  title: "Componentes/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Trigger + painel flutuante — mesmo idioma de abrir/fechar do " +
          "Select/AffixMenu (ref + onBlur, sem portal), sem campo de busca. " +
          "Usado pelos filtros de toolbar da Timeline.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Popover>;

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      label="Filtrar por período"
      triggerLabel="Este mês"
      open={open}
      onOpenChange={setOpen}
    >
      <div
        style={{
          width: "14rem",
          padding: "0.75rem",
          borderRadius: "var(--lr-r-md)",
          border: "1px solid var(--lr-border)",
          background: "var(--lr-surface)",
          boxShadow: "var(--lr-e2)",
        }}
      >
        Conteúdo do painel
      </div>
    </Popover>
  );
}

export const Playground: Story = {
  render: () => <Controlled />,
};
