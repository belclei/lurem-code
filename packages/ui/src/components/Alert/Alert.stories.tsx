import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, type AlertVariant } from "./Alert";

const meta: Meta<typeof Alert> = {
  title: "Componentes/Alert",
  component: Alert,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Notificação inline com ícone, título, descrição e botão de fechar opcional. " +
          "Componente burro: só avisa que o usuário pediu para fechar, via `onClose`.",
      },
    },
  },
  args: {
    variant: "info",
    title: "Conexão com o banco atualizada",
    description: "Os últimos lançamentos foram importados com sucesso.",
    onClose: () => {},
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warning", "error"],
    },
    layout: {
      control: "select",
      options: ["box", "inline"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Playground: Story = {};

const COPY: Record<AlertVariant, { title: string; description: string }> = {
  info: {
    title: "Conexão com o banco atualizada",
    description: "Os últimos lançamentos foram importados com sucesso.",
  },
  success: {
    title: "Transação confirmada",
    description: "O lançamento de R$ 240,00 foi validado por Ana.",
  },
  warning: {
    title: "Fatura próxima do limite",
    description: "Você já usou 92% do limite do cartão Nubank neste ciclo.",
  },
  error: {
    title: "Não foi possível sincronizar",
    description:
      "A conexão com o Itaú expirou. Reconecte para continuar importando.",
  },
};

/** As 4 variantes exigidas por US-1.8, cada uma com ícone + título + descrição + botão fechar. */
export const Variantes: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem", width: "26rem" }}>
      {(Object.keys(COPY) as AlertVariant[]).map((variant) => (
        <Alert
          key={variant}
          variant={variant}
          {...COPY[variant]}
          onClose={() => {}}
        />
      ))}
    </div>
  ),
};

export const SemBotaoFechar: Story = {
  name: "Sem botão de fechar",
  args: { onClose: undefined },
};

/**
 * `layout="inline"`: sem fundo/padding, do tamanho de um texto de apoio —
 * para uma mensagem que vive dentro de outro componente (ex.: o erro de um
 * campo, ver Input/FieldMessage) em vez de se anunciar como um bloco à parte.
 * Nunca renderiza `actions`/`onClose`.
 */
export const Inline: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "0.75rem", width: "22rem" }}>
      {(Object.keys(COPY) as AlertVariant[]).map((variant) => (
        <Alert
          key={variant}
          variant={variant}
          layout="inline"
          title={COPY[variant].title}
        />
      ))}
    </div>
  ),
};

/**
 * index.html id="alerta", "Com ação à direita": até 2 botões `ghost`/
 * `secondary` (nunca preenchido) à direita do texto. Com duas ações, a mais
 * provável fica por último (mais à direita).
 */
export const ComAcoes: Story = {
  name: "Com ações",
  render: () => (
    <div style={{ display: "grid", gap: "1rem", width: "26rem" }}>
      <Alert
        variant="success"
        title="Fatura Nubank de julho importada"
        description="34 transações confirmadas. Saldos recalculados."
        actions={[{ label: "Ver na timeline", onClick: () => {} }]}
      />
      <Alert
        variant="warning"
        title="A conta de luz veio R$ 70 acima da referência"
        description="R$ 220,00 contra R$ 150,00 previstos. Quer atualizar o valor de referência da recorrência?"
        actions={[
          { label: "Manter R$ 150", onClick: () => {} },
          {
            label: "Atualizar para R$ 220",
            onClick: () => {},
            variant: "secondary",
          },
        ]}
      />
    </div>
  ),
};

/** index.html id="alerta", "Dispensável": ação e botão de fechar coexistem — o fechar fica no canto superior direito, as ações continuam centradas na vertical. */
export const ComAcoesEFechar: Story = {
  name: "Com ações e botão de fechar",
  render: () => (
    <div style={{ width: "26rem" }}>
      <Alert
        variant="info"
        title="Você tem 3 recorrências sem confirmar este mês"
        description="Confirme para o Disponível Hoje refletir o que já saiu."
        actions={[
          {
            label: "Revisar recorrências",
            onClick: () => {},
            variant: "secondary",
          },
        ]}
        onClose={() => {}}
      />
    </div>
  ),
};

/** index.html id="alerta", "Estreito": abaixo de 560px as ações empilham sob o texto, alinhadas à esquerda (não centradas sob o ícone). */
export const Estreito: Story = {
  render: () => (
    // `width`, not `maxWidth`: Alert's own @container div has
    // `container-type: inline-size`, which per the CSS Containment spec
    // strips it from intrinsic (shrink-to-fit) sizing — inside Storybook's
    // flex-centered layout, a `maxWidth`-only wrapper has no content-based
    // width to cap, so it collapses to 0 instead of 380px.
    <div style={{ width: "380px" }}>
      <Alert
        variant="warning"
        title="Saldo abaixo do limite"
        description="A conta Itaú está a R$ 88 de estourar o cheque especial."
        actions={[
          { label: "Ignorar", onClick: () => {} },
          {
            label: "Ver conta",
            onClick: () => {},
            variant: "secondary",
          },
        ]}
      />
    </div>
  ),
};

/** `emoji` substitui o ícone svg no mesmo slot/tamanho — usado pelo alerta de aniversário da Timeline. */
export const ComEmoji: Story = {
  name: "Com emoji",
  render: () => (
    <div style={{ display: "grid", gap: "0.75rem", width: "22rem" }}>
      <Alert
        variant="success"
        emoji="🥳"
        title="Seu aniversário é dia 15!"
        description="Parabéns antecipados — só mais uma semana."
      />
      <Alert
        variant="success"
        layout="inline"
        emoji="🥳"
        title="Feliz aniversário!"
      />
    </div>
  ),
};
