// apps/api/src/timeline/aggregate.test.ts
import { describe, expect, it } from "vitest";
import { synthesizeStructuralDates } from "./aggregate.js";

const TODAY = new Date("2026-07-15T15:00:00Z");

describe("synthesizeStructuralDates", () => {
  it("always includes the join day", () => {
    const dates = synthesizeStructuralDates(
      { birthDate: null, createdAt: new Date("2026-07-15T12:00:00Z") },
      TODAY,
    );
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("includes this year's birthday when it already happened", () => {
    const dates = synthesizeStructuralDates(
      {
        birthDate: new Date("1990-01-05"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
      TODAY,
    );
    expect(dates.sort()).toEqual(["2026-01-01", "2026-01-05"]);
  });

  it("includes this year's birthday even if it hasn't happened yet (issues.md: registering a birthday for tomorrow must show today)", () => {
    const dates = synthesizeStructuralDates(
      {
        birthDate: new Date("1990-12-25"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
      TODAY,
    );
    expect(dates.sort()).toEqual(["2026-01-01", "2026-12-25"]);
  });

  it("never predicts next year's birthday", () => {
    const dates = synthesizeStructuralDates(
      {
        birthDate: new Date("1990-01-05"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
      TODAY,
    );
    // 2026-01-05 already happened (TODAY is July) — 2027-01-05 must not
    // appear, only the current year's occurrence is ever synthesized.
    expect(dates.sort()).toEqual(["2026-01-01", "2026-01-05"]);
  });

  it("ignores the Google-signup placeholder birth date", () => {
    const dates = synthesizeStructuralDates(
      {
        birthDate: new Date("1970-01-01"),
        createdAt: new Date("2026-07-15T12:00:00Z"),
      },
      TODAY,
    );
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("repeats the birthday for every year since the user joined, but never before they joined", () => {
    const dates = synthesizeStructuralDates(
      {
        birthDate: new Date("1990-03-01"),
        createdAt: new Date("2024-07-15T12:00:00Z"),
      },
      TODAY,
    );
    // 2024-03-01 predates the join date (2024-07-15) — excluded.
    expect(dates.sort()).toEqual(["2024-07-15", "2025-03-01", "2026-03-01"]);
  });
});
