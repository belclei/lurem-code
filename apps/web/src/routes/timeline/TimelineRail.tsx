// apps/web/src/routes/timeline/TimelineRail.tsx
// Trilho vertical da Timeline — uma linha contínua atrás da lista de dias
// (TimelineRailLine, renderizada uma vez) e uma bolinha por dia
// (TimelineRailDot, uma por <section>). Puramente visual: nenhum dos dois
// busca dados ou tem estado — ambos ancoram no mesmo deslocamento
// horizontal fixo (16px, ver Global Constraints do plano), então não
// precisam medir a altura de nada via JavaScript.

/** Linha vertical contínua atrás da lista de dias. Renderizar uma única vez
 * dentro de um contêiner com `position: relative` que envolve todos os
 * `<section>` de dia (ver TimelinePage.tsx). */
export function TimelineRailLine() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-4 top-0 bottom-0 w-px bg-[var(--lr-border)]"
    />
  );
}

/** Bolinha de um dia — hoje em dourado (maior, sem borda), os demais em tom
 * neutro (menor, com borda). Ambos os tamanhos centralizam dentro do mesmo
 * "hitbox" de 16px, então o centro visual nunca muda entre variantes.
 * Renderizar dentro de um `<section>` com `position: relative`. */
export function TimelineRailDot({ today }: { today: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute left-2 top-1 flex h-4 w-4 items-center justify-center"
    >
      <span
        className={
          today
            ? "h-3 w-3 rounded-full bg-[var(--lr-gold-500)]"
            : "h-2 w-2 rounded-full border border-[var(--lr-border)] bg-[var(--lr-surface)]"
        }
      />
    </span>
  );
}
