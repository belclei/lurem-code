import type { ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { formatDate } from "../shared/formatDate";
import { formatMoney } from "../shared/formatMoney";
import { CheckIcon, ChevronDownIcon } from "../shared/icons";

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
  /** Institution mark (logo/initial) — replaces the old categoryIcon. */
  institutionMark?: ReactNode;
  /** Category emoji + name for the second line. */
  categoryEmoji?: string;
  categoryName?: string;
  /** Category's `colorToken` (a CSS custom-property name, e.g. `"--lr-petrol-600"`) — paints a left accent border. Absent → no border. Suppressed on dashed (scheduled/recurringPreview) cards: the estimate treatment always wins, never two border signals competing. */
  categoryColorToken?: string;
  /** Whether this row is expanded to show details. */
  expanded?: boolean;
  /** Fired when the user clicks the chevron to toggle expand. */
  onToggleExpand?: () => void;
  /** Scheduled-only: fired when the user clicks Confirmar. */
  onConfirm?: () => void;
  /** Called when the user clicks Editar — except recurringPreview (no button). */
  onEdit?: () => void;
  /** Called when the user clicks Apagar — except recurringPreview (no button). */
  onDelete?: () => void;
  /**
   * Fired when the user clicks anywhere on the card that isn't one of its
   * own buttons (chevron/Editar/Apagar/Confirmar/Gerenciar) — the whole card
   * toggles selection, every variant, the same way. Absent → the row isn't
   * selectable (e.g. transfer legs, rendered by a different component
   * entirely, never reach this prop).
   */
  onToggleSelect?: () => void;
  /** Whether this row is currently selected (transaction-card redesign, 2026-08 — selection is used for a manual sum, not an official calculated value). */
  selected?: boolean;
}

export interface InstallmentDetail {
  originalAmountCents: number;
  originalDate: string;
  installmentNumber: number;
  installmentTotal: number;
  paidCount: number;
  paidAmountCents: number;
  remainingCount: number;
  remainingAmountCents: number;
  nextInstallmentDate: string;
  payoffDate: string;
}

