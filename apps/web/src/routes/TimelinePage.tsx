// apps/web/src/routes/TimelinePage.tsx
// BACKLOG.md US-6.1 — a Timeline é a home real do app (§6.12, ver também
// ARQUITETURA.md §6.11 para o estado vazio/ativação, que chega na Sprint 7).
// TimelineAlertBanner e os totais do painel lateral derivam de /v1/accounts e
// /v1/cards (que já expõem isOverLimit/balanceCents/usedCents) — não existe
// endpoint próprio para eles (ver comentário em timeline/routes.ts no backend).
import {
  Alert,
  Badge,
  Body,
  Button,
  Calendar,
  Card,
  CategoryIcon,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  InstitutionMark,
  Mono,
  ProfileIncompleteAlert,
  Segmented,
  Select,
  Skeleton,
  TimelineAlertBanner,
  TimelineEventRow,
  TransactionRow,
  TransferPairCard,
  formatMoney,
} from "@lurem/ui";
import type {
  AlertedEntity,
  CalendarRange,
  DomainEventType,
  TransferAccount,
} from "@lurem/ui";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson } from "../auth/api-client";
import type {
  AccountDto,
  CardDto,
  TimelineItemDto,
  TimelinePageDto,
  TransactionDto,
  TxKind,
} from "../auth/types";
import { reaisToCentsOrZero, reaisToCentsPositive } from "../lib/money";
import type { DashboardInsights } from "./DashboardView";

interface CategoryDto {
  id: string;
  name: string;
  kind: TxKind;
  icon: string;
}

interface CreateTxPayload {
  kind: TxKind;
  description: string;
  transactionDate: string;
  amountCents: number;
  accountId?: string;
  creditCardId?: string;
  toAccountId?: string;
  toCreditCardId?: string;
  categoryId?: string;
}

// ARQUITETURA.md §6.12 item 3: a Timeline filtra por tipo de evento além de
// conta/cartão. `DomainEvent.type` tem 34 valores concretos (TimelineEventRow's
// catalog) — granular demais pra um filtro; agrupados nas mesmas famílias que
// TimelineEventRow já usa pra ícone (eventIcon()), então o rótulo do filtro e o
// ícone que o usuário vê na lista sempre concordam. "transaction" é o
// pseudo-tipo que GET /v1/timeline usa pra alternar as `Transaction` reais
// (que não são DomainEvent) — ver apps/api/src/timeline/routes.ts.
interface EventTypeGroup {
  id: string;
  label: string;
  types: string[];
}

const EVENT_TYPE_GROUPS: EventTypeGroup[] = [
  { id: "transaction", label: "Transações", types: ["transaction"] },
  {
    id: "account_card",
    label: "Contas e cartões",
    types: [
      "account.created",
      "account.updated",
      "account.balance_adjusted",
      "account.over_limit_entered",
      "account.over_limit_cleared",
      "card.created",
      "card.updated",
      "card.over_limit_entered",
      "card.over_limit_cleared",
      "card.invoice_closed",
      "card.invoice_due",
    ],
  },
  {
    id: "scheduled",
    label: "Agendadas",
    types: ["scheduled.confirmed", "scheduled.skipped", "scheduled.deleted"],
  },
  {
    id: "recurring",
    label: "Recorrências",
    types: ["recurring.created", "recurring.paused", "recurring.ended"],
  },
  { id: "import", label: "Importação", types: ["import.completed"] },
  {
    id: "connections",
    label: "Conexões e portador",
    types: [
      "invite.deleted",
      "invite.resent",
      "connection.requested",
      "connection.accepted",
      "connection.rejected",
      "connection.deleted",
      "connection.resent",
      "share.granted",
      "share.permission_changed",
      "share.revoked",
      "portador.assigned",
      "portador.accepted",
      "portador.rejected",
      "portador.settled",
    ],
  },
];

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function thisMonthRange(): CalendarRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

/** True when `range` is exactly the current calendar month — lets the
 * filter bar's trigger read "Este mês" (§3) instead of a raw date range
 * when the user hasn't touched the period filter from its default. */
function isThisMonthRange(range: CalendarRange): boolean {
  if (!range.from || !range.to) return false;
  const expected = thisMonthRange();
  return (
    toYmd(range.from) === toYmd(expected.from as Date) &&
    toYmd(range.to) === toYmd(expected.to as Date)
  );
}

function periodLabel(range: CalendarRange): string {
  if (!range.from) return "Período";
  if (isThisMonthRange(range)) return "Este mês";
  if (!range.to) return shortDate(range.from);
  return `${shortDate(range.from)} – ${shortDate(range.to)}`;
}

/** Header greeting (§6.12) — time-of-day salutation + full pt-BR date,
 * both derived from the same `now` so they can't disagree (e.g. greeting
 * says "Boa noite" off a stale render while the date already rolled over). */
function greetingAndDate(): { greeting: string; dateLabel: string } {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const rawDateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  // toLocaleDateString's pt-BR weekday/month names come back lowercase
  // ("quinta-feira, 01 de agosto de 2026") — capitalize just the leading
  // letter, not every word (a blanket `capitalize` class would also
  // uppercase "de" mid-string, which isn't correct Portuguese).
  const dateLabel =
    rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);

  return { greeting, dateLabel };
}

