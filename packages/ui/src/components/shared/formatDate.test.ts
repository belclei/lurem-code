import { describe, expect, it } from "vitest";
import { formatDate } from "./formatDate";

describe("formatDate", () => {
  it("formats an ISO date as dd/mm/aaaa", () => {
    expect(formatDate("2026-07-24T12:00:00.000Z")).toBe("24/07/2026");
  });

  it("pads single-digit day and month", () => {
    expect(formatDate("2026-01-05T12:00:00.000Z")).toBe("05/01/2026");
  });

  // Regression tests: calendar dates must render as the day written in the
  // ISO string, never shifted by timezone conversion (host TZ or America/Sao_Paulo).
  it("formats date-only ISO string as the literal calendar day", () => {
    expect(formatDate("2026-07-24")).toBe("24/07/2026");
  });

  it("formats midnight-UTC timestamp as the literal calendar day", () => {
    // "2026-07-24T00:00:00.000Z" must still read as 24/07, not shift to 23/07
    // via America/Sao_Paulo conversion — the date component is authoritative.
    expect(formatDate("2026-07-24T00:00:00.000Z")).toBe("24/07/2026");
  });

  it("still converts a real (non-midnight) instant through America/Sao_Paulo", () => {
    // Unlike a calendar date, a real instant's time-of-day is meaningful —
    // 2026-08-10T02:00:00.000Z is 2026-08-09 23:00 in São Paulo (UTC-3), a
    // day earlier than its UTC date component.
    expect(formatDate("2026-08-10T02:00:00.000Z")).toBe("09/08/2026");
  });
});
