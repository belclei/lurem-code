import { Badge } from "../Badge/Badge";
import { Card } from "../Card/Card";
import { Body } from "../Typography/Body";
import { Mono } from "../Typography/Mono";
import { InstitutionMark } from "../shared/InstitutionMark";
import { formatMoney } from "../shared/formatMoney";

export type AccountType = "checking" | "cash";

export interface AccountCardProps {
  /** Institution is the primary identifier (ARQUITETURA.md §6.4) — always shown, even for `type="cash"` (renders "Carteira" convention via `institutionName`, no separate cash-only branch needed). */
  institutionName: string;
  /** Logo image URL. Absent → generic initial-in-brand-color fallback (§6.4: "instituição fora da lista → ícone genérico com a inicial"). */
  logoUrl?: string;
  /** Optional disambiguation ("Nubank PJ") — `name` is facultative per §6.4. */
  name?: string;
  type: AccountType;
  balanceCents: number;
  /** Cheque especial limit — 0/absent renders as "sem limite". Ignored for `type="cash"` (design_handoff: carteira sempre mostra "nunca fica negativa"). */
  overdraftLimitCents?: number;
  isActive: boolean;
  /** Decided by the caller from real account state — see Task 1's judgment-call note. When true, renders the alert badge. */
  overLimit?: boolean;
  onClick?: () => void;
}

// design_handoff_lurem/design/Harmon.dc.html ("Contas e cartões" screen):
// carteira never carries an institution or a cheque-especial limit, so its
// meta line is a fixed sentence rather than a formatted limit value.
function accountMeta(type: AccountType, overdraftLimitCents: number): string {
  if (type === "cash") return "Sem instituição";
  if (overdraftLimitCents > 0) {
    return `Limite (cheque especial) ${formatMoney(overdraftLimitCents)}`;
  }
  return "Sem limite de cheque especial";
}

const WITHIN_LIMIT_TONE =
  "bg-[var(--lr-gold-600)] dark:bg-[var(--lr-gold-300)]";
const BEYOND_LIMIT_TONE =
  "bg-[var(--lr-negative-on-tint)] dark:bg-[var(--lr-negative)]";

/**
 * Lurem's account summary row. Dumb component: `overLimit` and `isActive`
 * arrive as props — it never computes whether a balance breaches the
 * overdraft limit (§6.4, BACKLOG US-2.1). Layout matches the design
 * handoff's `.hmc-account` row: icon, name/meta, balance — stacked as a
 * single-column list, not a card grid.
 */
export function AccountCard({
  institutionName,
  logoUrl,
  name,
  type,
  balanceCents,
  overdraftLimitCents = 0,
  isActive,
  overLimit = false,
  onClick,
}: AccountCardProps) {
  const isNegative = balanceCents < 0;
  // Sem limite (ex.: espécie), qualquer saldo negativo já é "100% e além" —
  // não há um denominador real para uma fração menor que isso.
  const usagePercent =
    overdraftLimitCents > 0
      ? (Math.abs(balanceCents) / overdraftLimitCents) * 100
      : isNegative
        ? 100
        : 0;
  // issues.md: passar de 100% não estica a barra pra fora — a própria
  // porcentagem alcançada vira o novo "total" (100% da barra), dividido em
  // duas cores: a fatia até o limite autorizado (dourado) e a fatia além
  // dele (alerta). Até 100% é só a fatia dourada, igual antes.
  const barScaleMax = Math.max(usagePercent, 100);
  const withinLimitBarPercent =
    (Math.min(usagePercent, 100) / barScaleMax) * 100;
  const beyondLimitBarPercent =
    usagePercent > 100 ? ((usagePercent - 100) / barScaleMax) * 100 : 0;

  return (
    <Card
      interactive={Boolean(onClick)}
      onClick={onClick}
      className={isActive ? "" : "opacity-60"}
    >
      <div className="flex items-start gap-3">
        <InstitutionMark
          logoUrl={logoUrl}
          name={institutionName}
          tone={type === "cash" ? "gold" : "petrol"}
        />
        <div className="min-w-0 flex-1">
          <p className="m-0">
            <Body as="span" weight="medium" className="truncate">
              {institutionName}
              {name ? ` - ${name}` : ""}
            </Body>
          </p>
          <Body muted className="mt-0.5 text-[.75rem]">
            {accountMeta(type, overdraftLimitCents)}
          </Body>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <Mono
            variant="number"
            tone={isNegative ? "out" : "default"}
            className="text-[1.25rem]"
          >
            {formatMoney(balanceCents)}
          </Mono>
          <Body muted className="text-[.75rem]">
            saldo atual
          </Body>
          {!isActive ? (
            <Badge kind="status" status="inactive">
              Inativa
            </Badge>
          ) : null}
          {isActive && overLimit ? (
            <Badge kind="status" status="alert">
              Além do limite
            </Badge>
          ) : null}
        </div>
      </div>
      {isNegative ? (
        <div className="mt-3.5 flex items-center gap-3">
          {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar is a read-only status widget per WAI-ARIA APG — it is not expected to be keyboard-operable, so it should not be a tab stop */}
          <div
            role="progressbar"
            aria-label={`${institutionName}: proximidade do limite`}
            aria-valuenow={Math.round(usagePercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="flex h-1.5 flex-1 overflow-hidden rounded-[var(--lr-r-full)] bg-[var(--lr-surface-sunken)]"
          >
            <div
              style={{ width: `${withinLimitBarPercent}%` }}
              className={["h-full", WITHIN_LIMIT_TONE].join(" ")}
            />
            {beyondLimitBarPercent > 0 ? (
              <div
                style={{ width: `${beyondLimitBarPercent}%` }}
                className={["h-full", BEYOND_LIMIT_TONE].join(" ")}
              />
            ) : null}
          </div>
          <Body muted as="span" className="whitespace-nowrap text-[.75rem]">
            {overdraftLimitCents > 0
              ? `${formatMoney(Math.abs(balanceCents))} de ${formatMoney(overdraftLimitCents)}`
              : formatMoney(Math.abs(balanceCents))}
          </Body>
        </div>
      ) : null}
    </Card>
  );
}
