import type { ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { formatDate } from "../shared/formatDate";
import { formatMoney } from "../shared/formatMoney";

export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "import";

interface TransactionRowCommon {
  description: string;
  /** ISO date string — formatted internally via `formatDate` (§7). */
  date: string;
  kind: TransactionKind;
  /** Always the positive magnitude — sign/color come from `kind`, never from the number itself. */
  amountCents: number;
  source: TransactionSource;
  categoryIcon?: ReactNode;
  categoryLabel?: string;
  onClick?: () => void;
}

export interface InstallmentDetail {
  originalAmountCents: number;
  originalDate: string;
  installmentNumber: number;
  installmentTotal: number;
  hasInterest: boolean;
  paidCount: number;
  paidAmountCents: number;
  remainingCount: number;
  remainingAmountCents: number;
  nextInstallmentDate: string;
  payoffDate: string;
}

export type TransactionRowProps =
  | (TransactionRowCommon & { variant: "default" })
  | (TransactionRowCommon & {
      variant: "transfer";
      /** e.g. "Conta Corrente → Poupança" destination label — already resolved by the caller, this component never looks up account names. */
      transferToLabel: string;
    })
  | (TransactionRowCommon & {
      variant: "installment";
      expanded?: boolean;
      installment: InstallmentDetail;
      onViewAllInstallments?: () => void;
      onEdit?: () => void;
    })
  | (TransactionRowCommon & {
      variant: "scheduled";
      onClick?: never;
      onConfirm: () => void;
      onEdit: () => void;
      onSkip: () => void;
      onDelete: () => void;
    });

const KIND_TONE: Record<TransactionKind, "in" | "out" | "default"> = {
  income: "in",
  expense: "out",
  transfer: "default",
};

const KIND_SIGN: Record<TransactionKind, string> = {
  income: "+",
  expense: "−", // U+2212 MINUS SIGN, not the ASCII hyphen "-" — TIMELINE.md §9.5
  transfer: "",
};

// §5b's meta line needs to know whether `date` (the scheduled transaction's
// own date) is today, in America/Sao_Paulo — the same civil-day comparison
// apps/web/src/routes/TimelinePage.tsx's own todayYmd()/isToday() helpers
// already use, reimplemented locally since packages/ui can't import from
// apps/web. `now` is injectable so this stays a pure, testable function
// (see TransactionRow.test.ts) instead of reaching for `new Date()` inline.
export function scheduledMetaText(
  dateIso: string,
  now: Date = new Date(),
): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const isToday = ymd.format(new Date(dateIso)) === ymd.format(now);
  return isToday
    ? "Previsto para hoje · não entra no saldo"
    : `Previsto para ${formatDate(dateIso)} · não entra no saldo`;
}

