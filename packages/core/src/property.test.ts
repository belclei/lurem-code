// IMPLEMENTACAO.md §3.0 — invariante de ouro: money.valueCents === Σ breakdown[i].valueCents,
// para TODA função do core, com entradas aleatórias (§9.1: "teste de propriedade").

import type {
  AccountLike,
  CreditCardLike,
  RecurringFulfillmentLike,
  RecurringTransactionLike,
  TransactionLike,
} from "@lurem/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { balance } from "./balance.js";
import { fluxoDeCaixaFuturo } from "./cashflow.js";
import { disponivelHoje } from "./disponivel-hoje.js";
import { faturaFechadaNaoVencida } from "./invoice.js";
import { patrimonioTotal } from "./patrimonio.js";

function sumsToTotal(money: {
  valueCents: number;
  breakdown: Array<{ valueCents: number }>;
}) {
  return (
    money.breakdown.reduce((sum, line) => sum + line.valueCents, 0) ===
    money.valueCents
  );
}

const dateArb = fc.date({
  min: new Date("2024-01-01T00:00:00.000Z"),
  max: new Date("2027-12-31T00:00:00.000Z"),
  noInvalidDate: true,
});

const accountArb: fc.Arbitrary<AccountLike> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom("checking", "cash"),
  openingBalanceCents: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  overdraftLimitCents: fc.integer({ min: 0, max: 500_000 }),
  isActive: fc.boolean(),
});

const transactionArb: fc.Arbitrary<TransactionLike> = fc.record({
  id: fc.uuid(),
  kind: fc.constantFrom("income", "expense", "transfer"),
  transferDirection: fc.option(fc.constantFrom("in", "out"), {
    nil: undefined,
  }),
  amountBRLCents: fc.integer({ min: 1, max: 500_000 }),
  transactionDate: dateArb,
  isScheduled: fc.boolean(),
  recurringTransactionId: fc.option(fc.uuid(), { nil: null }),
});

const cardArb: fc.Arbitrary<CreditCardLike> = fc.record({
  id: fc.uuid(),
  closingDay: fc.integer({ min: 1, max: 31 }),
  dueDay: fc.integer({ min: 1, max: 31 }),
  autoDebitAccountId: fc.option(fc.uuid(), { nil: undefined }),
  isActive: fc.boolean(),
});

const recurringArb: fc.Arbitrary<RecurringTransactionLike> = fc.record({
  id: fc.uuid(),
  kind: fc.constantFrom("income", "expense"),
  dayOfMonth: fc.integer({ min: 1, max: 31 }),
  referenceAmountBRLCents: fc.integer({ min: 1, max: 200_000 }),
  isVariableAmount: fc.boolean(),
  isActive: fc.boolean(),
  startDate: dateArb,
  endDate: fc.option(dateArb, { nil: null }),
});

const fulfillmentArb: fc.Arbitrary<RecurringFulfillmentLike> = fc.record({
  recurringTransactionId: fc.uuid(),
  year: fc.integer({ min: 2024, max: 2027 }),
  month: fc.integer({ min: 1, max: 12 }),
});

describe("breakdown invariant (property-based, §3.0)", () => {
  it("balance: valueCents always equals the sum of breakdown lines", () => {
    fc.assert(
      fc.property(
        accountArb,
        fc.array(transactionArb, { maxLength: 8 }),
        dateArb,
        (account, transactions, asOf) => {
          const result = balance({ account, transactions, asOf });
          expect(sumsToTotal(result)).toBe(true);
        },
      ),
    );
  });

  it("faturaFechadaNaoVencida: valueCents always equals the sum of breakdown lines", () => {
    fc.assert(
      fc.property(
        cardArb,
        fc.array(transactionArb, { maxLength: 8 }),
        dateArb,
        (card, transactions, asOf) => {
          const result = faturaFechadaNaoVencida({ card, transactions, asOf });
          expect(sumsToTotal(result)).toBe(true);
        },
      ),
    );
  });

  it("disponivelHoje: valueCents always equals the sum of breakdown lines", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            account: accountArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(
          fc.record({
            card: cardArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(transactionArb, { maxLength: 5 }),
        fc.array(recurringArb, { maxLength: 5 }),
        fc.array(fulfillmentArb, { maxLength: 5 }),
        dateArb,
        (
          accounts,
          cards,
          scheduledTransactions,
          recurringTransactions,
          fulfillments,
          asOf,
        ) => {
          const result = disponivelHoje(
            {
              accounts,
              cards,
              scheduledTransactions,
              recurringTransactions,
              fulfillments,
            },
            asOf,
          );
          expect(sumsToTotal(result)).toBe(true);
        },
      ),
    );
  });

  it("fluxoDeCaixaFuturo: every one of the 12 months sums to its own valueCents", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            account: accountArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(
          fc.record({
            card: cardArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(recurringArb, { maxLength: 5 }),
        fc.array(fulfillmentArb, { maxLength: 5 }),
        fc.array(transactionArb, { maxLength: 5 }),
        dateArb,
        (
          accounts,
          cards,
          recurringTransactions,
          fulfillments,
          scheduledTransactions,
          asOf,
        ) => {
          const result = fluxoDeCaixaFuturo(
            {
              accounts,
              cards,
              recurringTransactions,
              fulfillments,
              scheduledTransactions,
            },
            asOf,
          );
          expect(result).toHaveLength(12);
          for (const money of result) {
            expect(sumsToTotal(money)).toBe(true);
          }
        },
      ),
    );
  });

  it("patrimonioTotal: valueCents always equals the sum of breakdown lines", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            account: accountArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(
          fc.record({
            card: cardArb,
            transactions: fc.array(transactionArb, { maxLength: 4 }),
          }),
          { maxLength: 3 },
        ),
        dateArb,
        (accounts, cards, asOf) => {
          const result = patrimonioTotal({ accounts, cards }, asOf);
          expect(sumsToTotal(result)).toBe(true);
        },
      ),
    );
  });
});
