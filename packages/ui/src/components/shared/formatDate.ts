const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
});

// Prisma always serializes a `@db.Date` column (a calendar date with no
// time-of-day, e.g. transactionDate, birthDate, dueDate) as exact UTC
// midnight — "AAAA-MM-DDT00:00:00.000Z" — never any other time. A real
// instant (e.g. a scheduled transaction's datetime) essentially never lands
// on that exact millisecond by chance, so it's a safe signal to tell the two
// apart.
const MIDNIGHT_UTC = /T00:00:00(\.000)?Z$/;

/**
 * Formats an ISO date/datetime string as pt-BR `dd/mm/aaaa` — `IMPLEMENTACAO.md
 * §7`. The only place in `@lurem/ui` allowed to format dates for display.
 *
 * Two different things flow through here: pure calendar dates (transaction
 * date, birth date, due date, ...), which must render the day exactly as
 * written regardless of host/display timezone; and real instants (e.g. a
 * scheduled transaction's datetime), which must convert through
 * America/Sao_Paulo to land on the correct calendar day. Converting a
 * calendar date through `Date` + timezone (as this used to do
 * unconditionally) shifts it a day for hosts west of UTC — that was the bug.
 */
export function formatDate(iso: string): string {
  if (!iso.includes("T") || MIDNIGHT_UTC.test(iso)) {
    const [y, m, d] = (iso.split("T")[0] ?? "").split("-").map(Number);
    if (!y || !m || !d) return iso;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  return DATE_FORMATTER.format(new Date(iso));
}
