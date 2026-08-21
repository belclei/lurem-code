import { useEffect, useState } from "react";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { InstitutionMark } from "../shared/InstitutionMark";
import { formatMoney } from "../shared/formatMoney";
import { ChevronDownIcon, ChevronRightIcon } from "../shared/icons";

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
  expanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Transfer pair card — unified, expandable layout matching TransactionRow.
 * Collapsed: DE → PARA institution marks + description + emoji 🔀 Transferência.
 * Expanded: detailed rows (origin/destination with amounts) + action trailer.
 */
export function TransferPairCard({
  amountCents,
  from,
  to,
  description,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: TransferPairCardProps) {
  const fromAccountType = from.isCash ? "Em espécie" : "Conta corrente";
  const toAccountType = to.isCash ? "Em espécie" : "Conta corrente";

  // Same two-step arm/confirm as TransactionRow's "Apagar" — a transfer
  // delete is the same financial-data-loss action, it shouldn't be one
  // click just because this is a sibling component.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!expanded) setConfirmingDelete(false);
  }, [expanded]);

  return (
    // Whole-card click expands, same gesture TransactionRow already uses —
    // was interactive={false} with only the ~24px chevron as a click
    // target, an inconsistency users would reasonably not expect between
    // two sibling card types doing the same job.
    <Card
      interactive={Boolean(onToggleExpand)}
      onClick={onToggleExpand}
      dashed={false}
    >
      {/* Collapsed header — flex-wrap + min-w on the center block (not
          min-w-0) so the trailing amount/chevron block wraps to its own
          line instead of truncating the description down to nothing at
          narrow widths, same fix as TransactionRow's RowHeader. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* Institution marks: from → to */}
        <div className="flex flex-none items-center gap-1">
          <InstitutionMark
            logoUrl={from.logoUrl}
            name={from.institution || from.name}
            tone={from.isCash ? "gold" : "petrol"}
            size="sm"
          />
          <ChevronRightIcon className="h-3 w-3 text-[var(--lr-text-secondary)]" />
          <InstitutionMark
            logoUrl={to.logoUrl}
            name={to.institution || to.name}
            tone={to.isCash ? "gold" : "petrol"}
            size="sm"
          />
        </div>

        {/* Center: description + category line */}
        <div className="min-w-[8rem] flex-1">
          <div className="flex items-center gap-2">
            <Body weight="medium" className="truncate">
              {description || "Transferência"}
            </Body>
            <Badge kind="status" status="active">
              Transferência
            </Badge>
          </div>
          <Body muted className="text-[.8125rem]">
            <span aria-hidden="true" className="mr-1">
              🔀
            </span>
            Transferência
          </Body>
        </div>

        {/* Trailing: amount + expand button */}
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <Mono variant="number" tone="default">
            {formatMoney(amountCents)}
          </Mono>
          <button
            type="button"
            aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand?.();
            }}
            className="flex-none rounded-[var(--lr-r-full)] p-1 text-[var(--lr-text-secondary)] hover:bg-[var(--lr-surface-sunken)]"
          >
            <ChevronDownIcon
              className={[
                "h-3.5 w-3.5 transition-transform duration-150",
                expanded ? "rotate-180" : "",
              ].join(" ")}
            />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded ? (
        <>
          <div className="mt-3 border-t border-[var(--lr-border)] pt-3">
            {/* From account */}
            <div className="mb-3 flex items-center gap-3">
              <InstitutionMark
                logoUrl={from.logoUrl}
                name={from.institution || from.name}
                tone={from.isCash ? "gold" : "petrol"}
                size="sm"
              />
              {/* No truncate/min-w-0 here — same fix as the collapsed
                  header (round-2 critique): a long account name competing
                  against a flex-none amount would truncate to nothing
                  instead of wrapping. Plenty of vertical room in the
                  expanded view for a name to wrap to a second line. */}
              <div className="min-w-[6rem] flex-1">
                <Body weight="medium">{from.name}</Body>
                <Body muted className="text-[.75rem]">
                  {fromAccountType} · origem
                </Body>
              </div>
              <Mono variant="number" tone="out" className="flex-none">
                −{formatMoney(amountCents)}
              </Mono>
            </div>

            {/* To account */}
            <div className="flex items-center gap-3">
              <InstitutionMark
                logoUrl={to.logoUrl}
                name={to.institution || to.name}
                tone={to.isCash ? "gold" : "petrol"}
                size="sm"
              />
              <div className="min-w-[6rem] flex-1">
                <Body weight="medium">{to.name}</Body>
                <Body muted className="text-[.75rem]">
                  {toAccountType} · destino
                </Body>
              </div>
              <Mono variant="number" tone="in" className="flex-none">
                +{formatMoney(amountCents)}
              </Mono>
            </div>

            {/* Disclaimer */}
            <div className="mt-3">
              <Body muted className="text-[.75rem]">
                Não conta como receita nem despesa.
              </Body>
            </div>
          </div>

          {/* Action trailer */}
          <div className="mt-3 flex justify-end gap-2 border-t border-[var(--lr-border)] pt-3">
            {onDelete ? (
              confirmingDelete ? (
                <>
                  <Body
                    as="span"
                    className="mr-auto text-[.8125rem] text-[var(--lr-negative)]"
                  >
                    Apagar esta transferência? Não pode ser desfeito.
                  </Body>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmingDelete(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmingDelete(false);
                      onDelete();
                    }}
                  >
                    Sim, apagar
                  </Button>
                </>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmingDelete(true);
                  }}
                >
                  Apagar
                </Button>
              )
            ) : null}
            {onEdit ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                Editar
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
