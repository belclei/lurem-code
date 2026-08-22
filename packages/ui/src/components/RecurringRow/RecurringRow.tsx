import { Badge } from "../Badge/Badge";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { formatDate } from "../shared/formatDate";
import { formatMoney } from "../shared/formatMoney";

export type RecurringStatus = "active" | "paused" | "ended";

const STATUS_BADGE: Record<
  RecurringStatus,
  { status: "active" | "pending" | "inactive"; label: string }
> = {
  active: { status: "active", label: "Ativa" },
  paused: { status: "pending", label: "Pausada" },
  ended: { status: "inactive", label: "Encerrada" },
};

export interface RecurringRowProps {
  description: string;
  /** Optional: when present, colors the amount and adds a +/− sign the same
   * way TransactionRow does — this page mixes income (salário) and expense
   * (aluguel, assinaturas) series, and without this they were visually
   * identical apart from reading the description text. */
  kind?: "income" | "expense";
  referenceAmountCents: number;
  /** §6.7 item 3: no valor fixo — o valor de referência é sinalizado como estimativa. */
  isVariableAmount: boolean;
  /** Absent when `status="ended"`. */
  nextOccurrenceDate?: string;
  status: RecurringStatus;
  /** §6.7 item 6 — decided by the caller (real value diverged from reference); this component only paints the badge. */
  hasVariationAlert?: boolean;
  onClick?: () => void;
}

/**
 * Lurem's recurring-series summary row. Dumb component: `status` and
 * `hasVariationAlert` arrive via props — no divergence math happens here
 * (§6.7, BACKLOG US-2.5).
 */
export function RecurringRow({
  description,
  kind,
  referenceAmountCents,
  isVariableAmount,
  nextOccurrenceDate,
  status,
  hasVariationAlert = false,
  onClick,
}: RecurringRowProps) {
  const badge = STATUS_BADGE[status];

  return (
    <Card interactive={Boolean(onClick)} onClick={onClick}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Body weight="medium" className="truncate">
              {description}
            </Body>
            <Badge kind="status" status={badge.status}>
              {badge.label}
            </Badge>
            {/* Label renamed per backlog ("Valor variável" → "Confirmar todo
                mês") — `isVariableAmount` (prop name / DB column) kept as-is,
                only the visible copy changed. */}
            {isVariableAmount ? (
              <Badge kind="category" color="sand">
                Confirmar todo mês
              </Badge>
            ) : null}
            {hasVariationAlert ? (
              <Badge kind="status" status="alert">
                Variação
              </Badge>
            ) : null}
          </div>
          <Body muted className="text-[.8125rem]">
            {status === "ended"
              ? "Série encerrada"
              : nextOccurrenceDate
                ? `Próxima ocorrência: ${formatDate(nextOccurrenceDate)}`
                : ""}
          </Body>
        </div>
        <Mono
          variant="number"
          tone={
            isVariableAmount
              ? "estimate"
              : kind === "income"
                ? "in"
                : kind === "expense"
                  ? "out"
                  : "default"
          }
          className="flex-none"
        >
          {kind === "income" ? "+" : kind === "expense" ? "−" : ""}
          {formatMoney(referenceAmountCents)}
        </Mono>
      </div>
    </Card>
  );
}