/** Compact trigger-button + floating panel — same open/blur-to-close idiom
 * already established by Select/AffixMenu, just without a search input
 * (index.html id="select"'s `.hmc-select` toolbar trigger has no combobox
 * behavior, unlike the form Select). Page-local: this isn't a new design
 * system primitive, just shared boilerplate between the 2 toolbar filters
 * below that need a popover instead of Select's full labeled input. */
function FilterPopover({
  label,
  triggerLabel,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  triggerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="relative"
      ref={ref}
      onBlur={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node)) {
          onOpenChange(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => onOpenChange(!open)}
        className={[
          "flex items-center gap-2 rounded-[var(--lr-r-md)] border px-3.5 py-2 text-[.875rem]",
          "bg-[var(--lr-surface)] text-[var(--lr-text)] transition-colors duration-150",
          open
            ? "border-[var(--lr-night-300)]"
            : "border-[var(--lr-border)] hover:border-[var(--lr-night-300)]",
        ].join(" ")}
      >
        {triggerLabel}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            "h-3.5 w-3.5 flex-none text-[var(--lr-text-secondary)] transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1.5">{children}</div>
      ) : null}
    </div>
  );
}

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function isToday(dateYmd: string): boolean {
  return dateYmd === todayYmd();
}

function dayOfWeek(dateYmd: string): string {
  // Fixed-width "YYYY-MM-DD" (en-CA locale format, same as todayYmd()) —
  // slice() avoids noUncheckedIndexedAccess noise from array destructuring.
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  const date = new Date(year, month - 1, day);
  const long = date.toLocaleDateString("pt-BR", { weekday: "long" });
  // "terça-feira" → "Terça" (TIMELINE.md §5.1's own example). Intl's
  // pt-BR "long" weekday always appends "-feira" except sábado/domingo,
  // which have none — splitting on "-" and keeping the first segment
  // handles both uniformly instead of a 7-entry lookup table.
  const firstWord = long.split("-")[0] as string;
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

/** "21 de julho" (day + full month, no year) — TIMELINE.md §5.1's day
 * header. `formatDate` (packages/ui) is scoped to dd/mm/aaaa only; this
 * is Timeline-specific long-form display, same page-local pattern as
 * `dayOfWeek`/`shortDate` above. */
function longDayMonth(dateYmd: string): string {
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

// §3's accounts popover row: "ponto colorido da instituição" — neither
// AccountDto/CardDto nor InstitutionDto carries a color field, and no
// per-institution color table exists anywhere in the app (verified: no
// hit for institutionColor/brandColor/hashColor). The dot is purely a
// "these are different institutions" visual cue, not a source of truth
// for any institution's real brand color, so a stable hash into the
// existing brand palette is enough. Judgment call — flagged in the
// plan's report.
const ACCOUNT_DOT_HUES = [
  "bg-[var(--lr-petrol-600)]",
  "bg-[var(--lr-gold-600)]",
  "bg-[var(--lr-terracota-600)]",
  "bg-[var(--lr-graphite-600)]",
];

function institutionDotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ACCOUNT_DOT_HUES[Math.abs(hash) % ACCOUNT_DOT_HUES.length] as string;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.9 15.9 0 0 1-4.1 4.9M6.3 6.3A15.6 15.6 0 0 0 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4.6-1" />
      <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1" />
    </svg>
  );
}

