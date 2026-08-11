// apps/api/src/timeline/aggregate.ts
// BACKLOG.md US-6.1 — Transaction + DomainEvent interleaved, agregado por dia
// (ARQUITETURA.md §6.12). Função pura: I/O (filtros, fetch) fica em routes.ts;
// aqui só agrupamento + paginação por cursor, testável sem banco.
import type { DomainEvent, Transaction } from "@lurem/db";
import {
  type InstallmentDetail,
  toTransactionResponse,
} from "../transactions/serialize.js";

export type { InstallmentDetail };

export interface TimelineEventItem {
  itemType: "event";
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  aggregateType: string;
  aggregateId: string;
}

export interface TimelineTransactionItem {
  itemType: "transaction";
  transaction: ReturnType<typeof toTransactionResponse>;
}

export type TimelineItem = TimelineEventItem | TimelineTransactionItem;

export interface TimelineDayWithoutBalance {
  date: string;
  items: TimelineItem[];
}

export interface TimelineDay extends TimelineDayWithoutBalance {
  balanceCents: number;
}

export interface TimelinePage {
  days: TimelineDay[];
  nextCursor: string | null;
}

export interface TimelinePageWithoutBalance {
  days: TimelineDayWithoutBalance[];
  nextCursor: string | null;
}

// Datas-calendário puras (transactionDate, @db.Date) já são meia-noite UTC —
// ler com getters UTC direto (mesmo padrão de transactions/serialize.ts's
// `ymd`). Eventos carregam um instante real (createdAt) — dia calendário é
// América/Sao_Paulo (§0 do projeto: "fuso America/Sao_Paulo para lógica de
// data"), lido via Intl com timeZone fixo (mesmo padrão de @lurem/core's
// saoPauloYMD, reimplementado aqui só para não puxar @lurem/core por uma
// formatação de data que não é matemática de dinheiro).
const SAO_PAULO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function transactionDay(tx: Transaction): string {
  return tx.transactionDate.toISOString().slice(0, 10);
}

function eventDay(event: DomainEvent): string {
  return SAO_PAULO_DAY.format(event.createdAt);
}

interface SortableItem {
  date: string;
  timestamp: number;
  item: TimelineItem;
}

const GOOGLE_PLACEHOLDER_BIRTH_DATE = "1970-01-01";

/**
 * One synthetic "known future/structural day" contributed by a source (see
 * `synthesizeStructuralDates` below). `dates` alone (no `event`) is the
 * original birthday/join-day case: the day must exist in the page, but the
 * client renders its own Alert for it (dateHelpers.ts's
 * `isBirthday`/`isJoinDay`) instead of a catalog event. `event` is the
 * generalization added for card invoice projections and the global
 * calendar (Item A/B): it renders as a normal `TimelineEventRow` even
 * though no real `DomainEvent` row exists yet for that day.
 */
export interface StructuralDateSource {
  dates: string[];
  event?: {
    type: string;
    payload: unknown;
    aggregateType: string;
    aggregateId: string;
  };
}

export interface SyntheticStructuralItem {
  date: string;
  type: string;
  payload: unknown;
  aggregateType: string;
  aggregateId: string;
}

/**
 * Days with no transaction/event but that still must appear (issues.md: "Se
 * o dia não tem transação, mas tem algum outro evento, tipo, aniversário,
 * ainda assim você deve exibir este dia") — birthday (every year since the
 * user joined) and the join day itself. Client renders the actual Alert
 * (dateHelpers.ts's `isBirthday`/`isJoinDay`); this only guarantees the day
 * exists in the page so the client gets a chance to render it.
 *
 * This year's birthday is included even if it hasn't happened yet
 * (issues.md: registering a birthday for tomorrow must show up today, not
 * wait for the day to arrive — same idea as a scheduled transaction showing
 * ahead of its date). The loop below only ever reaches one year past
 * `today`'s year at most, so this can't spiral into showing every future
 * year's birthday — just the next upcoming one.
 */
export function birthdayJoinSource(
  user: { birthDate: Date | null; createdAt: Date },
  today: Date = new Date(),
): StructuralDateSource {
  const todayYmd = SAO_PAULO_DAY.format(today);
  const joinYmd = SAO_PAULO_DAY.format(user.createdAt);
  const dates = new Set<string>([joinYmd]);

  if (user.birthDate) {
    const birthIso = user.birthDate.toISOString().slice(0, 10);
    if (birthIso !== GOOGLE_PLACEHOLDER_BIRTH_DATE) {
      const monthDay = birthIso.slice(5, 10);
      const startYear = Number(joinYmd.slice(0, 4));
      const endYear = Number(todayYmd.slice(0, 4));
      for (let year = startYear; year <= endYear; year++) {
        dates.add(`${year}-${monthDay}`);
      }
    }
  }

  // Never before the user existed — a birthday the same calendar year they
  // joined, but before the join date, isn't a real timeline day for them.
  return { dates: [...dates].filter((date) => date >= joinYmd) };
}

