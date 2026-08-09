import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DateField } from "./DateField";

const meta: Meta<typeof DateField> = {
  title: "Componentes/DateField",
  component: DateField,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Campo de data: trigger no estilo de Input que abre um Calendar " +
          "(modo single) num painel absoluto — mesmo idioma de abrir/fechar " +
          "do Select (ref + onBlur, sem portal). Substitui o padrão antigo de " +
          'Input type="text" hint="AAAA-MM-DD" usado em todo campo de data.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DateField>;

function Controlled(props: { initial?: string } & Record<string, unknown>) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <div style={{ width: "18rem" }}>
      <DateField
        label="Data de nascimento"
        {...props}
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <Controlled />,
};

export const ComValorSelecionado: Story = {
  name: "Com valor selecionado",
  render: () => <Controlled initial="2026-08-08" />,
};

export const ComErro: Story = {
  name: "Com erro",
  render: () => <Controlled error="Informe uma data válida." />,
};

export const Desabilitado: Story = {
  render: () => <Controlled disabled initial="2026-08-08" />,
};
