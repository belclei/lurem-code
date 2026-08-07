import { describe, expect, it } from "vitest";
import { scheduledMetaText } from "./TransactionRow";

describe("scheduledMetaText", () => {
  it("reads 'Previsto para hoje' when the date is today in America/Sao_Paulo", () => {
    const now = new Date("2026-08-10T15:00:00.000Z"); // 12:00 in São Paulo (UTC-3)
    expect(scheduledMetaText("2026-08-10T09:00:00.000Z", now)).toBe(
      "Previsto para hoje · não entra no saldo",
    );
  });

  it("reads the formatted date when it's in the future", () => {
    const now = new Date("2026-08-10T15:00:00.000Z");
    expect(scheduledMetaText("2026-08-15T09:00:00.000Z", now)).toBe(
      "Previsto para 15/08/2026 · não entra no saldo",
    );
  });

  it("still reads the formatted date when it's in the past", () => {
    const now = new Date("2026-08-10T15:00:00.000Z");
    expect(scheduledMetaText("2026-08-01T09:00:00.000Z", now)).toBe(
      "Previsto para 01/08/2026 · não entra no saldo",
    );
  });

  it("treats a date near the UTC day boundary correctly for the São Paulo timezone", () => {
    // 2026-08-10T02:00:00Z is 2026-08-09 23:00 in São Paulo (UTC-3) — a
    // naive UTC-only comparison would wrongly call this "hoje" against a
    // `now` of 2026-08-10T15:00:00Z.
    const now = new Date("2026-08-10T15:00:00.000Z");
    expect(scheduledMetaText("2026-08-10T02:00:00.000Z", now)).toBe(
      "Previsto para 09/08/2026 · não entra no saldo",
    );
  });
});
