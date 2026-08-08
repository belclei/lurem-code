import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { InstitutionMark } from "../shared/InstitutionMark";
import { formatMoney } from "../shared/formatMoney";

export interface TransferAccount {
  name: string;
  institution: string;
  /** Institution logo — absent renders InstitutionMark's initial-letter fallback (same rule as AccountCard's own institution mark, §6.4). */
  logoUrl?: string;
  balanceAfterCents: number;
}

export interface TransferPairCardProps {
  amountCents: number;
  from: TransferAccount;
  to: TransferAccount;
}

/**
 * Transfer pair card (§5d) — a paired transfer between two of the user's
 * own accounts/cards, collapsed into a single card instead of two
 * separate TransactionRows. Uses existing Card/Mono/Body/InstitutionMark
 * — no business logic of its own (the caller resolves both legs' data).
 */
export function TransferPairCard({
  amountCents,
  from,
  to,
}: TransferPairCardProps) {
  return (
    <Card>
      {/* Header: transfer icon + title + amount */}
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[var(--lr-r-sm)] bg-[var(--lr-petrol-100)] text-[var(--lr-petrol-600)] dark:bg-[var(--lr-petrol-700)]/20 dark:text-[var(--lr-petrol-300)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
          >
            <path d="M7 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h10m-10 12h10a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1M7 5l-3 3m3-3l3 3m10 6l-3-3m3 3l-3-3" />
          </svg>
        </span>
        <div className="flex-1">
          <Body weight="medium">Transferência entre suas contas</Body>
        </div>
        <Mono
          variant="number"
          className="flex-none text-[.8125rem] text-[var(--lr-text-secondary)]"
        >
          {formatMoney(amountCents)}
        </Mono>
      </div>

      {/* From account row */}
      <div className="mb-3 flex items-center gap-3 border-t border-[var(--lr-border)] pt-3">
        <InstitutionMark
          logoUrl={from.logoUrl}
          name={from.institution || from.name}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Body weight="medium" className="truncate">
            {from.name}
          </Body>
          {/* TIMELINE.md §5d's literal "Conta corrente · origem/destino"
              wording is static — TransferAccount doesn't carry an account
              type (savings/checking/card), so a fatura-payment transfer
              to a card would also read "Conta corrente". Not extended to
              a dynamic type field: that means threading account/card type
              through resolveTransferParty in TimelinePage.tsx too, more
              data plumbing than this conformance pass scoped. Judgment
              call — flagged in the plan's report. */}
          <Body muted className="text-[.75rem]">
            Conta corrente · origem
          </Body>
        </div>
        <Mono variant="number" tone="out" className="flex-none">
          −{formatMoney(amountCents)}
        </Mono>
      </div>

      {/* To account row */}
      <div className="mb-3 flex items-center gap-3">
        <InstitutionMark
          logoUrl={to.logoUrl}
          name={to.institution || to.name}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Body weight="medium" className="truncate">
            {to.name}
          </Body>
          <Body muted className="text-[.75rem]">
            Conta corrente · destino
          </Body>
        </div>
        <Mono variant="number" tone="in" className="flex-none">
          +{formatMoney(amountCents)}
        </Mono>
      </div>

      {/* Footer: disclaimer */}
      <div className="mt-4 border-t border-[var(--lr-border)] pt-3">
        <Body muted className="text-[.75rem]">
          Não conta como receita nem despesa.
        </Body>
      </div>
    </Card>
  );
}
