# Design: Ícones de Instituição no Componente Select

**Data:** 2026-08-16  
**Escopo:** Adicionar suporte visual a ícones no componente `Select` genérico, reutilizável em seleções de instituições (contas e cartões).

---

## Contexto

Hoje, ao criar uma conta ou cartão, o usuário escolhe uma instituição via um `Select` que mostra apenas nomes de texto. A experiência é funcional, mas perde oportunidade visual de usar os ícones (logos) que já existem no design system.

O objetivo é simples: **mostrar ícone + nome lado a lado** no `Select` quando houver assets disponíveis, mantendo total compatibilidade com seleções que não usam ícones.

---

## Design

### 1. Mudanças no Componente `Select`

**Arquivo:** `packages/ui/src/components/Select/Select.tsx`

A interface `SelectOption` ganha um campo opcional:

```typescript
export interface SelectOption<T> {
  value: T;
  label: string;
  icon?: string | React.ReactNode; // novo — caminho SVG ou componente
}
```

**Renderização:**

- **Dropdown (lista aberta):** cada item renderiza `[ícone] label`
  - Ícone: 24px × 24px, `border-radius: 4px`, margem-direita 8px
  - Padding vertical: 8px (altura total ~40px por item, mantém hit-target de 44px+)
  - Ícone alinhado à esquerda (flex row)

- **Campo (selecionado):** idem — `[ícone] label`
  - Mesmo tamanho e espaçamento
  - Facilita reconhecimento visual instant do que foi escolhido

- **Sem ícone:** comportamento atual (só label, sem mudanças visuais)

**Estilo:**

```css
.select-option-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-option-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: cover; /* caso seja <img> */
}
```

Nenhuma mudança nas props de styling existentes (`className`, `error`, `disabled`, etc).

---

### 2. Integração nas Views

**`NewAccountDialog.tsx`** (linha ~105)

Muda de:
```typescript
options={institutions.map((i) => ({ value: i.id, label: i.name }))}
```

Para:
```typescript
options={institutions.map((i) => ({ 
  value: i.id, 
  label: i.name,
  icon: i.logoAsset  // já existe em Institution
}))}
```

Mesma mudança em:
- `NewCardDialog.tsx` — seleção de instituição para novo cartão
- `EditAccountDialog.tsx` — seleção de instituição em edição (se aplicável)
- `EditCardDialog.tsx` — seleção de instituição em edição (se aplicável)

---

### 3. Dados e Assets

**Nenhuma mudança de schema ou seed necessária.**

A tabela `Institution` já possui:
- `logoAsset: String` — caminho do SVG em `packages/ui-tokens/institutions/`
- Esse asset é carregado/cacheado normalmente (CSS/SVG inline)

---

### 4. Acessibilidade

- **Ícone é decorativo:** a informação visual já está no label de texto
- **`alt=""`** ou `role="presentation"` no ícone (sem aria-label)
- **Ordem de leitura:** label (lido por leitor de tela), depois ícone (skip)
- **Tabulação:** sem mudanças — `Select` mantém seus `aria-*` existentes (listbox, option, etc)
- **Contraste:** assets de logo devem passar WCAA AA em backgrounds claros/escuros (mantém padrão do design system)

---

## Verificação

- [x] Sem breaking changes — `icon` é opcional
- [x] Reutilizável — funciona em qualquer `SelectOption` que forneça `icon`
- [x] Escalável — não restringe a futuros campos que precisem de ícone
- [x] Acessível — ícone como suporte visual, texto como fonte de verdade
- [x] Performático — assets já existem no design system, sem novos loads

---

## Implementação

1. Atualizar `SelectOption` em `Select.tsx` com prop `icon?`
2. Adicionar renderização de ícone em ambos (field + dropdown)
3. Atualizar chamadas em `NewAccountDialog.tsx`, `NewCardDialog.tsx`, etc
4. Verificar visualmente em dev (`/run`): ícones aparecem corretamente em luz/escuro
5. Testar em Firefox/Safari/mobile (ícone não quebrando layout)
6. Lint/typecheck

---

## Notas

- Se futuramente um `SelectOption` precisar de mais metadados (badge, disabled, custom renderer, etc), a estrutura aguenta naturalmente
- O `logoAsset` é sempre um caminho; carregamento/tipo é responsabilidade do CSS do design system (já funciona hoje em AccountCard, CreditCardCard, etc)
