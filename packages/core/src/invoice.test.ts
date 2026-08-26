import type { CreditCardLike, TransactionLike } from "@lurem/domain";
import { describe, expect, it } from "vitest";
import {
  faturaFechadaNaoVencida,
  sumCardTransactionsForInvoiceMonth,
} from "./invoice.js";

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

describe("sumCardTransactionsForInvoiceMonth — carry de crédito", () => {
  // Cartão fecha dia 10. Fatura de julho = (10/jun, 10/jul].
  it("carries an unconsumed credit forward into the next invoice", () => {
    // Julho: estorno de 500 sem nenhuma despesa -> fecha em -500.
    // Agosto: nada acontece -> deve continuar -500, não voltar a zero.
    const transactions = [
      tx({
        id: "t1",
        kind: "income",
        amountBRLCents: 500,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 7)
        .valueCents,
    ).toBe(-500);
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 8)
        .valueCents,
    ).toBe(-500);
  });

  it("consumes the credit partially against the next invoice's spending", () => {
    // Julho fecha em -1000. Agosto tem 400 de despesa -> -600.
    const transactions = [
      tx({
        id: "t1",
        kind: "income",
        amountBRLCents: 1_000,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "expense",
        amountBRLCents: 400,
        transactionDate: new Date("2026-07-20T00:00:00.000Z"), // > 10/jul -> fatura de agosto
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 8)
        .valueCents,
    ).toBe(-600);
  });

  it("fully consumes the credit and goes back to a positive invoice", () => {
    // Julho fecha em -300. Agosto tem 500 de despesa -> +200.
    const transactions = [
      tx({
        id: "t1",
        kind: "income",
        amountBRLCents: 300,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "expense",
        amountBRLCents: 500,
        transactionDate: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 8)
        .valueCents,
    ).toBe(200);
  });

  it("does NOT carry a positive balance (unpaid debt stays on its own invoice)", () => {
    // Julho fecha em +300 (não pago). Agosto tem 50 de despesa -> 50, não 350.
    const transactions = [
      tx({
        id: "t1",
        kind: "expense",
        amountBRLCents: 300,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "expense",
        amountBRLCents: 50,
        transactionDate: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ];
    const result = sumCardTransactionsForInvoiceMonth(
      card(),
      transactions,
      2026,
      8,
    );
    expect(result.valueCents).toBe(50);
    // Guarda de regressão: uma linha `carried_credit` de valor 0 sempre
    // presente ainda satisfaria o invariante de ouro e passaria em todo
    // assert de valueCents acima — por isso a ausência da linha precisa ser
    // testada explicitamente, não só o valor total.
    expect(
      result.breakdown.find((l) => l.label === "carried_credit"),
    ).toBeUndefined();
  });

  it("does not let a routine invoice payment leak into the carry (settling a debt is not new credit)", () => {
    // Julho fecha em +1000 (cobrado, não pago ainda). Agosto: a fatura de
    // julho é paga via transferência -> fecha em -1000, mas isso é a
    // QUITAÇÃO da dívida de julho (já contabilizada lá), não crédito novo —
    // não deve carregar. Setembro: 300 de despesa genuína -> deve fechar em
    // +300, não em -700 (o que aconteceria se o pagamento vazasse pro carry).
    const transactions = [
      tx({
        id: "t1",
        kind: "expense",
        amountBRLCents: 1_000,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "transfer",
        transferDirection: "in",
        amountBRLCents: 1_000,
        transactionDate: new Date("2026-08-05T00:00:00.000Z"),
      }),
      tx({
        id: "t3",
        kind: "expense",
        amountBRLCents: 300,
        transactionDate: new Date("2026-09-05T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 7)
        .valueCents,
    ).toBe(1_000);
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 8)
        .valueCents,
    ).toBe(-1_000);
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 9)
        .valueCents,
    ).toBe(300);
  });

  it("still carries a genuine refund even when it lands in the same period as that period's payment", () => {
    // Julho fecha em +1000. Agosto: paga os 1000 de julho E recebe 500 de
    // estorno -> fecha em -1500, mas só os 500 do estorno são crédito novo
    // (os outros 1000 são a quitação de julho). Setembro: nada acontece ->
    // continua -500 (não -1500, o pagamento não deveria ter carregado; e
    // não 0, o estorno não deveria ter sido descartado).
    const transactions = [
      tx({
        id: "t1",
        kind: "expense",
        amountBRLCents: 1_000,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "transfer",
        transferDirection: "in",
        amountBRLCents: 1_000,
        transactionDate: new Date("2026-08-05T00:00:00.000Z"),
      }),
      tx({
        id: "t3",
        kind: "income",
        amountBRLCents: 500,
        transactionDate: new Date("2026-08-06T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 8)
        .valueCents,
    ).toBe(-1_500);
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 9)
        .valueCents,
    ).toBe(-500);
  });

  it("keeps an unconsumed credit alive across three empty invoices", () => {
    const transactions = [
      tx({
        id: "t1",
        kind: "income",
        amountBRLCents: 700,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 10)
        .valueCents,
    ).toBe(-700);
  });

  it("returns zero for an invoice month older than the card's first transaction", () => {
    const transactions = [
      tx({
        id: "t1",
        kind: "expense",
        amountBRLCents: 900,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ];
    expect(
      sumCardTransactionsForInvoiceMonth(card(), transactions, 2026, 3)
        .valueCents,
    ).toBe(0);
  });

  it("returns zero with no transactions at all", () => {
    const result = sumCardTransactionsForInvoiceMonth(card(), [], 2026, 7);
    expect(result.valueCents).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("includes the carried credit as its own breakdown line, keeping the golden invariant", () => {
    const transactions = [
      tx({
        id: "t1",
        kind: "income",
        amountBRLCents: 500,
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
      tx({
        id: "t2",
        kind: "expense",
        amountBRLCents: 200,
        transactionDate: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ];
    const result = sumCardTransactionsForInvoiceMonth(
      card(),
      transactions,
      2026,
      8,
    );
    expect(result.valueCents).toBe(-300);
    expect(result.breakdown.reduce((s, l) => s + l.valueCents, 0)).toBe(
      result.valueCents,
    );
    const carried = result.breakdown.find((l) => l.label === "carried_credit");
    expect(carried?.valueCents).toBe(-500);
  });
});
