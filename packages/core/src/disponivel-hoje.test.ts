import type {
  AccountLike,
  CreditCardLike,
  RecurringFulfillmentLike,
  RecurringTransactionLike,
  TransactionLike,
} from "@lurem/domain";
import { describe, expect, it } from "vitest";
import { disponivelHoje } from "./disponivel-hoje.js";

const ASOF = new Date("2026-07-10T12:00:00.000Z"); // "today" = July 10th in America/Sao_Paulo

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
    dayOfMonth: 10,
    referenceAmountBRLCents: 1_000,
    isVariableAmount: false,
    isActive: true,
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: null,
    ...overrides,
  };
}

function scheduledTx(
  overrides: Partial<TransactionLike> &
    Pick<TransactionLike, "id" | "amountBRLCents">,
): TransactionLike {
  return {
    kind: "expense",
    isScheduled: true,
    transactionDate: new Date("2026-07-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("disponivelHoje", () => {
  it("sums the balance of liquid (checking + cash) accounts", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ id: "a1", openingBalanceCents: 10_000 }),
            transactions: [],
          },
          {
            account: account({
              id: "a2",
              type: "cash",
              openingBalanceCents: 2_000,
            }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(12_000);
  });

  it("subtracts the closed-but-not-due invoice of a card without auto-debit", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      isActive: true,
    };
    const result = disponivelHoje(
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
                amountBRLCents: 3_000,
                isScheduled: false,
                transactionDate: new Date("2026-07-02T00:00:00.000Z"),
              },
            ],
          },
        ],
        scheduledTransactions: [],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(7_000);
  });

  it("does NOT subtract the invoice of a card that already has auto-debit provisioned", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      autoDebitAccountId: "a1",
      isActive: true,
    };
    const result = disponivelHoje(
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
                amountBRLCents: 3_000,
                isScheduled: false,
                transactionDate: new Date("2026-07-02T00:00:00.000Z"),
              },
            ],
          },
        ],
        scheduledTransactions: [],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("subtracts scheduled transactions dated up to the end of the month", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [
          scheduledTx({
            id: "s1",
            amountBRLCents: 1_500,
            transactionDate: new Date("2026-07-25T00:00:00.000Z"),
          }),
        ],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(8_500);
  });

  it("does not subtract a scheduled transaction dated in the following month", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [
          scheduledTx({
            id: "s1",
            amountBRLCents: 1_500,
            transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          }),
        ],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("subtracts a pending recurring expense whose day has not passed yet this month", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [
          recurring({
            id: "r1",
            dayOfMonth: 25,
            referenceAmountBRLCents: 1_200,
          }),
        ],
        fulfillments: [],
      },
      ASOF, // today = July 10th, recurring day 25 has not passed
    );
    expect(result.valueCents).toBe(8_800);
  });

  it("does not subtract a recurring expense whose day already passed this month", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [
          recurring({
            id: "r1",
            dayOfMonth: 5,
            referenceAmountBRLCents: 1_200,
          }),
        ],
        fulfillments: [],
      },
      ASOF, // today = July 10th, recurring day 5 already passed
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("⚠ does not double-count a recurring expense already materialized as a scheduled transaction (the v0.5 bug)", () => {
    // Rent due the 10th, already turned into a scheduled Transaction for July.
    // asOf = July 10th (the due day itself). Must be subtracted exactly once,
    // via the scheduled line — NOT also via the recurring-pending line.
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 10,
      referenceAmountBRLCents: 2_000,
    });
    const rentScheduled = scheduledTx({
      id: "rent-sched-july",
      amountBRLCents: 2_000,
      recurringTransactionId: "rent",
      transactionDate: new Date("2026-07-10T00:00:00.000Z"),
    });

    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [rentScheduled],
        recurringTransactions: [rentRecurring],
        fulfillments: [],
      },
      ASOF,
    );

    // Subtracted exactly once: 10_000 - 2_000 = 8_000 (NOT 6_000, which would be double-counted).
    expect(result.valueCents).toBe(8_000);
    const recurringLines = result.breakdown.filter(
      (l) => l.kind === "recurring_expense",
    );
    expect(recurringLines).toHaveLength(0);
    const scheduledLines = result.breakdown.filter(
      (l) => l.kind === "scheduled_tx",
    );
    expect(scheduledLines).toHaveLength(1);
  });

  it("does not double-count a recurring expense already fulfilled this month via a real (non-scheduled) transaction", () => {
    // dayOfMonth must be >= today (condition c) so the fulfillment check (condition a)
    // is actually the reason it's excluded, not condition (c) short-circuiting first.
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 20,
      referenceAmountBRLCents: 2_000,
    });
    const fulfillment: RecurringFulfillmentLike = {
      recurringTransactionId: "rent",
      year: 2026,
      month: 7,
    };

    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [rentRecurring],
        fulfillments: [fulfillment],
      },
      ASOF,
    );

    expect(result.valueCents).toBe(10_000);
  });

  it("still subtracts a pending recurring expense when an unrelated fulfillment exists (different recurring/year/month)", () => {
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 20,
      referenceAmountBRLCents: 2_000,
    });
    const unrelatedFulfillment: RecurringFulfillmentLike = {
      recurringTransactionId: "other-series",
      year: 2026,
      month: 7,
    };
    const sameSeriesDifferentMonth: RecurringFulfillmentLike = {
      recurringTransactionId: "rent",
      year: 2026,
      month: 6,
    };

    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [rentRecurring],
        fulfillments: [unrelatedFulfillment, sameSeriesDifferentMonth],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(8_000);
  });

  it("still subtracts July's pending recurring occurrence when the only scheduled tx linked to that series is from a PRIOR month (two distinct debts, not a double-count)", () => {
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 20,
      referenceAmountBRLCents: 2_000,
    });
    const unrelatedScheduled = scheduledTx({
      id: "other-sched",
      amountBRLCents: 500,
      recurringTransactionId: "other-series",
      transactionDate: new Date("2026-07-15T00:00:00.000Z"),
    });
    // A June occurrence of "rent" that was materialized but never confirmed —
    // it does NOT satisfy isAlreadyScheduledThisMonth for July (wrong month),
    // so July's occurrence is still independently pending. The June one keeps
    // being subtracted too (§3.2 has no lower date bound on the scheduled
    // line) — this is two real, distinct debts, not the same one counted twice.
    const juneRentStillUnconfirmed = scheduledTx({
      id: "rent-sched-june",
      amountBRLCents: 2_000,
      recurringTransactionId: "rent",
      transactionDate: new Date("2026-06-20T00:00:00.000Z"),
    });

    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [unrelatedScheduled, juneRentStillUnconfirmed],
        recurringTransactions: [rentRecurring],
        fulfillments: [],
      },
      ASOF,
    );
    // 10_000 - 500 (unrelated scheduled) - 2_000 (June's stale unconfirmed rent) - 2_000 (July's still-pending rent) = 5_500
    expect(result.valueCents).toBe(5_500);
  });

  it("does not add the overdraft limit — a negative balance reflects the real negative number", () => {
    const result = disponivelHoje(
      {
        accounts: [
          {
            account: account({
              openingBalanceCents: -500,
              overdraftLimitCents: 2_000,
            }),
            transactions: [],
          },
        ],
        cards: [],
        scheduledTransactions: [],
        recurringTransactions: [],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(-500);
  });

  it("always has a breakdown that sums to valueCents", () => {
    const rentRecurring = recurring({
      id: "rent",
      dayOfMonth: 20,
      referenceAmountBRLCents: 2_000,
    });
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 25,
      isActive: true,
    };
    const result = disponivelHoje(
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
                amountBRLCents: 1_000,
                isScheduled: false,
                transactionDate: new Date("2026-07-02T00:00:00.000Z"),
              },
            ],
          },
        ],
        scheduledTransactions: [
          scheduledTx({
            id: "s1",
            amountBRLCents: 500,
            transactionDate: new Date("2026-07-15T00:00:00.000Z"),
          }),
        ],
        recurringTransactions: [rentRecurring],
        fulfillments: [],
      },
      ASOF,
    );
    expect(result.breakdown.reduce((s, l) => s + l.valueCents, 0)).toBe(
      result.valueCents,
    );
  });
});
