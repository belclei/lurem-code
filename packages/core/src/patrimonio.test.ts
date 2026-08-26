import type {
  AccountLike,
  CreditCardLike,
  TransactionLike,
} from "@lurem/domain";
import { describe, expect, it } from "vitest";
import { patrimonioTotal } from "./patrimonio.js";

const ASOF = new Date("2026-07-15T12:00:00.000Z");

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

function card(overrides: Partial<CreditCardLike> = {}): CreditCardLike {
  return {
    id: "card-1",
    closingDay: 5,
    dueDay: 20,
    isActive: true,
    ...overrides,
  };
}

function tx(overrides: Partial<TransactionLike> = {}): TransactionLike {
  return {
    id: "t1",
    kind: "expense",
    amountBRLCents: 0,
    isScheduled: false,
    transactionDate: ASOF,
    ...overrides,
  };
}

describe("patrimonioTotal", () => {
  it("sums liquid account balances", () => {
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("sums multiple bank accounts", () => {
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ id: "a1", openingBalanceCents: 10_000 }),
            transactions: [],
          },
          {
            account: account({ id: "a2", openingBalanceCents: 50_000 }),
            transactions: [],
          },
        ],
        cards: [],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(60_000);
  });

  it("subtracts a card's total outstanding debt", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      isActive: true,
    };
    const tx: TransactionLike = {
      id: "t1",
      kind: "expense",
      amountBRLCents: 3_000,
      isScheduled: false,
      transactionDate: new Date("2026-06-01T00:00:00.000Z"),
    };
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [{ card, transactions: [tx] }],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(7_000);
  });

  it("nets a refund (income) against card debt", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      isActive: true,
    };
    const expense: TransactionLike = {
      id: "t1",
      kind: "expense",
      amountBRLCents: 3_000,
      isScheduled: false,
      transactionDate: new Date("2026-06-01T00:00:00.000Z"),
    };
    const refund: TransactionLike = {
      id: "t2",
      kind: "income",
      amountBRLCents: 500,
      isScheduled: false,
      transactionDate: new Date("2026-06-05T00:00:00.000Z"),
    };
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [{ card, transactions: [expense, refund] }],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(7_500);
  });

  it("ignores card transactions dated after asOf", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      isActive: true,
    };
    const futureTx: TransactionLike = {
      id: "t1",
      kind: "expense",
      amountBRLCents: 3_000,
      isScheduled: false,
      transactionDate: new Date("2026-08-01T00:00:00.000Z"),
    };
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [{ card, transactions: [futureTx] }],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("excludes transfer-kind card transactions", () => {
    const card: CreditCardLike = {
      id: "card-1",
      closingDay: 5,
      dueDay: 20,
      isActive: true,
    };
    const transferTx: TransactionLike = {
      id: "t1",
      kind: "transfer",
      transferDirection: "in",
      amountBRLCents: 1_000,
      isScheduled: false,
      transactionDate: new Date("2026-06-01T00:00:00.000Z"),
    };
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ openingBalanceCents: 10_000 }),
            transactions: [],
          },
        ],
        cards: [{ card, transactions: [transferTx] }],
      },
      ASOF,
    );
    expect(result.valueCents).toBe(10_000);
  });

  it("always has a breakdown that sums to valueCents", () => {
    const testCard = card();
    const testTx = tx({
      kind: "expense",
      amountBRLCents: 1_500,
      transactionDate: new Date("2026-06-10T00:00:00.000Z"),
    });
    const result = patrimonioTotal(
      {
        accounts: [
          {
            account: account({ id: "a1", openingBalanceCents: 10_000 }),
            transactions: [],
          },
          {
            account: account({ id: "a2", openingBalanceCents: 20_000 }),
            transactions: [],
          },
        ],
        cards: [{ card: testCard, transactions: [testTx] }],
      },
      ASOF,
    );
    expect(result.breakdown.reduce((s, l) => s + l.valueCents, 0)).toBe(
      result.valueCents,
    );
  });

  it("counts a card credit balance as an asset, not as zero", () => {
    // Diferente de disponivelHoje/cashflow, patrimônio NÃO trava fatura
    // negativa em zero: um crédito no cartão é um ativo real (você vai pagar
    // menos depois). patrimonioTotal calcula a dívida do cartão por conta
    // própria e já trata isso certo — este teste existe para que a "regra da
    // fatura negativa" não seja aplicada aqui por engano.
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = patrimonioTotal(
      {
        accounts: [],
        cards: [
          {
            card: card(),
            transactions: [
              tx({
                id: "t1",
                kind: "income",
                amountBRLCents: 1_000,
                transactionDate: new Date("2026-07-01T00:00:00.000Z"),
              }),
            ],
          },
        ],
      },
      asOf,
    );
    expect(result.valueCents).toBe(1_000);
  });
});
