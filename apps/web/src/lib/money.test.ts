// apps/web/src/lib/money.test.ts
import { describe, expect, it } from "vitest";
import { reaisToCentsOrZero, reaisToCentsPositive } from "./money";

describe("reaisToCentsPositive", () => {
  it("parses comma as the decimal point", () => {
    expect(reaisToCentsPositive("1000,50")).toBe(100050);
  });

  it("parses pt-BR thousands grouping plus comma decimal", () => {
    expect(reaisToCentsPositive("1.200,50")).toBe(120050);
  });

  it("parses a plain integer with no separators", () => {
    expect(reaisToCentsPositive("1000")).toBe(100000);
  });

  it("treats a numpad-style period as the decimal point (2 digits)", () => {
    expect(reaisToCentsPositive("1000.50")).toBe(100050);
  });

  it("treats a numpad-style period as the decimal point (1 digit)", () => {
    expect(reaisToCentsPositive("1000.5")).toBe(100050);
  });

  it("still treats a period followed by 3 digits as thousands grouping", () => {
    expect(reaisToCentsPositive("1.200")).toBe(120000);
  });

  it("rejects zero", () => {
    expect(reaisToCentsPositive("0")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(reaisToCentsPositive("abc")).toBeNull();
  });
});

describe("reaisToCentsOrZero", () => {
  it("resolves blank input to zero", () => {
    expect(reaisToCentsOrZero("")).toBe(0);
  });

  it("treats a numpad-style period as the decimal point", () => {
    expect(reaisToCentsOrZero("500.25")).toBe(50025);
  });

  it("still treats a period followed by 3 digits as thousands grouping", () => {
    expect(reaisToCentsOrZero("2.500")).toBe(250000);
  });
});
