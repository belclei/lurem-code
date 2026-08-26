// IMPLEMENTACAO.md §3.4 — fechamento/vencimento de fatura, e §0 — toda lógica
// de "hoje"/dayOfMonth usa America/Sao_Paulo.
//
// ⚠ Deliberadamente NÃO usamos Date.prototype.getFullYear()/getMonth()/getDate()
// em nenhum lugar deste módulo para instantes (`asOf`): esses getters usam o
// fuso horário LOCAL do processo rodando o código, o que tornaria o resultado
// não-determinístico entre máquinas/CI (uma máquina em UTC e outra em
// America/Sao_Paulo dariam "hoje" diferente para o mesmo instante). Usamos
// Intl.DateTimeFormat com timeZone fixo — puro e determinístico, sem I/O e
// sem depender do relógio/fuso do ambiente (dependency-cruiser não pega essa
// classe de bug; é uma armadilha textual, documentada aqui).
//
// Para datas-calendário puras (sem instante associado — `transactionDate`,
// `startDate`, `closingDate` etc.), representamos sempre como meia-noite UTC
// e lemos com os getters `getUTC*()`, que são deterministicos em qualquer
// timezone de processo.

export interface DayOfMonthCard {
  closingDay: number;
  dueDay: number;
}

export interface YearMonth {
  year: number;
  month: number; // 1..12
}

const SAO_PAULO_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Extrai {year, month, day} de um instante, na data-calendário de America/Sao_Paulo. */
export function saoPauloYMD(instant: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = SAO_PAULO_FORMATTER.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Constrói uma data-calendário pura (meia-noite UTC representando o dia). */
export function makeDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  // Dia 0 do mês seguinte = último dia do mês atual.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** min(dia, últimoDiaDoMês(ano, mês)) — fechamento dia 31 em fevereiro nunca "pula" o mês. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

export function addMonths(
  { year, month }: YearMonth,
  delta: number,
): YearMonth {
  const zeroIndexed = month - 1 + delta;
  const y = year + Math.floor(zeroIndexed / 12);
  const m = ((zeroIndexed % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

/** closingDate(card, M) = clampDay(ano(M), mês(M), card.closingDay) */
export function closingDate(
  card: DayOfMonthCard,
  year: number,
  month: number,
): Date {
  return makeDate(year, month, clampDay(year, month, card.closingDay));
}

/**
 * dueDate(card, M) = próxima ocorrência de card.dueDay ESTRITAMENTE após
 * closingDate(card,M) — mesmo mês se dueDay > closingDay (valores nominais,
 * não clampados); senão mês seguinte. Com clampDay no resultado.
 */
export function dueDate(
  card: DayOfMonthCard,
  year: number,
  month: number,
): Date {
  const sameMonth = card.dueDay > card.closingDay;
  const { year: dueYear, month: dueMonth } = sameMonth
    ? { year, month }
    : addMonths({ year, month }, 1);
  return makeDate(dueYear, dueMonth, clampDay(dueYear, dueMonth, card.dueDay));
}

/** faturaPeriodo(card,M) = ( closingDate(card, M−1), closingDate(card, M) ] — intervalo semiaberto. */
export function faturaPeriodo(
  card: DayOfMonthCard,
  year: number,
  month: number,
): { start: Date; end: Date } {
  const previous = addMonths({ year, month }, -1);
  return {
    start: closingDate(card, previous.year, previous.month),
    end: closingDate(card, year, month),
  };
}

export function compareDates(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

/** Último dia do mês (America/Sao_Paulo) do instante dado, como data-calendário pura. */
export function endOfMonth(instant: Date): Date {
  const { year, month } = saoPauloYMD(instant);
  return makeDate(year, month, daysInMonth(year, month));
}

/** Data-calendário representando "hoje" (America/Sao_Paulo) para o instante dado. */
export function todayAsDate(instant: Date): Date {
  const { year, month, day } = saoPauloYMD(instant);
  return makeDate(year, month, day);
}

/**
 * Inversa de `faturaPeriodo`: o índice (ano, mês) da fatura cujo período
 * `(closingDate(M−1), closingDate(M)]` contém `date`.
 *
 * Só dois candidatos são possíveis: como `closingDate(M)` sempre cai dentro
 * do próprio mês calendário de M, uma data ou está em/antes do fechamento do
 * seu mês (fatura daquele mês) ou já passou dele (fatura do mês seguinte).
 * Mesmo padrão de "testar candidatos" de findOpenInvoiceMonth/
 * findClosedNotDueInvoiceMonth.
 *
 * `date` é uma data-calendário pura (meia-noite UTC), como transactionDate —
 * por isso lê com getUTC*, não com saoPauloYMD (que é para instantes).
 */
export function periodIndexForDate(
  card: DayOfMonthCard,
  date: Date,
): YearMonth {
  const base = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  return compareDates(date, closingDate(card, base.year, base.month)) <= 0
    ? base
    : addMonths(base, 1);
}
