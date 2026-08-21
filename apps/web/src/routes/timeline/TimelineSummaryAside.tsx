// apps/web/src/routes/timeline/TimelineSummaryAside.tsx
import {
  Body,
  Card,
  InstitutionMark,
  Mono,
  Skeleton,
  formatMoney,
} from "@lurem/ui";
import { Link } from "@tanstack/react-router";
import type { AccountDto, CardDto } from "../../auth/types";
import type { DashboardInsights } from "../DashboardView";

export interface TimelineSummaryAsideProps {
  hasPendingActivation: boolean;
  netBalanceCents: number;
  accounts: AccountDto[];
  totalInvoicesCents: number;
  openInvoices: CardDto[];
  insights: DashboardInsights | undefined;
}

/** Timeline's sidebar summary (§6.12 item 6) — net balance + per-account
 * breakdown, open invoices, and "Disponível hoje". Purely presentational:
 * every number arrives already computed by the caller (queries/derived
 * values), nothing here owns a mutation or dialog. */
export function TimelineSummaryAside({
  hasPendingActivation,
  netBalanceCents,
  accounts,
  totalInvoicesCents,
  openInvoices,
  insights,
}: TimelineSummaryAsideProps) {
  if (hasPendingActivation) {
    return (
      <Card dashed className="text-center">
        <Body muted className="text-[.875rem]">
          Seus números aparecem aqui assim que carteira, contas e cartões
          estiverem cadastrados.
        </Body>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="lr-label mb-1">Saldo líquido</p>
        <Mono
          variant="number"
          tone={netBalanceCents < 0 ? "out" : "default"}
          className="text-[2rem] tracking-[-0.02em]"
        >
          {formatMoney(netBalanceCents)}
        </Mono>
        {/* §6.12 item 6 — quebra por conta/instituição sob o total. */}
        {accounts.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--lr-border)] pt-3">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5">
                <InstitutionMark
                  logoUrl={a.logoUrl}
                  name={a.institutionName}
                  tone={a.type === "cash" ? "gold" : "petrol"}
                  size="sm"
                />
                <Body
                  as="span"
                  muted
                  className="min-w-0 flex-1 truncate text-[.8125rem]"
                >
                  {a.name || a.institutionName}
                </Body>
                <Mono
                  variant="number"
                  tone={a.balanceCents < 0 ? "out" : "default"}
                  className="flex-none text-[.8125rem]"
                >
                  {formatMoney(a.balanceCents)}
                </Mono>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between">
          <Body as="span" muted>
            Faturas em aberto
          </Body>
          <Mono variant="number" tone="out" className="text-[.9375rem]">
            {totalInvoicesCents > 0 ? "− " : ""}
            {formatMoney(totalInvoicesCents)}
          </Mono>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-[var(--lr-border)] pt-3">
          <Body as="span" muted>
            Patrimônio total
          </Body>
          {insights ? (
            <Mono
              variant="number"
              tone={insights.patrimonioTotal.valueCents < 0 ? "out" : "default"}
              className="text-[.9375rem]"
            >
              {formatMoney(insights.patrimonioTotal.valueCents)}
            </Mono>
          ) : (
            <Skeleton className="h-4 w-20 rounded-[var(--lr-r-sm)]" />
          )}
        </div>
        {openInvoices.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--lr-border)] pt-3">
            {openInvoices.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2"
              >
                <Body as="span" muted className="truncate text-[.8125rem]">
                  {c.name || c.institutionName}
                </Body>
                <Mono
                  variant="number"
                  tone="out"
                  className="flex-none text-[.8125rem]"
                >
                  − {formatMoney(c.usedCents)}
                </Mono>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card sunken>
        <div className="flex items-end justify-between gap-2">
          <div>
            {/* No text-[...] override here on purpose: .lr-label's own
                11px default is the app's legibility floor — this used to
                override it down to 10px. */}
            <p className="lr-label mb-1">DISPONÍVEL HOJE</p>
            {insights ? (
              <Mono
                variant="number"
                className="text-[1.5rem] text-[var(--lr-text)]"
              >
                {formatMoney(insights.disponivelHoje.valueCents)}
              </Mono>
            ) : (
              <Skeleton className="h-7 w-28 rounded-[var(--lr-r-sm)]" />
            )}
          </div>
          {/* REBRAND (Task 1.3): blue-700 -> graphite-700 for this plain
              text link. Same open blue->graphite product question as
              Alert's info variant / Button's link variant / Badge's blue
              category color — not a settled design decision, flagging
              for product sign-off (see task-1.3 report). */}
          <Link
            to="/dashboard"
            className="inline-flex text-xs text-[var(--lr-graphite-700)] hover:underline"
          >
            Ver análise →
          </Link>
        </div>
      </Card>
    </>
  );
}
