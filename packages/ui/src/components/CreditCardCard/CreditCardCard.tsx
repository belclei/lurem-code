import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { formatMoney } from "../shared/formatMoney";

export type InvoiceStatus = "open" | "closed_awaiting_payment";

export interface CreditCardCardProps {
  institutionName: string;
  logoUrl?: string;
  name?: string;
  /** Fatura fechada + aberta, já somadas pelo caller (§6.4; BACKLOG US-2.1 — este componente não soma faturas). */
  usedCents: number;
  limitCents: number;
  invoiceStatus: InvoiceStatus;
  closingDay: number;
  dueDay: number;
  /** Resolved account label (e.g. institution/nickname) — caller looks it up, this component never joins across accounts. Absent → no auto-debit mention. */
  autoDebitAccountLabel?: string;
  onClick?: () => void;
  /** issues.md: "Pagar agora" — present only when there's a closed invoice
   * to settle. Absent → no button, even if invoiceStatus is
   * "closed_awaiting_payment" (caller's call, e.g. still loading destinations). */
  onPayNow?: () => void;
}

function InstitutionMark({
  logoUrl,
  institutionName,
}: {
  logoUrl?: string;
  institutionName: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className="h-12 w-12 flex-none rounded-[var(--lr-r-md)] object-contain"
      />
    );
  }
  return (
    // REBRAND (Task 1.3): blue-100/700/300 -> petrol-100/700/300 and
    // blue-on-tint -> positive-on-tint — same institution-icon-chip
    // treatment as AccountCard.tsx, spec-backed by DESIGN_SYSTEM.md §1.2.
    <span
      aria-hidden="true"
      className="flex h-12 w-12 flex-none items-center justify-center rounded-[var(--lr-r-md)] bg-[var(--lr-petrol-100)] text-[1.0625rem] font-bold text-[var(--lr-positive-on-tint)] dark:bg-[var(--lr-petrol-700)]/20 dark:text-[var(--lr-petrol-300)]"
    >
      {institutionName.charAt(0).toUpperCase()}
    </span>
  );
}

function cardMeta(
  closingDay: number,
  dueDay: number,
  autoDebitAccountLabel: string | undefined,
): string {
  const base = `Fecha dia ${closingDay} · vence dia ${dueDay}`;
  return autoDebitAccountLabel
    ? `${base} · débito automático (${autoDebitAccountLabel})`
    : base;
}

// Presentation-only thresholds for the usage bar's color (§6.4: ~75% aviso
// de proximidade sem badge; >100% mesmo estado de alerta da conta). Not a
// business decision — see Task 2's judgment-call note above.
function usageBarTone(usagePercent: number): string {
  if (usagePercent > 100) {
    return "bg-[var(--lr-negative-on-tint)] dark:bg-[var(--lr-negative)]";
  }
  if (usagePercent >= 75) {
    return "bg-[var(--lr-gold-600)] dark:bg-[var(--lr-gold-300)]";
  }
  return "bg-[var(--lr-petrol-600)] dark:bg-[var(--lr-petrol-300)]";
}

/**
 * Lurem's credit-card summary row. Dumb component: `usedCents` already
 * sums the closed + open invoice (§6.4, BACKLOG US-2.1) — this component
 * only turns the ratio into a progress-bar width/color. Layout matches the
 * design handoff's `.hmc-account` row (icon, name/meta, invoice value) plus
 * the usage bar underneath, stacked as a single-column list.
 */
export function CreditCardCard({
  institutionName,
  logoUrl,
  name,
  usedCents,
  limitCents,
  invoiceStatus,
  closingDay,
  dueDay,
  autoDebitAccountLabel,
  onClick,
  onPayNow,
}: CreditCardCardProps) {
  const usagePercent = limitCents > 0 ? (usedCents / limitCents) * 100 : 0;
  const barWidthPercent = Math.min(usagePercent, 100);
  const overLimit = usagePercent > 100;
  const invoiceLabel =
    invoiceStatus === "closed_awaiting_payment"
      ? "fatura fechada"
      : "fatura aberta";

  return (
    <Card interactive={Boolean(onClick)} onClick={onClick}>
      <div className="flex items-start gap-3">
        <InstitutionMark logoUrl={logoUrl} institutionName={institutionName} />
        <div className="min-w-0 flex-1">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <Body as="span" weight="medium" className="truncate">
              {institutionName}
              {name ? ` · ${name}` : ""}
            </Body>
            <Badge kind="category" color="ink">
              Crédito
            </Badge>
          </p>
          <Body muted className="mt-0.5 text-[.75rem]">
            {cardMeta(closingDay, dueDay, autoDebitAccountLabel)}
          </Body>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <Mono variant="number" tone="out" className="text-[1.25rem]">
            − {formatMoney(usedCents)}
          </Mono>
          <Body muted className="text-[.75rem]">
            {invoiceLabel}
          </Body>
          {overLimit ? (
            <Badge kind="status" status="alert">
              Além do limite
            </Badge>
          ) : null}
          {invoiceStatus === "closed_awaiting_payment" && onPayNow ? (
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onPayNow();
              }}
            >
              Pagar agora
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-3">
        {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar is a read-only status widget per WAI-ARIA APG — it is not expected to be keyboard-operable, so it should not be a tab stop */}
        <div
          role="progressbar"
          aria-label={`${institutionName}: uso do limite`}
          aria-valuenow={Math.round(usagePercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 flex-1 overflow-hidden rounded-[var(--lr-r-full)] bg-[var(--lr-surface-sunken)]"
        >
          <div
            style={{ width: `${barWidthPercent}%` }}
            className={[
              "h-full rounded-[var(--lr-r-full)]",
              usageBarTone(usagePercent),
            ].join(" ")}
          />
        </div>
        <Body muted as="span" className="whitespace-nowrap text-[.75rem]">
          {formatMoney(usedCents)} de {formatMoney(limitCents)}
        </Body>
      </div>
    </Card>
  );
}