function RowHeader(props: TransactionRowProps) {
  return (
    <div className="flex items-center gap-3">
      {props.categoryIcon ? (
        <span aria-hidden="true" className="flex-none">
          {props.categoryIcon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Body weight="medium" className="truncate">
            {props.description}
          </Body>
          {props.source === "import" ? (
            <Badge kind="status" status="pending">
              Importada
            </Badge>
          ) : null}
          {props.variant === "transfer" ? (
            <Badge kind="status" status="active">
              Transferência
            </Badge>
          ) : null}
          {/* Collapsed installment rows were visually identical to a plain
              transaction — this is the only always-visible tell that the
              row is parcelada, so it survives even when never expanded. */}
          {props.variant === "installment" ? (
            <Badge kind="category" color="ink">
              {props.installment.installmentNumber}/
              {props.installment.installmentTotal}
            </Badge>
          ) : null}
          {props.variant === "scheduled" ? (
            <Badge kind="status" status="estimate">
              Agendada
            </Badge>
          ) : null}
        </div>
        <Body muted className="text-[.8125rem]">
          {props.categoryLabel ? `${props.categoryLabel} · ` : ""}
          {props.variant === "scheduled"
            ? scheduledMetaText(props.date)
            : formatDate(props.date)}
          {props.variant === "transfer" ? ` · ${props.transferToLabel}` : ""}
        </Body>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <Mono
          variant="number"
          tone={
            props.variant === "scheduled" ? "estimate" : KIND_TONE[props.kind]
          }
        >
          {KIND_SIGN[props.kind]}
          {formatMoney(props.amountCents)}
        </Mono>
        {props.variant === "installment" ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={[
              "h-3.5 w-3.5 flex-none text-[var(--lr-text-secondary)] transition-transform duration-150",
              props.expanded ? "rotate-180" : "",
            ].join(" ")}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function InstallmentDetails({
  installment,
}: { installment: InstallmentDetail }) {
  const segments = Array.from(
    { length: installment.installmentTotal },
    (_, i) => i < installment.paidCount,
  );

  return (
    <div className="mt-3 border-t border-[var(--lr-border)] pt-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-[.875rem]">
        <div>
          <p className="lr-label mb-1">Compra original</p>
          <Mono variant="number">
            {formatMoney(installment.originalAmountCents)}
          </Mono>
          {/* Not in TIMELINE.md §5c's literal "label + valor" cell
              description, but dropping the purchase date entirely (the
              old layout showed it inline) would silently remove visible
              information — kept as a smaller secondary line instead.
              Judgment call — flagged in the plan's report. */}
          <Body muted className="mt-0.5 text-[.75rem]">
            {formatDate(installment.originalDate)}
          </Body>
        </div>
        <div>
          <p className="lr-label mb-1">Plano</p>
          <Body as="span">
            {installment.installmentTotal}x
            {installment.hasInterest ? " com juros" : " sem juros"}
          </Body>
        </div>
        <div>
          <p className="lr-label mb-1">Já pago</p>
          <Mono variant="number" tone="in">
            {formatMoney(installment.paidAmountCents)}
          </Mono>
        </div>
        <div>
          <p className="lr-label mb-1">A pagar</p>
          <Mono variant="number" tone="out">
            {formatMoney(installment.remainingAmountCents)}
          </Mono>
        </div>
      </div>
      <div className="mt-3.5 flex gap-1" aria-hidden="true">
        {segments.map((paid, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length progress segments, no identity beyond position
            key={i}
            className={[
              "h-1.5 flex-1 rounded-[var(--lr-r-full)]",
              paid
                ? "bg-[var(--lr-petrol-600)] dark:bg-[var(--lr-petrol-300)]"
                : "bg-[var(--lr-surface-sunken)]",
            ].join(" ")}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[.75rem]">
        <Body as="span" muted>
          Próxima: {formatDate(installment.nextInstallmentDate)}
        </Body>
        <Body as="span" muted>
          Quitação: {formatDate(installment.payoffDate)}
        </Body>
      </div>
    </div>
  );
}

/**
 * Lurem's transaction line item. Dumb component: variant/fields all come
 * via props — it renders 5 shapes (manual/importada share the `default`
 * variant, distinguished only by the `source` tag) without deciding any
 * business state itself (§6.6, BACKLOG US-2.3).
 */
export function TransactionRow(props: TransactionRowProps) {
  const clickable = props.variant !== "scheduled" && Boolean(props.onClick);

  return (
    <Card
      interactive={clickable}
      onClick={clickable ? props.onClick : undefined}
      dashed={props.variant === "scheduled"}
    >
      <RowHeader {...props} />
      {props.variant === "installment" && props.expanded ? (
        <InstallmentDetails installment={props.installment} />
      ) : null}
      {props.variant === "installment" &&
      (props.onViewAllInstallments || props.onEdit) ? (
        <div className="mt-3 flex gap-2 border-t border-[var(--lr-border)] pt-3">
          {props.onViewAllInstallments ? (
            <Button
              variant="tertiary"
              size="sm"
              onClick={(event) => {
                // Task 19 wires the whole card's own onClick to the same
                // toggle — without this, clicking this button would ALSO
                // bubble up and re-fire the card's onClick (both handlers run
                // on a plain DOM click), double-toggling expand/collapse.
                event.stopPropagation();
                props.onViewAllInstallments?.();
              }}
            >
              Ver todas as parcelas
            </Button>
          ) : null}
          {props.onEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                props.onEdit?.();
              }}
            >
              Editar
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.variant === "scheduled" ? (
        <div className="mt-3 flex justify-end gap-2 border-t border-[var(--lr-border)] pt-3">
          {/* TIMELINE.md §5b wants `hmc-btn--sm hmc-btn--ghost-danger` for
              Apagar — Button has no ghost+danger combination (variants are
              primary/secondary/tertiary/danger/link, see Button.tsx). `danger`
              (solid) is the closest available match: it's the only variant
              that keeps the red destructive signal, which matters more for an
              irreversible delete than matching the reference's lower visual
              weight exactly. Judgment call — flagged in the plan's report. */}
          <Button
            variant="danger"
            size="sm"
            className="mr-auto"
            onClick={props.onDelete}
          >
            Apagar
          </Button>
          <Button variant="tertiary" size="sm" onClick={props.onSkip}>
            Pular
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onEdit}>
            Editar
          </Button>
          <Button variant="primary" size="sm" onClick={props.onConfirm}>
            Confirmar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