/**
 * Generalized "known future/structural day" projection (BACKLOG: calendário
 * global + fechamento/vencimento de fatura com antecedência). Takes any
 * number of independent sources — each just a list of dates plus an
 * optional event to render on them — and merges them into the set of dates
 * that must exist in the page (`dates`) and the synthetic timeline items to
 * inject on those dates (`items`). Callers build one source per
 * "known-in-advance" thing: `birthdayJoinSource` above (no event), one pair
 * per credit card (closing/due projection, invoice-status.ts's
 * `nextInvoiceMilestones`), one per `GlobalCalendarEntry`.
 */
export function synthesizeStructuralDates(sources: StructuralDateSource[]): {
  dates: string[];
  items: SyntheticStructuralItem[];
} {
  const dateSet = new Set<string>();
  const items: SyntheticStructuralItem[] = [];

  for (const source of sources) {
    for (const date of source.dates) {
      dateSet.add(date);
      if (source.event) {
        items.push({
          date,
          type: source.event.type,
          payload: source.event.payload,
          aggregateType: source.event.aggregateType,
          aggregateId: source.event.aggregateId,
        });
      }
    }
  }

  return { dates: [...dateSet], items };
}

export function buildTimelinePage(
  transactions: Transaction[],
  events: DomainEvent[],
  opts: {
    cursor?: string;
    limit: number;
    structuralDates?: string[];
    structuralItems?: SyntheticStructuralItem[];
  },
): TimelinePageWithoutBalance {
  const installmentsByGroupId = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.installmentGroupId) {
      if (!installmentsByGroupId.has(tx.installmentGroupId)) {
        installmentsByGroupId.set(tx.installmentGroupId, []);
      }
      const list = installmentsByGroupId.get(tx.installmentGroupId);
      if (list) list.push(tx);
    }
  }

  const sortable: SortableItem[] = [
    ...transactions.map((tx) => ({
      date: transactionDay(tx),
      timestamp: tx.transactionDate.getTime(),
      item: {
        itemType: "transaction" as const,
        transaction: toTransactionResponse(tx, installmentsByGroupId),
      },
    })),
    ...events.map((event) => ({
      date: eventDay(event),
      timestamp: event.createdAt.getTime(),
      item: {
        itemType: "event" as const,
        id: event.id,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
      },
    })),
  ];

  // Mais recente primeiro — a Timeline é um feed, não uma lista cronológica
  // ascendente; "carregar mais" (cursor) busca dias mais antigos.
  sortable.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.timestamp - a.timestamp;
  });

  const byDay = new Map<string, TimelineItem[]>();
  for (const entry of sortable) {
    if (opts.cursor && entry.date >= opts.cursor) continue;
    const list = byDay.get(entry.date) ?? [];
    list.push(entry.item);
    byDay.set(entry.date, list);
  }
  // Synthetic items (card invoice/global calendar projection) land in the
  // future, ahead of `today` — same "mais recente primeiro" ordering as
  // everything else below, so they surface at the top of the very first
  // page (no cursor) and never resurface once the cursor has moved past
  // them (§ cursor caution: this paginates back in time from `today`, it
  // never re-walks forward into dates already shown on an earlier page).
  for (const item of opts.structuralItems ?? []) {
    if (opts.cursor && item.date >= opts.cursor) continue;
    const list = byDay.get(item.date) ?? [];
    list.push({
      itemType: "event",
      id: `synthetic:${item.type}:${item.aggregateId}:${item.date}`,
      type: item.type,
      payload: item.payload,
      createdAt: `${item.date}T00:00:00.000Z`,
      aggregateType: item.aggregateType,
      aggregateId: item.aggregateId,
    });
    byDay.set(item.date, list);
  }
  for (const date of opts.structuralDates ?? []) {
    if (opts.cursor && date >= opts.cursor) continue;
    if (!byDay.has(date)) byDay.set(date, []);
  }

  const allDates = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));
  const pageDates = allDates.slice(0, opts.limit);
  const hasMore = allDates.length > opts.limit;

  return {
    days: pageDates.map((date) => ({
      date,
      // biome-ignore lint/style/noNonNullAssertion: date comes from byDay's own keys
      items: byDay.get(date)!,
    })),
    nextCursor: hasMore ? (pageDates.at(-1) ?? null) : null,
  };
}
