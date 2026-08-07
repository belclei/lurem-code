import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryIcon } from "./CategoryIcon";

const meta: Meta<typeof CategoryIcon> = {
  component: CategoryIcon,
  title: "Components/CategoryIcon",
};

export default meta;
type Story = StoryObj<typeof meta>;

const SLUGS = [
  "hm-cat-alimentacao",
  "hm-cat-moradia",
  "hm-cat-transporte",
  "hm-cat-saude",
  "hm-cat-lazer",
  "hm-cat-servicos",
  "hm-cat-compras",
  "hm-cat-renda",
  "hm-cat-impostos",
  "hm-cat-dividas",
  "hm-cat-poupanca",
  "hm-cat-doacoes",
  "hm-cat-assinaturas",
  "hm-cat-transferencia",
];

export const AllIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 p-6">
      {SLUGS.map((slug) => (
        <div key={slug} className="flex flex-col items-center gap-2">
          <CategoryIcon slug={slug} className="h-8 w-8" />
          <span className="text-xs text-[var(--lr-text-secondary)]">
            {slug}
          </span>
        </div>
      ))}
    </div>
  ),
};

export const Single: Story = {
  args: { slug: "hm-cat-alimentacao" },
};
