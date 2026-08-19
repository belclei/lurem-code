import type { Meta, StoryObj } from "@storybook/react-vite";
import { StagingReviewRow } from "./StagingReviewRow";

const meta: Meta<typeof StagingReviewRow> = {
  title: "Componentes/StagingReviewRow",
  component: StagingReviewRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Linha de revisão de importação (IMPLEMENTACAO.md §10.1b item 8, §6.8 arq). " +
          "Todo campo editável já vem ativo — sem alternar pra um modo de edição.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof StagingReviewRow>;

const CATEGORY_OPTIONS = [
  { value: "transporte", label: "Transporte" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "assinaturas", label: "Assinaturas" },
];

export const Pending: Story = {
  render: () => (
    <div style={{ width: "30rem" }}>
      <StagingReviewRow
        description="Uber"
        onDescriptionChange={() => {}}
        amount="28,90"
        onAmountChange={() => {}}
        categoryOptions={CATEGORY_OPTIONS}
        categoryId="transporte"
        onCategoryIdChange={() => {}}
        tagNames={[]}
        onTagNamesChange={() => {}}
        date="2026-07-20"
        confidence={0.6}
        status="pending"
        onConfirm={() => {}}
        onReject={() => {}}
      />
    </div>
  ),
};

export const BaixaConfianca: Story = {
  render: () => (
    <div style={{ width: "30rem" }}>
      <StagingReviewRow
        description="Supermercado Extra"
        onDescriptionChange={() => {}}
        amount="187,90"
        onAmountChange={() => {}}
        categoryOptions={CATEGORY_OPTIONS}
        categoryId="alimentacao"
        onCategoryIdChange={() => {}}
        tagNames={["mercado"]}
        onTagNamesChange={() => {}}
        tagSuggestions={["mercado", "uber", "trabalho"]}
        date="2026-07-20"
        confidence={0.35}
        status="pending"
        onConfirm={() => {}}
        onReject={() => {}}
      />
    </div>
  ),
};

export const Duplicata: Story = {
  render: () => (
    <div style={{ width: "30rem" }}>
      <StagingReviewRow
        description="Netflix"
        onDescriptionChange={() => {}}
        amount="39,90"
        onAmountChange={() => {}}
        categoryOptions={CATEGORY_OPTIONS}
        categoryId="assinaturas"
        onCategoryIdChange={() => {}}
        tagNames={[]}
        onTagNamesChange={() => {}}
        date="2026-07-05"
        confidence={0.95}
        status="pending"
        duplicateDescription="Já existe: Netflix · 05/07/2026 · R$ 39,90"
        onConfirm={() => {}}
        onReject={() => {}}
        onReplace={() => {}}
      />
    </div>
  ),
};

export const Confirmed: Story = {
  render: () => (
    <div style={{ width: "30rem" }}>
      <StagingReviewRow
        description="Salário"
        onDescriptionChange={() => {}}
        amount="5200,00"
        onAmountChange={() => {}}
        categoryOptions={CATEGORY_OPTIONS}
        categoryId={null}
        onCategoryIdChange={() => {}}
        tagNames={[]}
        onTagNamesChange={() => {}}
        date="2026-07-05"
        confidence={0.95}
        status="confirmed"
      />
    </div>
  ),
};

export const Rejected: Story = {
  render: () => (
    <div style={{ width: "30rem" }}>
      <StagingReviewRow
        description="Estorno não reconhecido"
        onDescriptionChange={() => {}}
        amount="50,00"
        onAmountChange={() => {}}
        categoryOptions={CATEGORY_OPTIONS}
        categoryId={null}
        onCategoryIdChange={() => {}}
        tagNames={[]}
        onTagNamesChange={() => {}}
        date="2026-07-12"
        confidence={0.2}
        status="rejected"
      />
    </div>
  ),
};
