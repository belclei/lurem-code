import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BADGE_STATUS_LABEL,
  Badge,
  type BadgeCategoryColor,
  type BadgeStatus,
} from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Componentes/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Duas variações: `status` (ativo/inativo/pendente) e `category` " +
          "(cor definida por quem chama, a partir do dado da categoria — o Badge só pinta).",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

const STATUSES: BadgeStatus[] = [
  "active",
  "inactive",
  "pending",
  "alert",
  "estimate",
];
const CATEGORY_COLORS: { color: BadgeCategoryColor; label: string }[] = [
  { color: "blue", label: "Moradia" },
  { color: "sage", label: "Mercado" },
  { color: "sand", label: "Lazer" },
  { color: "clay", label: "Saúde" },
  { color: "ink", label: "Outros" },
];

export const Status: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem" }}>
      {STATUSES.map((status) => (
        <Badge key={status} kind="status" status={status}>
          {BADGE_STATUS_LABEL[status]}
        </Badge>
      ))}
    </div>
  ),
};

export const Categoria: Story = {
  name: "Category",
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      {CATEGORY_COLORS.map(({ color, label }) => (
        <Badge key={color} kind="category" color={color}>
          {label}
        </Badge>
      ))}
    </div>
  ),
};

/**
 * index.html id="badge": "sem categoria" é estado legítimo (categoria é
 * opcional na transação, §6.5) — nunca um erro; "sugerida pela IA" é sempre
 * tracejada até confirmação humana; "removível" mostra o × de remoção.
 */
export const CategoriaEstadosEspeciais: Story = {
  name: "Category — sem categoria, sugerida, removível",
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <Badge kind="category" color="ink" none>
        Sem categoria
      </Badge>
      <Badge kind="category" color="blue" suggested>
        Alimentação · sugerida
      </Badge>
      <Badge
        kind="category"
        color="clay"
        onRemove={() => {}}
        removeLabel="Remover categoria Transporte"
      >
        Transporte
      </Badge>
    </div>
  ),
};