function NewTransactionDialog({
  open,
  onClose,
  accounts,
  cards,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountDto[];
  cards: CardDto[];
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<TxKind>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [sourceValue, setSourceValue] = useState<string | null>(null);
  const [destValue, setDestValue] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
  });

  const sourceOptions = useMemo(
    () => [
      ...accounts.map((a) => ({
        value: `acc:${a.id}`,
        label: `${a.institutionName}${a.name ? ` · ${a.name}` : ""}`,
      })),
      ...cards.map((c) => ({
        value: `card:${c.id}`,
        label: `Cartão ${c.institutionName}${c.name ? ` · ${c.name}` : ""}`,
      })),
    ],
    [accounts, cards],
  );

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((c) => kind === "transfer" || c.kind === kind)
        .map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data, kind],
  );

  function resolveTarget(value: string | null): {
    accountId?: string;
    creditCardId?: string;
  } {
    if (!value) return {};
    const [prefix, id] = value.split(":");
    return prefix === "acc" ? { accountId: id } : { creditCardId: id };
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateTxPayload) =>
      apiFetchJson<TransactionDto | TransactionDto[]>("/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setDescription("");
      setAmount("");
      setSourceValue(null);
      setDestValue(null);
      setCategoryId(null);
      setFormError(null);
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar a transação.",
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const cents = reaisToCentsPositive(amount);
    if (!description.trim()) {
      setFormError("Descreva a transação.");
      return;
    }
    if (cents === null) {
      setFormError("Informe um valor válido.");
      return;
    }
    if (!sourceValue) {
      setFormError("Escolha a conta ou o cartão.");
      return;
    }
    const source = resolveTarget(sourceValue);
    const base: CreateTxPayload = {
      kind,
      description: description.trim(),
      transactionDate: date,
      amountCents: cents,
      categoryId: categoryId ?? undefined,
    };
    if (kind === "transfer") {
      if (!source.accountId) {
        setFormError("A transferência sai de uma conta.");
        return;
      }
      if (!destValue) {
        setFormError("Escolha o destino da transferência.");
        return;
      }
      const dest = resolveTarget(destValue);
      createMutation.mutate({
        ...base,
        accountId: source.accountId,
        toAccountId: dest.accountId,
        toCreditCardId: dest.creditCardId,
      });
      return;
    }
    createMutation.mutate({ ...base, ...source });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova transação">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Segmented
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as TxKind)}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
            { value: "transfer", label: "Transferência" },
          ]}
        />
        <Input
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mercado, salário, aluguel…"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Valor"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            money
            affix="R$"
            inputMode="decimal"
            placeholder="0,00"
          />
          <Input
            label="Data"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            hint="AAAA-MM-DD"
          />
        </div>
        <Select
          label={kind === "transfer" ? "De (conta)" : "Conta ou cartão"}
          options={sourceOptions}
          value={sourceValue}
          onChange={setSourceValue}
          placeholder="Selecione…"
        />
        {kind === "transfer" ? (
          <Select
            label="Para (destino)"
            options={sourceOptions.filter((o) => o.value !== sourceValue)}
            value={destValue}
            onChange={setDestValue}
            placeholder="Selecione…"
          />
        ) : (
          <Select
            label="Categoria (opcional)"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Sem categoria"
          />
        )}
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface Chip {
  id: string;
  label: string;
}

interface ScheduledHandlers {
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
}

function transactionRowProps(
  tx: TransactionDto,
  scheduled: ScheduledHandlers,
  categoriesById: Map<string, CategoryDto>,
  expandedInstallments: Set<string>,
  onToggleInstallment: (id: string) => void,
) {
  const category = tx.categoryId
    ? categoriesById.get(tx.categoryId)
    : undefined;
  const common = {
    description: tx.description,
    date: tx.transactionDate,
    kind: tx.kind,
    amountCents: tx.amountCents,
    source: tx.source,
    categoryIcon: category ? (
      <CategoryIcon slug={category.icon} className="h-5 w-5 flex-none" />
    ) : undefined,
    categoryLabel:
      tx.installmentTotal && tx.installmentNumber
        ? `Parcela ${tx.installmentNumber}/${tx.installmentTotal}`
        : undefined,
  };
  if (tx.isScheduled) {
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        variant="scheduled"
        onConfirm={() => scheduled.onConfirm(tx.id)}
        onSkip={() => scheduled.onSkip(tx.id)}
        // Same as TransactionsPage (US-3.9) — inline editing from a row
        // isn't built anywhere yet, not a Timeline-specific gap.
        onEdit={() => {}}
        onDelete={() => scheduled.onDelete(tx.id)}
      />
    );
  }
  if (tx.kind === "transfer") {
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        variant="transfer"
        transferToLabel={tx.transferDirection === "out" ? "Saída" : "Entrada"}
      />
    );
  }
  if (tx.installmentGroupId && tx.installmentDetails) {
    return (
      <TransactionRow
        key={tx.id}
        {...common}
        // The dedicated badge (installmentNumber/installmentTotal) below
        // already shows "N/M" — dropping the "Parcela N/M" categoryLabel
        // here avoids saying it twice in the same row.
        categoryLabel={undefined}
        variant="installment"
        installment={tx.installmentDetails}
        expanded={expandedInstallments.has(tx.id)}
        onViewAllInstallments={() => onToggleInstallment(tx.id)}
      />
    );
  }
  return <TransactionRow key={tx.id} {...common} variant="default" />;
}

/** US-6.1's paired-transfer rendering (§6.12): a transfer is 2 Transaction
 * rows sharing transferPairId (one "out", one "in") — TransferPairCard
 * collapses them into a single card instead of 2 separate TransactionRows.
 * Only searches the same day's items (brief's stated scope): a transfer
 * whose pair lands on a different day — shouldn't happen since both legs
 * share one transactionDate, but the API doesn't guarantee it — falls back
 * to each leg rendering as its own "transfer" variant TransactionRow. */
function findTransferPair(
  tx: TransactionDto,
  items: TimelineItemDto[],
): TransactionDto | undefined {
  for (const item of items) {
    if (
      item.itemType === "transaction" &&
      item.transaction.id !== tx.id &&
      item.transaction.transferPairId === tx.transferPairId &&
      item.transaction.transferDirection === "in"
    ) {
      return item.transaction;
    }
  }
  return undefined;
}

/** True when `tx` (the "in" leg of a transfer) has a same-day "out" pair —
 * i.e. TransferPairCard already rendered this transfer once via that "out"
 * leg (findTransferPair above), so the "in" leg itself should render
 * nothing rather than show the same transfer a second time. */
