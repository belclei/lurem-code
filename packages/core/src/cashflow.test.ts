import type {
  AccountLike,
  CreditCardLike,
  Money,
  RecurringFulfillmentLike,
  RecurringTransactionLike,
  TransactionLike,
} from "@lurem/domain";
import { describe, expect, it } from "vitest";
import { fluxoDeCaixaFuturo } from "./cashflow.js";

const ASOF = new Date("2026-07-10T12:00:00.000Z"); // "today" = July 10th in America/Sao_Paulo

/** fluxoDeCaixaFuturo always returns exactly 12 months — a safe non-null indexer for tests. */
function month(result: Money[], index: number): Money {
  const value = result[index];
  if (!value)
    throw new Error(
      `expected fluxoDeCaixaFuturo result to have index ${index}`,
    );
  return value;
}

function account(overrides: Partial<AccountLike> = {}): AccountLike {
  return {
    id: "acc-1",
    type: "checking",
    openingBalanceCents: 0,
    overdraftLimitCents: 0,
    isActive: true,
    ...overrides,
  };
}

function recurring(
  overrides: Partial<RecurringTransactionLike> &
    Pick<RecurringTransactionLike, "id">,
): RecurringTransactionLike {
  return {
    kind: "expense",
    dayOfMonth: 15,
    referenceAmountBRLCents: 1_000,
    isVariableAmount: false,
    isActive: true,
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: null,
    ...overrides,
  };
}

