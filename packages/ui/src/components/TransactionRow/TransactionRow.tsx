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
        <span
          aria-hidden="true"
          className="h-5 w-5 flex-none text-[var(--lr-text-secondary)]"
        >
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
      <Mono
        variant="number"
        tone={
          props.variant === "scheduled" ? "estimate" : KIND_TONE[props.kind]
        }
        className="flex-none"
      >
        {KIND_SIGN[props.kind]}
        {formatMoney(props.amountCents)}
      </Mono>
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
    <div className="mt-3 flex flex-col gap-2 border-t border-[var(--lr-border)] pt-3 text-[.8125rem]">
      <div className="flex justify-between">
        <Body as="span" muted>
          Compra original ({formatDate(installment.originalDate)})
        </Body>
        <Mono variant="number">
          {formatMoney(installment.originalAmountCents)}
        </Mono>
      </div>
      <Body as="span" muted>
        Plano: {installment.installmentTotal}x
        {installment.hasInterest ? " com juros" : " sem juros"}
      </Body>
      <div className="flex justify-between">
        <Body as="span" muted>
          Já pago ({installment.paidCount}x)
        </Body>
        <Mono variant="number" tone="in">
          {formatMoney(installment.paidAmountCents)}
        </Mono>
      </div>
      <div className="flex justify-between">
        <Body as="span" muted>
          A pagar ({installment.remainingCount}x)
        </Body>
        <Mono variant="number" tone="out">
          {formatMoney(installment.remainingAmountCents)}
        </Mono>
      </div>
      <div className="flex gap-1" aria-hidden="true">
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
      <Body as="span" muted>
        Próxima parcela: {formatDate(installment.nextInstallmentDate)} ·
        Quitação: {formatDate(installment.payoffDate)}
      </Body>
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
      {props.variant === "installment" ? (
        <div className="mt-2 flex gap-3">
          {props.onViewAllInstallments ? (
            <Button
              variant="link"
              size="sm"
              onClick={props.onViewAllInstallments}
            >
              Ver todas as parcelas
            </Button>
          ) : null}
          {props.onEdit ? (
            <Button variant="link" size="sm" onClick={props.onEdit}>
              Editar
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.variant === "scheduled" ? (
        <div className="mt-3 flex gap-2 border-t border-[var(--lr-border)] pt-3">
          <Button variant="primary" size="sm" onClick={props.onConfirm}>
            Confirmar
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onEdit}>
            Editar
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onSkip}>
            Pular
          </Button>
          <Button variant="danger" size="sm" onClick={props.onDelete}>
            Apagar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
