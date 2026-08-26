// apps/api/src/cards/invoice-status.test.ts
import type { CreditCardLike, TransactionLike } from "@lurem/domain";
import { describe, expect, it } from "vitest";
import { cardInvoiceStatus } from "./invoice-status.js";

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
    transactionDate: new Date("2026-08-05T00:00:00.000Z"),
    isScheduled: false,
    ...overrides,
  };
}

describe("cardInvoiceStatus", () => {
  it("counts a transaction dated exactly on the closing day only once (regression: used to double-count)", () => {
    // asOf = the closing day itself — the invoice that just closed and the
    // "currently open" one used to both resolve to this same month.
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    const result = cardInvoiceStatus(
      card(),
      [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 15_000,
          transactionDate: new Date("2026-08-10T00:00:00.000Z"),
        }),
      ],
      asOf,
    );
    expect(result.usedCents).toBe(15_000);
    expect(result.invoiceStatus).toBe("closed_awaiting_payment");
  });

  it("counts a transaction dated the day after closing as part of the next (open) invoice", () => {
    const asOf = new Date("2026-08-11T12:00:00.000Z");
    const result = cardInvoiceStatus(
      card(),
      [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 5_000,
          transactionDate: new Date("2026-08-11T00:00:00.000Z"),
        }),
      ],
      asOf,
    );
    expect(result.usedCents).toBe(5_000);
    expect(result.invoiceStatus).toBe("closed_awaiting_payment");
  });

  it("reduces usedCents when a transfer pays the card (issues.md: 'Pagar agora')", () => {
    const asOf = new Date("2026-08-15T12:00:00.000Z");
    const result = cardInvoiceStatus(
      card(),
      [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 15_000,
          transactionDate: new Date("2026-08-05T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "transfer",
          transferDirection: "in",
          amountBRLCents: 15_000,
          transactionDate: new Date("2026-08-12T00:00:00.000Z"),
        }),
      ],
      asOf,
    );
    expect(result.usedCents).toBe(0);
  });

  it("does not double-count a credit balance across closed and open invoices", () => {
    // Cartão fecha dia 10, vence dia 20. asOf = 15/jul -> fatura de julho está
    // fechada-não-vencida; a de agosto está aberta.
    // Julho: estorno de 1000, sem despesas -> fecha em -1000 (crédito).
    // Agosto (aberta): 300 de despesa -> cumulativo = -700.
    // usedCents deve ser -700, NÃO -1700 (que seria closed + open somados crus).
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = cardInvoiceStatus(
      card(),
      [
        tx({
          id: "t1",
          kind: "income",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-01T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "expense",
          amountBRLCents: 300,
          transactionDate: new Date("2026-07-14T00:00:00.000Z"),
        }),
      ],
      asOf,
    );
    expect(result.usedCents).toBe(-700);
  });

  it("keeps usedCents unchanged when the closed invoice is a normal debt", () => {
    // Regressão: closed positivo -> Math.max não altera nada.
    // Julho fecha em +1000. Agosto (aberta) tem 300 -> cumulativo 300
    // (dívida não carrega). usedCents = 1000 + 300 = 1300.
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const result = cardInvoiceStatus(
      card(),
      [
        tx({
          id: "t1",
          kind: "expense",
          amountBRLCents: 1_000,
          transactionDate: new Date("2026-07-01T00:00:00.000Z"),
        }),
        tx({
          id: "t2",
          kind: "expense",
          amountBRLCents: 300,
          transactionDate: new Date("2026-07-14T00:00:00.000Z"),
        }),
      ],
      asOf,
    );
    expect(result.usedCents).toBe(1_300);
  });
});