describe("fluxoDeCaixaFuturo", () => {
  it("returns exactly 12 months of projection", () => {
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 1_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    expect(result).toHaveLength(12);
  });

  it("saldo[1] (index 0) starts from the current liquid balance", () => {
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 5_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    expect(month(result, 0).valueCents).toBe(5_000);
  });

  it("current month (N=1): subtracts only the recurring expenses NOT yet fulfilled — half cumprida means only the other half counts", () => {
    const fulfilled = recurring({
      id: "r-fulfilled",
      dayOfMonth: 5,
      referenceAmountBRLCents: 1_000,
    });
    const pending = recurring({
      id: "r-pending",
      dayOfMonth: 20,
      referenceAmountBRLCents: 1_000,
    });
    const fulfillment: RecurringFulfillmentLike = {
      recurringTransactionId: "r-fulfilled",
      year: 2026,
      month: 7,
    };

    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [fulfilled, pending],
        fulfillments: [fulfillment],
        scheduledTransactions: [],
      },
      ASOF,
    );
    // Only "pending" (1_000) is subtracted; "fulfilled" already happened and is inside saldo[0].
    expect(month(result, 0).valueCents).toBe(9_000);
  });

  it("current month (N=1): does not double-count a recurring expense already materialized as scheduled", () => {
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 10,
      referenceAmountBRLCents: 2_000,
    });
    const rentScheduled: TransactionLike = {
      id: "rent-sched",
      kind: "expense",
      amountBRLCents: 2_000,
      isScheduled: true,
      recurringTransactionId: "rent",
      transactionDate: new Date("2026-07-10T00:00:00.000Z"),
    };
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [rentRecurring],
        fulfillments: [],
        scheduledTransactions: [rentScheduled],
      },
      ASOF,
    );
    // subtracted exactly once via the scheduled line, not also via the recurring line.
    expect(month(result, 0).valueCents).toBe(8_000);
  });

  it("current month (N=1): subtracts non-recurring scheduled transactions remaining in the month", () => {
    const scheduled: TransactionLike = {
      id: "s1",
      kind: "expense",
      amountBRLCents: 700,
      isScheduled: true,
      recurringTransactionId: null,
      transactionDate: new Date("2026-07-25T00:00:00.000Z"),
    };
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [scheduled],
      },
      ASOF,
    );
    expect(month(result, 0).valueCents).toBe(9_300);
  });

  it("current month (N=1): subtracts a closed invoice with due date within the month, for ANY card (auto-debit or not)", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 25,
      isActive: true,
    };
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [
          {
            card,
            transactions: [
              {
                id: "ct1",
                kind: "expense",
                amountBRLCents: 1_500,
                isScheduled: false,
                transactionDate: new Date("2026-07-02T00:00:00.000Z"),
              },
            ],
          },
        ],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    expect(month(result, 0).valueCents).toBe(8_500);
  });

  it("future month (N=2): counts ALL active recurring occurrences (nothing has happened yet)", () => {
    const income = recurring({
      id: "salary",
      kind: "income",
      dayOfMonth: 5,
      referenceAmountBRLCents: 5_000,
    });
    const expense = recurring({
      id: "rent",
      kind: "expense",
      dayOfMonth: 10,
      referenceAmountBRLCents: 2_000,
    });
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [income, expense],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    // saldo[1] (index 0) = 10_000 (no recurring, day 5/10 already passed in July doesn't matter for N=1
    // since neither fulfilled nor scheduled -> both still counted in N=1 too). saldo[2] adds full amounts again.
    expect(month(result, 0).valueCents).toBe(10_000 + 5_000 - 2_000);
    expect(month(result, 1).valueCents).toBe(
      month(result, 0).valueCents + 5_000 - 2_000,
    );
  });

  it("a recurring series with an endDate stops contributing after its last active month", () => {
    // Active only through August 2026 (endDate = Aug 31). asOf=July 10 -> index0=Jul(N1), index1=Aug(N2), index2=Sep(N3).
    const shortLived = recurring({
      id: "temp",
      kind: "expense",
      dayOfMonth: 15,
      referenceAmountBRLCents: 800,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T00:00:00.000Z"),
    });
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        recurringTransactions: [shortLived],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    const julToAug = month(result, 0).valueCents - month(result, 1).valueCents; // Aug (index1) still subtracts 800
    const augToSep = month(result, 1).valueCents - month(result, 2).valueCents; // Sep (index2) should NOT subtract (endDate passed)
    expect(julToAug).toBe(800);
    expect(augToSep).toBe(0);
  });

  it("future month (N>=2): only subtracts a predicted invoice for cards WITH auto-debit provisioned", () => {
    const autoDebitCard: CreditCardLike = {
      id: "card-auto",
      closingDay: 5,
      dueDay: 25,
      autoDebitAccountId: "acc-1",
      isActive: true,
    };
    const manualCard: CreditCardLike = {
      id: "card-manual",
      closingDay: 5,
      dueDay: 25,
      isActive: true,
    };
    // Both cards have a transaction dated in what will become August's invoice period.
    const augTx = (cardId: string, id: string): TransactionLike => ({
      id,
      kind: "expense",
      amountBRLCents: 900,
      isScheduled: false,
      transactionDate: new Date("2026-08-02T00:00:00.000Z"),
    });
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [
          {
            card: autoDebitCard,
            transactions: [augTx("card-auto", "ct-auto")],
          },
          {
            card: manualCard,
            transactions: [augTx("card-manual", "ct-manual")],
          },
        ],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    // August's invoice (closing Aug 5, due Aug 25) falls in month N=2 (index 1).
    const julToAug = month(result, 0).valueCents - month(result, 1).valueCents;
    expect(julToAug).toBe(900); // only the auto-debit card's predicted invoice counts
  });

  it("every month's breakdown sums to its valueCents (property, §3.0)", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 25,
      autoDebitAccountId: "acc-1",
      isActive: true,
    };
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [
          {
            card,
            transactions: [
              {
                id: "ct1",
                kind: "expense",
                amountBRLCents: 500,
                isScheduled: false,
                transactionDate: new Date("2026-08-02T00:00:00.000Z"),
              },
            ],
          },
        ],
        recurringTransactions: [
          recurring({
            id: "r1",
            kind: "income",
            dayOfMonth: 20,
            referenceAmountBRLCents: 3_000,
          }),
        ],
        fulfillments: [],
        scheduledTransactions: [],
      },
      ASOF,
    );
    for (const money of result) {
      expect(money.breakdown.reduce((s, l) => s + l.valueCents, 0)).toBe(
        money.valueCents,
      );
    }
  });

  it("never turns an unconsumed card credit into projected incoming cash", () => {
    // Card with auto-debit and a single income (refund) transaction that no
    // later transaction ever consumes: sumCardTransactionsForInvoiceMonth
    // (Task 2, cumulative) carries that 1_000 credit forward as a negative
    // invoice total in every subsequent period. Without clamping at zero,
    // each month whose invoice falls due would add +1_000 to the projection
    // as though it were incoming cash — the same credit counted over and
    // over across the 12-month horizon. None of the 12 months may have a
    // "closed_invoice" line at all here (dueCents clamps to 0, so the line
    // is suppressed entirely).
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const card: CreditCardLike = {
      id: "card-credit",
      closingDay: 5,
      dueDay: 25,
      autoDebitAccountId: "acc-1",
      isActive: true,
    };
    const result = fluxoDeCaixaFuturo(
      {
        accounts: [],
        cards: [
          {
            card,
            transactions: [
              {
                id: "t1",
                kind: "income",
                amountBRLCents: 1_000,
                isScheduled: false,
                transactionDate: new Date("2026-07-01T00:00:00.000Z"),
              },
            ],
          },
        ],
        recurringTransactions: [],
        fulfillments: [],
        scheduledTransactions: [],
      },
      asOf,
    );

    const invoiceLines = result.flatMap((money) =>
      money.breakdown.filter((line) => line.label === "closed_invoice"),
    );
    expect(invoiceLines).toEqual([]);
  });
});
