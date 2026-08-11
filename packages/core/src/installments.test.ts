import { describe, expect, it } from "vitest";
import { splitInstallments } from "./installments.js";

describe("splitInstallments", () => {
  it("splits evenly when the total divides exactly", () => {
    expect(splitInstallments(9_000, 3)).toEqual([3_000, 3_000, 3_000]);
  });

  it("puts the remainder on the LAST installment, not the first", () => {
    expect(splitInstallments(2_500, 3)).toEqual([833, 833, 834]);
  });

  it("handles a two-cent remainder", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3_333, 3_333, 3_334]);
  });

  it("sums back to the original total", () => {
    const parts = splitInstallments(10_007, 6);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_007);
    expect(parts).toHaveLength(6);
  });

  it("degenerates correctly for n = 2", () => {
    expect(splitInstallments(101, 2)).toEqual([50, 51]);
  });
});
