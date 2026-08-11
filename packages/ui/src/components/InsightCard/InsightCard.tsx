import type { Money } from "@lurem/domain";
import { useState } from "react";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { formatMoney } from "../shared/formatMoney";
import { Breakdown } from "./Breakdown";

export interface InsightCardProps {
  /** "Disponível Hoje" | "Previsão fim do mês" | "Patrimônio Total" (§6.9) — any label, this component doesn't special-case the three. */
  title: string;
  money: Money;
  /** Storybook-only escape hatch to render the "expandido" state without a click. Real screens always start closed. */
  defaultExpanded?: boolean;
}

/**
 * Lurem's dashboard hero card: one value + its explainable breakdown
 * (§6.9 "explicabilidade acima de autoridade"). Dumb component — `money`
 * arrives fully computed from `packages/core`; this only renders it.
 */
export function InsightCard({
  title,
  money,
  defaultExpanded = false,
}: InsightCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card>
      <Body muted className="text-[.8125rem]">
        {title}
      </Body>
      <Mono
        variant="number"
        tone={money.valueCents < 0 ? "out" : "default"}
        className="mt-1 block text-[2rem]"
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