export type TransactionRowProps =
  | (TransactionRowCommon & {
      /** Generic transaction card: default/transfer/installment/scheduled. */
      variant?: "default" | "transfer" | "installment" | "scheduled";
      /** For installments only. */
      installment?: InstallmentDetail;
      /** For scheduled only. */
      isScheduled?: boolean;
    })
  | (TransactionRowCommon & {
      /** Pure preview of a future recurring occurrence — no expansion, no actions/edit/delete. */
      variant: "recurringPreview";
      /** Opens series management — a dedicated button, not the whole-card click (that's reserved for selection, same as every other variant). */
      onManage: () => void;
      isScheduled?: never;
      onToggleExpand?: never;
      expanded?: never;
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
  const isInstallment = props.variant === "installment" && props.installment;
  const isScheduled = props.variant === "scheduled" || props.isScheduled;
  const isRecurringPreview = props.variant === "recurringPreview";

  return (
    <div className="flex items-center gap-3">
      {props.onToggleSelect ? (
        <span
          aria-hidden="true"
          className={[
            "flex h-5 w-5 flex-none items-center justify-center rounded-[var(--lr-r-sm)] border transition-colors duration-150",
            props.selected
              ? "border-[var(--lr-night-900)] bg-[var(--lr-night-900)] dark:border-[var(--lr-night-700)] dark:bg-[var(--lr-night-700)]"
              : "border-[var(--lr-night-300)] bg-[var(--lr-surface)]",
          ].join(" ")}
        >
          {props.selected ? (
            <CheckIcon
              strokeWidth={3}
              className="h-3 w-3 text-[var(--lr-ivory-000)]"
            />
          ) : null}
        </span>
      ) : null}
      {props.institutionMark ? (
        <span aria-hidden="true" className="flex-none">
          {props.institutionMark}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Body weight="medium" className="truncate">
            {props.description}
            {isInstallment
              ? ` · ${props.installment?.installmentNumber}/${props.installment?.installmentTotal}`
              : ""}
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
          {isScheduled && !isRecurringPreview ? (
            <Badge kind="status" status="estimate">
              Agendada
            </Badge>
          ) : null}
          {isRecurringPreview ? (
            <Badge kind="status" status="pending">
              Recorrência pendente
            </Badge>
          ) : null}
        </div>
        <Body muted className="text-[.8125rem]">
          {props.categoryEmoji ? (
            <span aria-hidden="true" className="mr-1">
              {props.categoryEmoji}
            </span>
          ) : null}
          {props.categoryName}
        </Body>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <Mono
          variant="number"
          tone={
            isScheduled || isRecurringPreview
              ? "estimate"
              : KIND_TONE[props.kind]
          }
        >
          {KIND_SIGN[props.kind]}
          {formatMoney(props.amountCents)}
        </Mono>
        {props.variant === "recurringPreview" ? (
          <Button
            variant="link"
            size="sm"
            className="flex-none"
            onClick={(event) => {
              event.stopPropagation();
              props.onManage();
            }}
          >
            Gerenciar
          </Button>
        ) : (
          <button
            type="button"
            aria-label={
              props.expanded ? "Recolher detalhes" : "Expandir detalhes"
            }
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleExpand?.();
            }}
            className="flex-none rounded-[var(--lr-r-full)] p-1 text-[var(--lr-text-secondary)] hover:bg-[var(--lr-surface-sunken)]"
          >
            <ChevronDownIcon
              className={[
                "h-3.5 w-3.5 transition-transform duration-150",
                props.expanded ? "rotate-180" : "",
              ].join(" ")}
            />
          </button>
        )}
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
          <Body as="span">{installment.installmentTotal}x</Body>
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
 * Lurem's unified transaction row. Supports all transaction types
 * (default/transfer/installment/scheduled/recurringPreview) via optional props.
 * Collapsed by default, expands to show details and action buttons in a trailer.
 * recurringPreview is special: never expands, just a click-through.
 */
export function TransactionRow(props: TransactionRowProps) {
  const isRecurringPreview = props.variant === "recurringPreview";
  const isInstallment = props.variant === "installment" && props.installment;
  const isScheduled = props.variant === "scheduled" || props.isScheduled;
  const isDashed = isScheduled || isRecurringPreview;

  return (
    <Card
      interactive={Boolean(props.onToggleSelect)}
      onClick={props.onToggleSelect}
      // No aria-label here on purpose: an aria-label would replace the
      // card's accessible name outright, so a screen reader would announce
      // just "toggle selection" instead of the transaction's own
      // description/amount. aria-pressed alone conveys the toggle state on
      // top of the card's own text content.
      aria-pressed={props.onToggleSelect ? Boolean(props.selected) : undefined}
      dashed={isDashed}
      // Estimate treatment (dashed border) always wins over category color —
      // never two border signals competing on the same edge.
      style={
        !isDashed && props.categoryColorToken
          ? {
              borderLeftColor: `var(${props.categoryColorToken})`,
              borderLeftWidth: "3px",
            }
          : undefined
      }
    >
      <RowHeader {...props} />

      {!isRecurringPreview && props.expanded ? (
        <>
          {isInstallment ? (
            // biome-ignore lint/style/noNonNullAssertion: isInstallment guard guarantees installment is defined
            <InstallmentDetails installment={props.installment!} />
          ) : (
            <div className="mt-3 border-t border-[var(--lr-border)] pt-3">
              <Body muted className="text-[.8125rem]">
                {formatDate(props.date)}
              </Body>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2 border-t border-[var(--lr-border)] pt-3">
            {props.onDelete ? (
              <Button
                variant="danger"
                size="sm"
                className="mr-auto"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDelete?.();
                }}
              >
                Apagar
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
            {isScheduled && props.onConfirm ? (
              <Button
                variant="primary"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onConfirm?.();
                }}
              >
                Confirmar
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
