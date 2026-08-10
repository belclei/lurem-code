import type { CreditCardLike, TransactionLike } from "@lurem/domain";
import { describe, expect, it } from "vitest";
import { faturaFechadaNaoVencida } from "./invoice.js";

function card(overrides: Partial<CreditCardLike> = {}): CreditCardLike {
  return {
    id: "card-1",
    closingDay: 10,
    dueDay: 20,
    isActive: true,
    ...overrides,
  };
}

function tx(
  overrides: Partial<TransactionLike> &
    Pick<TransactionLike, "id" | "kind" | "amountBRLCents">,
): TransactionLike {
  return {
    transactionDate: new Date("2026-07-05T00:00:00.000Z"),
    isScheduled: false,
    ...overrides,
  };
}

describe("faturaFechadaNaoVencida", () => {
  it("sums the expense transactions of the invoice that has closed but is not yet due", () => {
    // Card closes on the 10th, due on the 20th. asOf = July 15th -> the invoice
    // that closed July 10th is closed-but-not-due (dueDate July 20th not reached yet).
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-06-15T00:00:00.000Z"),
        }), // in period (previous closing, this closing]
        tx({
          id: "t2",
          kind: "expense",
          amountBRLCents: 500,
          transactionDate: new Date("2026-07-12T00:00:00.000Z"),
        }), // after this closing -> next invoice, excluded
      ],
      asOf,
    });
    expect(result.valueCents).toBe(1_000);
    expect(result.breakdown.reduce((s, l) => s + l.valueCents, 0)).toBe(
      result.valueCents,
    );
  });

  it("includes a transaction dated exactly on the closing date (half-open interval, end inclusive)", () => {
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 700,
          transactionDate: new Date("2026-07-10T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(700);
  });

  it("returns zero when no invoice is currently closed-but-not-due (e.g. right after due date)", () => {
    // §3.7: "fatura já paga (não conta)" — once the due date has passed, that
    // specific invoice cycle is out of this function's (closingDate, dueDate) window.
    // ⚠ Nota: o schema não rastreia "pago" explicitamente (ver relatório) — o que
    // este teste garante é que o cálculo não conta uma fatura cujo vencimento já passou.
    const asOf = new Date("2026-07-21T12:00:00.000Z"); // 1 day after due date (July 20th)
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 700,
          transactionDate: new Date("2026-07-10T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(0);
  });

  it("handles closingDay=31 in February without skipping the month (asOf right after Feb closing)", () => {
    const card31 = card({ closingDay: 31, dueDay: 10 });
    const asOf = new Date("2026-03-01T12:00:00.000Z"); // Feb closes on the 28th (non-leap); due March 10th
    const result = faturaFechadaNaoVencida({
      card: card31,
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 900,
          transactionDate: new Date("2026-02-28T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(900);
  });

  it("rolls the due date to the next month when dueDay <= closingDay", () => {
    const card2 = card({ closingDay: 25, dueDay: 10 }); // due < closing -> next month
    // Closes July 25th, due August 10th. asOf = July 30th is inside the closed-not-due window.
    const asOf = new Date("2026-07-30T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card2,
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 300,
          transactionDate: new Date("2026-07-20T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(300);
  });

  it("reduces the invoice total for a transfer's 'in' leg (issues.md: 'Pagar agora' — a transfer to the card is how a payment gets recorded)", () => {
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-05T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "transfer",
          transferDirection: "in",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-06T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(0);
  });

  it("ignores a transfer's 'out' leg on a card (can't happen in practice, but stays neutral if it does)", () => {
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-05T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "transfer",
          transferDirection: "out",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-06T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(1_000);
  });

  it("reduces the invoice total for income (refund/estorno) transactions on the card", () => {
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = faturaFechadaNaoVencida({
      card: card(),
      transactions: [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-05T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "income",
          amountBRLCents: 200,
          transactionDate: new Date("2026-07-06T00:00:00.000Z"),
        }),
      ],
      asOf,
    });
    expect(result.valueCents).toBe(800);
  });
});
