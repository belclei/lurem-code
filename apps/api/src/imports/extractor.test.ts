import { describe, expect, it } from "vitest";
import { extractTransactionsFromText } from "./extractor.js";

/** ChatFn falso: devolve o JSON que o "LLM" teria produzido. */
function fakeChat(payload: unknown) {
  return async () => JSON.stringify(payload);
}

describe("extractTransactionsFromText — transferDirection", () => {
  it("forces transferDirection to 'in' for a transfer on a card invoice", async () => {
    // Numa fatura, dinheiro nunca SAI do cartão — a perna do documento é
    // sempre a de entrada, independente do que o LLM devolveu.
    const items = await extractTransactionsFromText(
      "irrelevante",
      [],
      fakeChat([
        {
          date: "2026-07-10",
          description: "PAGAMENTO RECEBIDO",
          amountCents: 50_000,
          kind: "transfer",
          transferDirection: "out",
          confidence: 1,
        },
      ]),
      [],
      "card_invoice",
      null,
    );
    expect(items[0]?.kind).toBe("transfer");
    expect(items[0]?.transferDirection).toBe("in");
  });

  it("keeps the model's direction on an account statement", async () => {
    const items = await extractTransactionsFromText(
      "irrelevante",
      [],
      fakeChat([
        {
          date: "2026-07-10",
          description: "PIX ENVIADO BELCLEI",
          amountCents: 20_000,
          kind: "transfer",
          transferDirection: "out",
          confidence: 1,
        },
      ]),
      [],
      "account_statement",
      "Belclei Fasolo",
    );
    expect(items[0]?.transferDirection).toBe("out");
  });

  it("leaves transferDirection null for non-transfer lines", async () => {
    const items = await extractTransactionsFromText(
      "irrelevante",
      [],
      fakeChat([
        {
          date: "2026-07-10",
          description: "ESTORNO COMPRA XPTO",
          amountCents: 1_000,
          kind: "income",
          confidence: 1,
        },
      ]),
      [],
      "card_invoice",
      null,
    );
    expect(items[0]?.kind).toBe("income");
    expect(items[0]?.transferDirection).toBeNull();
  });
});
