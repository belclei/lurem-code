// apps/web/src/routes/DashboardView.tsx
// US-3.11 — apresentação pura do dashboard (§6.9). Recebe os 3 cards já
// calculados; sem fetch/estado de rede aqui (isso é do DashboardPage). O
// herói (Disponível Hoje) é bespoke para carregar a escala .lr-money--hero
// (§4.1: no máximo um número-herói por tela); os outros dois usam InsightCard.
import type { Money } from "@lurem/domain";
import { Body, Breakdown, Button, Card, InsightCard, Mono } from "@lurem/ui";
import { formatMoney } from "@lurem/ui";
import { useState } from "react";

export interface DashboardInsights {
  disponivelHoje: Money;
  previsaoFimDoMes: Money;
  patrimonioTotal: Money;
}

/**
 * O card-herói: Disponível Hoje em escala herói + decomposição expansível.
 * É o único número-herói da rota (§4.1). A afordância "de onde vem esse
 * número?" (§4.2) espelha o InsightCard, reusando o leaf Breakdown.
 */
function HeroCard({ money }: { money: Money }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="mb-4">
      <Body muted className="text-[.8125rem]">
        Disponível Hoje
      </Body>
      <Mono
        variant="number"
        tone={money.valueCents < 0 ? "out" : "default"}
        className="mt-1 block lr-money--hero"
      >
        {formatMoney(money.valueCents)}
      </Mono>
      <Button
        variant="link"
        size="sm"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="mt-2"
      >
        {expanded ? "Ocultar detalhes" : "De onde vem esse número?"}
      </Button>
      {expanded ? <Breakdown lines={money.breakdown} className="mt-3" /> : null}
    </Card>
  );
}

export function DashboardView({ insights }: { insights: DashboardInsights }) {
  return (
    <div>
      <HeroCard money={insights.disponivelHoje} />
      <div className="grid gap-4 sm:grid-cols-2">
        <InsightCard
          title="Previsão fim do mês"
          money={insights.previsaoFimDoMes}
        />
        <InsightCard
          title="Patrimônio Total"
          money={insights.patrimonioTotal}
        />
      </div>
    </div>
  );
}
