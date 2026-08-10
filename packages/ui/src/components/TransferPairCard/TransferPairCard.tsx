import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { InstitutionMark } from "../shared/InstitutionMark";
import { formatMoney } from "../shared/formatMoney";
import { TransferIcon } from "../shared/icons";

export interface TransferAccount {
  name: string;
  institution: string;
  /** Institution logo — absent renders InstitutionMark's initial-letter fallback (same rule as AccountCard's own institution mark, §6.4). */
  logoUrl?: string;
  balanceAfterCents: number;
  /** True for a type="cash" account (carteira/espécie) — renders the dedicated banknote glyph (InstitutionMark's gold tone) instead of an initial, same rule as AccountCard/TimelineSummaryAside. */
  isCash?: boolean;
}

export interface TransferPairCardProps {
  amountCents: number;
  from: TransferAccount;
  to: TransferAccount;
  /** Optional — transfers don't require a description (§6.6), but shows here when the user provided one. */
  description?: string;
  onClick?: () => void;
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
  description,
  onClick,
}: TransferPairCardProps) {
  return (
    <Card interactive={Boolean(onClick)} onClick={onClick}>
      {/* Header: transfer icon + title + amount */}
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[var(--lr-r-sm)] bg-[var(--lr-petrol-100)] text-[var(--lr-petrol-600)] dark:bg-[var(--lr-petrol-700)]/20 dark:text-[var(--lr-petrol-300)]"
        >
          <TransferIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Body weight="medium">Transferência entre suas contas</Body>
          {description ? (
            <Body muted className="truncate text-[.75rem]">
              {description}
            </Body>
          ) : null}
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
          tone={from.isCash ? "gold" : "petrol"}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Body weight="medium" className="truncate">
            {from.name}
          </Body>
          <Body muted className="text-[.75rem]">
            {from.isCash ? "Em espécie" : "Conta corrente"} · origem
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
          tone={to.isCash ? "gold" : "petrol"}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Body weight="medium" className="truncate">
            {to.name}
          </Body>
          <Body muted className="text-[.75rem]">
            {to.isCash ? "Em espécie" : "Conta corrente"} · destino
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