function hasOutTransferPair(
  tx: TransactionDto,
  items: TimelineItemDto[],
): boolean {
  return items.some(
    (item) =>
      item.itemType === "transaction" &&
      item.transaction.id !== tx.id &&
      item.transaction.transferPairId === tx.transferPairId &&
      item.transaction.transferDirection === "out",
  );
}

/** Resolves a transfer leg's own account/card into TransferPairCard's
 * TransferAccount shape. balanceAfterCents is a best-effort stand-in for
 * "balance right after this transfer" — GET /v1/timeline only returns each
 * account/card's *current* balance, not a point-in-time snapshot, and
 * TransferPairCard doesn't render this field today anyway (see Task 8
 * report), so the gap is invisible but real if that changes later. */
function resolveTransferParty(
  tx: TransactionDto,
  accountsById: Map<string, AccountDto>,
  cardsById: Map<string, CardDto>,
): TransferAccount {
  if (tx.accountId) {
    const account = accountsById.get(tx.accountId);
    return {
      name: account?.name || account?.institutionName || "Conta",
      institution: account?.institutionName ?? "",
      balanceAfterCents: account?.balanceCents ?? 0,
    };
  }
  if (tx.creditCardId) {
    const card = cardsById.get(tx.creditCardId);
    return {
      name: card?.name || card?.institutionName || "Cartão",
      institution: card?.institutionName ?? "",
      balanceAfterCents: card ? -card.usedCents : 0,
    };
  }
  return { name: "Conta", institution: "", balanceAfterCents: 0 };
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-32 rounded-[var(--lr-r-md)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
      <Skeleton className="h-16 w-full rounded-[var(--lr-r-lg)]" />
    </div>
  );
}

/** US-4.1's simplest case: no institution, so it's a small Dialog instead
 * of a trip to AccountsPage — a wallet is just an amount, not worth a
 * screen change for. Opened from the "Carteira" activation Alert below. */
function WalletDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (openingBalanceCents: number) =>
      apiFetchJson("/accounts", {
        method: "POST",
        body: JSON.stringify({ type: "cash", openingBalanceCents }),
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível registrar a carteira.",
      );
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cents = reaisToCentsOrZero(amount);
    if (cents === null) {
      setFormError("Informe um valor válido.");
      return;
    }
    setFormError(null);
    createMutation.mutate(cents);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Carteira">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="text-[.9375rem] text-[var(--lr-text-secondary)]">
          Quanto de dinheiro físico você tem hoje?
        </p>
        <Input
          money
          label="Valor"
          affix="R$"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Adicionar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TimelinePage() {
  const { isBooting, user } = useAuth();
  const navigate = useNavigate();
  const hasSession = !isBooting && Boolean(user);
  const [hiddenChipIds, setHiddenChipIds] = useState<Set<string>>(new Set());
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [periodRange, setPeriodRange] = useState<CalendarRange>(() =>
    thisMonthRange(),
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [eventTypesOpen, setEventTypesOpen] = useState(false);
  const [hiddenEventGroupIds, setHiddenEventGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  // Task 10 (§6.12) — per-row "ver todas as parcelas" toggle for the
  // installment TransactionRow variant, keyed by transaction id.
  const [expandedInstallments, setExpandedInstallments] = useState<Set<string>>(
    new Set(),
  );
  const queryClient = useQueryClient();

  function toggleInstallment(id: string) {
    setExpandedInstallments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEventGroup(id: string) {
    setHiddenEventGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // Never let every group be hidden at once — GET /v1/timeline treats an
      // empty `types` CSV the same as "no filter at all" (splitCsv collapses
      // `[]` back to `undefined`), so hiding the last visible group would
      // silently show everything instead of nothing.
      if (prev.size >= EVENT_TYPE_GROUPS.length - 1) return prev;
      next.add(id);
      return next;
    });
  }

  const invalidateTimeline = () =>
    queryClient.invalidateQueries({ queryKey: ["timeline"] });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  const skipMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}/skip`, { method: "POST" }),
    onSuccess: invalidateTimeline,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTimeline();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  const scheduledHandlers: ScheduledHandlers = {
    onConfirm: (id) => confirmMutation.mutate(id),
    onSkip: (id) => skipMutation.mutate(id),
    onDelete: (id) => deleteMutation.mutate(id),
  };

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetchJson<AccountDto[]>("/accounts"),
    enabled: hasSession,
  });
  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetchJson<CardDto[]>("/cards"),
    enabled: hasSession,
  });
  // "Disponível hoje" and "Patrimônio total" (§6, aside) both used to
  // render the same ad-hoc netBalanceCents-minus-invoices value — they're
  // distinct figures (IMPLEMENTACAO.md §3.2/§3.5) already computed
  // correctly by the canonical @lurem/core formulas and already exposed by
  // GET /v1/insights/dashboard (used today by DashboardPage.tsx). No API
  // change: this just calls an endpoint that already exists.
  const insightsQuery = useQuery({
    queryKey: ["insights", "dashboard"],
    queryFn: () => apiFetchJson<DashboardInsights>("/insights/dashboard"),
    enabled: hasSession,
  });

  // US-4.1 — while any of the 3 items is missing, the Timeline shows
  // activation cards for just the missing ones instead of the feed (never a
  // linear wizard: each card is independent, any order, and the ones already
  // done simply aren't rendered). Only once all 3 exist does the real
  // day-grouped feed take over. Loading is treated as "not pending yet" —
  // rendering activation cards for a beat while accounts/cards are still in
  // flight would flash them for a returning user who already has data.
  const accountsLoaded = accountsQuery.isSuccess;
  const cardsLoaded = cardsQuery.isSuccess;
  const hasWallet = (accountsQuery.data ?? []).some((a) => a.type === "cash");
  const hasBankAccount = (accountsQuery.data ?? []).some(
    (a) => a.type !== "cash",
  );
  const hasCard = (cardsQuery.data ?? []).length > 0;
  const pendingActivation =
    accountsLoaded && cardsLoaded
      ? (
          [
            !hasWallet && "wallet",
            !hasBankAccount && "accounts",
            !hasCard && "cards",
          ] as const
        ).filter((v): v is "wallet" | "accounts" | "cards" => v !== false)
      : [];
  const activationDoneCount =
    accountsLoaded && cardsLoaded
      ? Number(hasWallet) + Number(hasBankAccount) + Number(hasCard)
      : 0;

  const chips: Chip[] = useMemo(
    () => [
      ...(accountsQuery.data ?? []).map((a) => ({
        id: a.id,
        label: a.name || a.institutionName,
      })),
      ...(cardsQuery.data ?? []).map((c) => ({
        id: c.id,
        label: c.name || c.institutionName,
      })),
    ],
    [accountsQuery.data, cardsQuery.data],
  );

  const visibleAccountIds = (accountsQuery.data ?? [])
    .map((a) => a.id)
    .filter((id) => !hiddenChipIds.has(id));
  const visibleCardIds = (cardsQuery.data ?? [])
    .map((c) => c.id)
    .filter((id) => !hiddenChipIds.has(id));
  const hasActiveFilter = hiddenChipIds.size > 0;

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetchJson<CategoryDto[]>("/categories"),
    enabled: hasSession,
  });

  // O(1) lookups for the items render loop below — built once per data
  // change instead of a .find() per row per re-render.
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );
  const accountsById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, a])),
    [accountsQuery.data],
  );
  const cardsById = useMemo(
    () => new Map((cardsQuery.data ?? []).map((c) => [c.id, c])),
    [cardsQuery.data],
  );

  const eventTypesFilterActive = hiddenEventGroupIds.size > 0;
  const visibleEventTypes = eventTypesFilterActive
    ? EVENT_TYPE_GROUPS.filter((g) => !hiddenEventGroupIds.has(g.id)).flatMap(
        (g) => g.types,
      )
    : undefined;
  const eventTypesTriggerLabel = eventTypesFilterActive
    ? `Tipo de evento (${EVENT_TYPE_GROUPS.length - hiddenEventGroupIds.size}/${EVENT_TYPE_GROUPS.length})`
    : "Todos os tipos";
  const categoryFilterLabel = categoryFilterId
    ? ((categoriesQuery.data ?? []).find((c) => c.id === categoryFilterId)
        ?.name ?? "Categoria")
    : "Todas as categorias";

  const timelineQuery = useInfiniteQuery({
    queryKey: [
      "timeline",
      [...hiddenChipIds].sort(),
      visibleEventTypes,
      categoryFilterId,
      periodRange.from ? toYmd(periodRange.from) : null,
      periodRange.to ? toYmd(periodRange.to) : null,
    ],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      if (hasActiveFilter) {
        params.set("accountIds", visibleAccountIds.join(","));
        params.set("cardIds", visibleCardIds.join(","));
      }
      if (visibleEventTypes) params.set("types", visibleEventTypes.join(","));
      if (categoryFilterId) params.set("categoryId", categoryFilterId);
      if (periodRange.from) params.set("from", toYmd(periodRange.from));
      if (periodRange.to) params.set("to", toYmd(periodRange.to));
      const qs = params.toString();
      return apiFetchJson<TimelinePageDto>(`/timeline${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: hasSession,
  });

  const alertedEntities: AlertedEntity[] = [
    ...(accountsQuery.data ?? [])
      .filter((a) => a.isOverLimit)
      .map(
        (a): AlertedEntity => ({
          id: a.id,
          kind: "account",
          institutionName: a.institutionName,
          overAmountCents: Math.abs(a.balanceCents) - a.overdraftLimitCents,
          onConfigure: () => {},
        }),
      ),
    ...(cardsQuery.data ?? [])
      .filter((c) => c.isOverLimit)
      .map(
        (c): AlertedEntity => ({
          id: c.id,
          kind: "card",
          institutionName: c.institutionName,
          usagePercent: (c.usedCents / c.limitCents) * 100,
          onConfigure: () => {},
        }),
      ),
  ];

  const netBalanceCents = (accountsQuery.data ?? []).reduce(
    (sum, a) => sum + a.balanceCents,
    0,
  );
  const openInvoices = (cardsQuery.data ?? []).filter((c) => c.usedCents > 0);
  const totalInvoicesCents = openInvoices.reduce(
    (sum, c) => sum + c.usedCents,
    0,
  );

  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (!user) {
    return <Navigate to="/login" />;
  }

  const days = timelineQuery.data?.pages.flatMap((page) => page.days) ?? [];
  const { greeting, dateLabel } = greetingAndDate();

  return (
    <div className="mx-auto max-w-[1180px] px-12 pt-10 pb-24">
      {!user.hasCompleteProfile ? (
        <div className="mb-6">
          <ProfileIncompleteAlert
            onGoToSettings={() => navigate({ to: "/settings" })}
          />
        </div>
      ) : null}

      {alertedEntities.length > 0 ? (
        <div className="mb-6">
          <TimelineAlertBanner entities={alertedEntities} />
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-7 flex items-end justify-between gap-6">
            <div>
              <p className="lr-label mb-2">{dateLabel}</p>
              <h1 className="mb-1.5 text-[2rem] font-normal tracking-[-0.02em] text-[var(--lr-text)]">
                {greeting}, {user.name}.
              </h1>
              <Body muted>
                A narrativa do seu dinheiro — causa e efeito, dia a dia.
              </Body>
            </div>
            {/* Hidden during ativação (§6.11): sem conta/cartão cadastrado, os
                selects de destino do NewTransactionDialog ficam vazios e o
                usuário nunca consegue submeter o formulário — um beco sem
                saída em vez de um botão utilizável. "Importar" (§2) fica de fora:
                o pipeline de importação/revisão ainda não existe no app (design
                doc de conformância, decisão de escopo #1). */}
            {pendingActivation.length === 0 ? (
              <Button
                variant="secondary"
                icon={
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                }
                onClick={() => setTxDialogOpen(true)}
              >
                Nova transação
              </Button>
            ) : null}
          </div>
          <NewTransactionDialog
            open={txDialogOpen}
            onClose={() => setTxDialogOpen(false)}
            accounts={accountsQuery.data ?? []}
            cards={cardsQuery.data ?? []}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["timeline"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
            }}
          />

          {pendingActivation.length > 0 ? (
            <div>
              <p className="mb-4 text-sm text-[var(--lr-text-secondary)]">
                {activationDoneCount} de 3 concluídos
              </p>
              <div className="flex flex-col gap-3">
                {hasWallet ? (
                  <Alert
                    variant="success"
                    title="Carteira registrada"
                    description="Seu dinheiro físico já faz parte da Timeline."
                  />
                ) : (
                  <Alert
                    variant="warning"
                    title="Carteira"
                    description="Quanto de dinheiro físico você tem hoje?"
                    actions={[
                      {
                        label: "Adicionar",
                        onClick: () => setWalletDialogOpen(true),
                      },
                    ]}
                  />
                )}
                {hasBankAccount ? (
                  <Alert
                    variant="success"
                    title="Contas registradas"
                    description="Suas contas já aparecem na Timeline."
                  />
                ) : (
                  <Alert
                    variant="info"
                    title="Contas"
                    description="Adicione as contas de banco onde seu dinheiro vive — corrente ou poupança."
                    actions={[
                      {
                        label: "Adicionar contas",
                        onClick: () => navigate({ to: "/accounts" }),
                      },
                    ]}
                  />
                )}
                {hasCard ? (
                  <Alert
                    variant="success"
                    title="Cartões registrados"
                    description="Seus cartões já aparecem na Timeline."
                  />
                ) : (
                  <Alert
                    variant="info"
                    title="Cartões"
                    description="Adicione seus cartões de crédito — limite, fechamento e vencimento."
                    actions={[
                      {
                        label: "Adicionar cartões",
                        onClick: () => navigate({ to: "/accounts" }),
                      },
                    ]}
                  />
                )}
              </div>
              <WalletDialog
                open={walletDialogOpen}
                onClose={() => setWalletDialogOpen(false)}
                onCreated={() =>
                  queryClient.invalidateQueries({ queryKey: ["accounts"] })
                }
              />
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2.5 border-y border-[var(--lr-border)] py-3">
                <span className="lr-label">MOSTRAR</span>
                {chips.length > 0 ? (
                  <FilterPopover
                    label="Filtrar por conta ou cartão"
                    triggerLabel={
                      hasActiveFilter
                        ? `${chips.length - hiddenChipIds.size} de ${chips.length} contas`
                        : "Todas as contas"
                    }
                    open={accountsOpen}
                    onOpenChange={setAccountsOpen}
                  >
                    <div className="flex w-[260px] flex-col gap-0.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-1.5 shadow-[var(--lr-e2)]">
                      {chips.map((chip) => {
                        const checked = !hiddenChipIds.has(chip.id);
                        // Same guard as the event-type filter above: an empty
                        // accountIds/cardIds CSV collapses back to "no filter"
                        // server-side (splitCsv, apps/api/src/timeline/routes.ts),
                        // so hiding the last visible chip would silently show
                        // everything instead of nothing.
                        const isLastVisible =
                          checked && hiddenChipIds.size >= chips.length - 1;
                        return (
                          <div
                            key={chip.id}
                            className="flex items-center gap-2.5 rounded-[var(--lr-r-sm)] px-2 py-1.5"
                          >
                            <span
                              aria-hidden="true"
                              className={[
                                "h-2 w-2 flex-none rounded-full",
                                institutionDotColor(chip.id),
                              ].join(" ")}
                            />
                            <span className="min-w-0 flex-1 truncate text-[.875rem] text-[var(--lr-text)]">
                              {chip.label}
                            </span>
                            <button
                              type="button"
                              aria-label={
                                isLastVisible
                                  ? `${chip.label} — última conta visível`
                                  : `${checked ? "Ocultar" : "Mostrar"} ${chip.label}`
                              }
                              disabled={isLastVisible}
                              onClick={() =>
                                setHiddenChipIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(chip.id)) next.delete(chip.id);
                                  else next.add(chip.id);
                                  return next;
                                })
                              }
                              className={[
                                "flex h-7 w-7 flex-none items-center justify-center rounded-[var(--lr-r-sm)] [&>svg]:h-4 [&>svg]:w-4",
                                "text-[var(--lr-text-secondary)] hover:bg-[var(--lr-surface-sunken)] hover:text-[var(--lr-text)]",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                              ].join(" ")}
                            >
                              <EyeIcon open={checked} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </FilterPopover>
                ) : null}

                <FilterPopover
                  label="Filtrar por período"
                  triggerLabel={periodLabel(periodRange)}
                  open={periodOpen}
                  onOpenChange={setPeriodOpen}
                >
                  <Calendar
                    label="Selecione o período"
                    mode="range"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selected={periodRange}
                    onSelect={(value) => {
                      const range = value as CalendarRange;
                      setPeriodRange(range);
                      if (range.from && range.to) setPeriodOpen(false);
                    }}
                    footer={
                      <>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setPeriodRange(thisMonthRange());
                            setPeriodOpen(false);
                          }}
                        >
                          Este mês
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setPeriodRange({});
                            setPeriodOpen(false);
                          }}
                        >
                          Limpar
                        </Button>
                      </>
                    }
                  />
                </FilterPopover>

                <FilterPopover
                  label="Filtrar por tipo de evento"
                  triggerLabel={eventTypesTriggerLabel}
                  open={eventTypesOpen}
                  onOpenChange={setEventTypesOpen}
                >
                  <div className="flex w-64 flex-col gap-2.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-3.5 shadow-[var(--lr-e2)]">
                    {EVENT_TYPE_GROUPS.map((group) => {
                      const checked = !hiddenEventGroupIds.has(group.id);
                      const isLastVisible =
                        checked &&
                        hiddenEventGroupIds.size >=
                          EVENT_TYPE_GROUPS.length - 1;
                      return (
                        <Checkbox
                          key={group.id}
                          label={group.label}
                          checked={checked}
                          disabled={isLastVisible}
                          onChange={() => toggleEventGroup(group.id)}
                        />
                      );
                    })}
                  </div>
                </FilterPopover>

                <FilterPopover
                  label="Filtrar por categoria"
                  triggerLabel={categoryFilterLabel}
                  open={categoryOpen}
                  onOpenChange={setCategoryOpen}
                >
                  <div className="flex w-56 flex-col overflow-hidden rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] py-1 shadow-[var(--lr-e2)]">
                    {[
                      {
                        id: null as string | null,
                        label: "Todas as categorias",
                      },
                      ...(categoriesQuery.data ?? []).map((c) => ({
                        id: c.id,
                        label: c.name,
                      })),
                    ].map((option) => (
                      <button
                        key={option.id ?? "__all__"}
                        type="button"
                        onClick={() => {
                          setCategoryFilterId(option.id);
                          setCategoryOpen(false);
                        }}
                        className={[
                          "px-3.5 py-2 text-left text-[.875rem]",
                          // REBRAND (Task 1.3): blue-100/700 -> petrol-100/700.
                          // Not in the task-1.3 brief's original site list (this
                          // usage was missed by the recon grep) but structurally
                          // identical to Select.tsx's "selected item" treatment
                          // (same classes, same purpose: a selected filter
                          // option) — classified as selection-state/Petrol per
                          // DESIGN_SYSTEM.md §1.2, not the info/link/graphite
                          // bucket, despite living in the same file as the
                          // graphite-classified plain link further down.
                          categoryFilterId === option.id
                            ? "bg-[var(--lr-petrol-100)] font-bold text-[var(--lr-text)] dark:bg-[var(--lr-petrol-700)]/30"
                            : "text-[var(--lr-text)] hover:bg-[var(--lr-surface-sunken)]",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </FilterPopover>
              </div>

              {timelineQuery.isLoading ? <TimelineSkeleton /> : null}
              {timelineQuery.isError ? (
                <p
                  role="alert"
                  className="text-[var(--lr-negative)] dark:text-[var(--lr-negative)]"
                >
                  Não foi possível carregar a timeline.
                </p>
              ) : null}
              {!timelineQuery.isLoading && days.length === 0 ? (
                <EmptyState
                  title="Nada por aqui ainda"
                  description="Suas contas, cartões e transações vão aparecer aqui conforme você usar o Lurem."
                />
              ) : null}

              <div className="flex flex-col gap-6">
                {days.map((day) => {
                  const today = isToday(day.date);
                  const dow = dayOfWeek(day.date);

                  return (
                    <section
                      key={day.date}
                      className={
                        today
                          ? "rounded-[var(--lr-r-md)] bg-[var(--lr-surface-sunken)] p-4"
                          : ""
                      }
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-[.8125rem] font-bold text-[var(--lr-text)]">
                          {today ? "HOJE · " : ""}
                          {longDayMonth(day.date)}
                          {today ? (
                            // Badge has no literal "warning" status (TIMELINE.md §5.1 wants
                            // hmc-badge--warning) — "pending" is Badge's own gold/warning-toned
                            // entry (see Badge.tsx STATUS_STYLES.pending), the closest existing
                            // match without adding a 6th BadgeStatus for one call site.
                            // Judgment call — flagged in the plan's report.
                            <Badge kind="status" status="pending">
                              {dow}
                            </Badge>
                          ) : null}
                        </h2>
                        <div className="flex items-baseline gap-2 rounded-full bg-[var(--lr-surface)] px-3 py-1 text-[.75rem]">
                          <span className="uppercase tracking-widest text-[var(--lr-text-secondary)]">
                            Saldo do dia
                          </span>
                          <Mono
                            variant="number"
                            className="text-[.8125rem] text-[var(--lr-text)]"
                          >
                            {formatMoney(day.balanceCents)}
                          </Mono>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {day.items.map((item) => {
                          if (item.itemType !== "transaction") {
                            return (
                              <TimelineEventRow
                                key={item.id}
                                // DomainEvent.type/payload are untyped String/Json
                                // at the DB boundary (§6 catalog) —
                                // TimelineEventRow owns the actual type union, so
                                // this cast is the API contract's boundary, not a
                                // real type escape.
                                type={item.type as DomainEventType}
                                payload={item.payload}
                                createdAt={item.createdAt}
                              />
                            );
                          }

                          const tx = item.transaction;

                          // Transfer pair: the "out" leg renders a single
                          // TransferPairCard for both legs; the "in" leg (found
                          // below) renders nothing so it isn't shown twice.
                          if (
                            tx.kind === "transfer" &&
                            tx.transferDirection === "out" &&
                            tx.transferPairId
                          ) {
                            const pair = findTransferPair(tx, day.items);
                            if (pair) {
                              return (
                                <TransferPairCard
                                  key={tx.id}
                                  amountCents={tx.amountCents}
                                  from={resolveTransferParty(
                                    tx,
                                    accountsById,
                                    cardsById,
                                  )}
                                  to={resolveTransferParty(
                                    pair,
                                    accountsById,
                                    cardsById,
                                  )}
                                />
                              );
                            }
                          }
                          if (
                            tx.kind === "transfer" &&
                            tx.transferDirection === "in" &&
                            tx.transferPairId &&
                            hasOutTransferPair(tx, day.items)
                          ) {
                            // Already rendered above via its "out" pair.
                            return null;
                          }

                          return transactionRowProps(
                            tx,
                            scheduledHandlers,
                            categoriesById,
                            expandedInstallments,
                            toggleInstallment,
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {timelineQuery.hasNextPage ? (
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    loading={timelineQuery.isFetchingNextPage}
                    onClick={() => timelineQuery.fetchNextPage()}
                  >
                    Carregar mais
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-10">
          <Card>
            <p className="lr-label mb-1">Saldo líquido</p>
            <Mono
              variant="number"
              className="text-[2rem] tracking-[-0.02em] text-[var(--lr-text)]"
            >
              {formatMoney(netBalanceCents)}
            </Mono>
            {/* §6.12 item 6 — quebra por conta/instituição sob o total. */}
            {(accountsQuery.data ?? []).length > 0 ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-[var(--lr-border)] pt-3">
                {(accountsQuery.data ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <InstitutionMark
                      logoUrl={a.logoUrl}
                      name={a.type === "cash" ? "Carteira" : a.institutionName}
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
              {insightsQuery.data ? (
                <Mono
                  variant="number"
                  tone={
                    insightsQuery.data.patrimonioTotal.valueCents < 0
                      ? "out"
                      : "default"
                  }
                  className="text-[.9375rem]"
                >
                  {formatMoney(insightsQuery.data.patrimonioTotal.valueCents)}
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
                <p className="lr-label mb-1 text-[.625rem]">DISPONÍVEL HOJE</p>
                {insightsQuery.data ? (
                  <Mono
                    variant="number"
                    className="text-[1.5rem] text-[var(--lr-text)]"
                  >
                    {formatMoney(insightsQuery.data.disponivelHoje.valueCents)}
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
        </aside>
      </div>
    </div>
  );
}
