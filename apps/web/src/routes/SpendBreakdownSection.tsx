// apps/web/src/routes/SpendBreakdownSection.tsx
// Parte 3 spec — "% de gastos por categoria" / "% de gastos por tag" na
// Análise. Forma escolhida via skill dataviz: lista de barras horizontais
// ranqueadas por %, não pizza/donut/empilhado — com 10 categorias fixas e
// tags que podem chegar a dezenas, ambas passam do teto seguro de ~7-8
// séries categóricas (ver relatório da spec). Bespoke a esta tela (não
// promovido a packages/ui): é a única visualização desse tipo no produto
// hoje, mesmo critério já aplicado ao HeroCard de DashboardView.tsx.
import { Body, Calendar, Popover } from "@lurem/ui";
import type { CalendarRange } from "@lurem/ui";
import { formatMoney } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetchJson } from "../auth/api-client";
import { periodLabel, thisMonthRange, toYmd } from "./timeline/dateHelpers";

interface SpendBreakdownItem {
  id: string;
  label: string;
  colorToken: string | null;
  amountCents: number;
  percentage: number;
}

// Category rows reuse the category's own colorToken (same hue already
// shown on the transaction card's left border) — recognition over a new
// palette. Tags have no identity color of their own: only rank matters, so
// the top row gets one accent hue and the rest fall back to neutral —
// never a generated per-row hue (dataviz skill: "never solve too-many-
// series by generating more hues").
function barColor(
  mode: "category" | "tag",
  item: SpendBreakdownItem,
  index: number,
): string {
  if (mode === "category") {
    return item.colorToken ? `var(${item.colorToken})` : "var(--lr-night-300)";
  }
  return index === 0 ? "var(--lr-petrol-600)" : "var(--lr-night-300)";
}

function BreakdownList({
  mode,
  items,
  emptyMessage,
  isError,
}: {
  mode: "category" | "tag";
  items: SpendBreakdownItem[];
  emptyMessage: string;
  isError: boolean;
}) {
  // A failed request and a genuinely empty period must never look the
  // same — "Sem despesas no período" reads as reassuring fact, not error,
  // so a silently-failed query would misreport real spending as zero.
  if (isError) {
    return (
      <p className="text-[.8125rem] text-[var(--lr-negative)]">
        Não foi possível carregar esses dados.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-[.8125rem] text-[var(--lr-text-secondary)]">
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={item.id}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[.8125rem]">
            <Body as="span" className="truncate">
              {mode === "tag" ? `#${item.label}` : item.label}
            </Body>
            <Body as="span" muted className="flex-none">
              {formatMoney(item.amountCents)} ·{" "}
              {item.percentage.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              %
            </Body>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-[var(--lr-r-full)] bg-[var(--lr-surface-sunken)]"
            role="img"
            aria-label={`${item.label}: ${item.percentage.toFixed(1)}% do gasto, ${formatMoney(item.amountCents)}`}
          >
            <div
              className="h-full rounded-[var(--lr-r-full)]"
              style={{
                width: `${Math.min(item.percentage, 100)}%`,
                backgroundColor: barColor(mode, item, index),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SpendBreakdownSection() {
  const [periodRange, setPeriodRange] = useState<CalendarRange>(
    thisMonthRange(),
  );
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [periodOpen, setPeriodOpen] = useState(false);

  const from = periodRange.from ? toYmd(periodRange.from) : undefined;
  const to = periodRange.to ? toYmd(periodRange.to) : undefined;

  const categoryQuery = useQuery({
    queryKey: ["insights", "spend-breakdown", "category", from, to],
    queryFn: () =>
      apiFetchJson<SpendBreakdownItem[]>(
        `/insights/spend-breakdown?by=category${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`,
      ),
  });
  const tagQuery = useQuery({
    queryKey: ["insights", "spend-breakdown", "tag", from, to],
    queryFn: () =>
      apiFetchJson<SpendBreakdownItem[]>(
        `/insights/spend-breakdown?by=tag${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`,
      ),
  });

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[1.0625rem] font-medium text-[var(--lr-text)]">
          Composição do gasto
        </h2>
        <Popover
          label="Filtrar por período"
          triggerLabel={periodLabel(periodRange)}
          open={periodOpen}
          onOpenChange={setPeriodOpen}
        >
          <Calendar
            className="max-w-[calc(100vw-2rem)]"
            label="Selecione o período"
            mode="range"
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            selected={periodRange}
            onSelect={(value) => {
              const range = value as CalendarRange;
              setPeriodRange(range);
              if (range.from && range.to) setPeriodOpen(false);
            }}
          />
        </Popover>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
          <p className="lr-label mb-3">% por categoria</p>
          <BreakdownList
            mode="category"
            items={categoryQuery.data ?? []}
            emptyMessage="Sem despesas no período."
            isError={categoryQuery.isError}
          />
        </div>
        <div className="rounded-[var(--lr-r-lg)] border border-[var(--lr-border)] p-4">
          <p className="lr-label mb-3">% por tag</p>
          <BreakdownList
            mode="tag"
            items={tagQuery.data ?? []}
            emptyMessage="Nenhuma despesa marcada com #tag no período."
            isError={tagQuery.isError}
          />
        </div>
      </div>
    </div>
  );
}
