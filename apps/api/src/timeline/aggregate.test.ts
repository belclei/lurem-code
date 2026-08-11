// apps/api/src/timeline/aggregate.test.ts
import { describe, expect, it } from "vitest";
import {
  birthdayJoinSource,
  buildTimelinePage,
  synthesizeStructuralDates,
} from "./aggregate.js";

const TODAY = new Date("2026-07-15T15:00:00Z");

describe("birthdayJoinSource + synthesizeStructuralDates", () => {
  it("always includes the join day", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        { birthDate: null, createdAt: new Date("2026-07-15T12:00:00Z") },
        TODAY,
      ),
    ]);
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("includes this year's birthday when it already happened", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        {
          birthDate: new Date("1990-01-05"),
          createdAt: new Date("2026-01-01T12:00:00Z"),
        },
        TODAY,
      ),
    ]);
    expect(dates.sort()).toEqual(["2026-01-01", "2026-01-05"]);
  });

  it("includes this year's birthday even if it hasn't happened yet (issues.md: registering a birthday for tomorrow must show today)", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        {
          birthDate: new Date("1990-12-25"),
          createdAt: new Date("2026-01-01T12:00:00Z"),
        },
        TODAY,
      ),
    ]);
    expect(dates.sort()).toEqual(["2026-01-01", "2026-12-25"]);
  });

  it("never predicts next year's birthday", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        {
          birthDate: new Date("1990-01-05"),
          createdAt: new Date("2026-01-01T12:00:00Z"),
        },
        TODAY,
      ),
    ]);
    // 2026-01-05 already happened (TODAY is July) — 2027-01-05 must not
    // appear, only the current year's occurrence is ever synthesized.
    expect(dates.sort()).toEqual(["2026-01-01", "2026-01-05"]);
  });

  it("ignores the Google-signup placeholder birth date", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        {
          birthDate: new Date("1970-01-01"),
          createdAt: new Date("2026-07-15T12:00:00Z"),
        },
        TODAY,
      ),
    ]);
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("repeats the birthday for every year since the user joined, but never before they joined", () => {
    const { dates } = synthesizeStructuralDates([
      birthdayJoinSource(
        {
          birthDate: new Date("1990-03-01"),
          createdAt: new Date("2024-07-15T12:00:00Z"),
        },
        TODAY,
      ),
    ]);
    // 2024-03-01 predates the join date (2024-07-15) — excluded.
    expect(dates.sort()).toEqual(["2024-07-15", "2025-03-01", "2026-03-01"]);
  });

  it("merges multiple sources' dates and collects each source's event", () => {
    const { dates, items } = synthesizeStructuralDates([
      birthdayJoinSource(
        { birthDate: null, createdAt: new Date("2026-07-15T12:00:00Z") },
        TODAY,
      ),
      {
        dates: ["2026-08-10"],
        event: {
          type: "card.invoice_closing_upcoming",
          payload: { totalCents: 1000 },
          aggregateType: "CreditCard",
          aggregateId: "card-1",
        },
      },
      {
        dates: ["2026-12-25"],
        event: {
          type: "calendar.global_entry",
          payload: { title: "Natal" },
          aggregateType: "GlobalCalendarEntry",
          aggregateId: "entry-1",
        },
      },
    ]);
    expect(dates.sort()).toEqual(["2026-07-15", "2026-08-10", "2026-12-25"]);
    expect(items).toEqual([
      {
        date: "2026-08-10",
        type: "card.invoice_closing_upcoming",
        payload: { totalCents: 1000 },
        aggregateType: "CreditCard",
        aggregateId: "card-1",
      },
      {
        date: "2026-12-25",
        type: "calendar.global_entry",
        payload: { title: "Natal" },
        aggregateType: "GlobalCalendarEntry",
        aggregateId: "entry-1",
      },
    ]);
  });
});

describe("buildTimelinePage structuralItems", () => {
  it("injects a synthetic event item on a future day with no transactions/events", () => {
    const page = buildTimelinePage([], [], {
      limit: 20,
      structuralItems: [
        {
          date: "2026-08-25",
          type: "card.invoice_due_upcoming",
          payload: { totalCents: 5000 },
          aggregateType: "CreditCard",
          aggregateId: "card-1",
        },
      ],
    });
    expect(page.days).toHaveLength(1);
    expect(page.days[0]?.date).toBe("2026-08-25");
    expect(page.days[0]?.items).toEqual([
      {
        itemType: "event",
        id: "synthetic:card.invoice_due_upcoming:card-1:2026-08-25",
        type: "card.invoice_due_upcoming",
        payload: { totalCents: 5000 },
        createdAt: "2026-08-25T00:00:00.000Z",
        aggregateType: "CreditCard",
        aggregateId: "card-1",
      },
    ]);
  });

  it("respects the cursor — a synthetic item on/after the cursor date is excluded (pagination navigates strictly backward)", () => {
    const page = buildTimelinePage([], [], {
      limit: 20,
      cursor: "2026-08-25",
      structuralItems: [
        {
          date: "2026-08-25",
          type: "card.invoice_due_upcoming",
          payload: {},
          aggregateType: "CreditCard",
          aggregateId: "card-1",
        },
        {
          date: "2026-08-24",
          type: "card.invoice_due_upcoming",
          payload: {},
          aggregateType: "CreditCard",
          aggregateId: "card-1",
        },
      ],
    });
    expect(page.days.map((d) => d.date)).toEqual(["2026-08-24"]);
  });
});
