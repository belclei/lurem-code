// apps/api/src/imports/extractor.ts
// §6.8 — extrai transações de um extrato/fatura já convertido para markdown
// no navegador (nunca vemos o PDF nem o texto persiste — ver routes.ts).
// Prompt/parsing adaptados do precedente em money-flow (mesmo formato de
// saída, mesmas defesas contra JSON truncado/cercado em ```), reescopado
// pros campos de ExtractedTransaction (sem portador/recorrência/duplicata —
// isso fica sugerido só depois, na revisão, não nesta extração — ver
// issues.md do que ainda falta).
export interface ExtractedItem {
  description: string;
  amountCents: number;
  transactionDate: string | null;
  kind: "income" | "expense" | "transfer";
  /** Só relevante quando kind === "transfer"; null caso contrário. */
  transferDirection: "in" | "out" | null;
  cardHolderRaw: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  currency: string;
  confidence: number;
  suggestedCategoryName: string | null;
  suggestedTagNames: string[];
}

function buildSystemPrompt(
  categories: { name: string; kind: string }[],
  existingTagNames: string[],
  documentType: "card_invoice" | "account_statement",
  userFullName: string | null,
): string {
  const catList = categories.map((c) => `- ${c.name} (${c.kind})`).join("\n");
  // Tags are user-created vocabulary (§ description-tag-suggestion) — the
  // model may only pick from what already exists, never invent a new one,
  // or "Uber"/"uber ride"/"corridas" would fragment into near-duplicate tags
  // every import instead of converging on one the user already uses.
  const tagList =
    existingTagNames.length > 0
      ? existingTagNames.map((t) => `- ${t}`).join("\n")
      : "(none yet)";

  return `You are a financial data extraction assistant.
Extract all transactions from the bank statement or credit card invoice provided (markdown format — use its headings/tables/lists to identify transaction lines accurately).

AVAILABLE CATEGORIES (use the exact name for the category field):
${catList}

EXISTING TAGS (only suggest from this list — never invent a new tag name):
${tagList}

Return a JSON array of objects with these exact fields:
- date: ISO 8601 date string (YYYY-MM-DD); null if not determinable
- description: full merchant/transaction description as shown (string)
- amountCents: integer, in cents, always positive
- kind: "expense" for purchases/debits, "income" for payments/refunds/credits, "transfer" for a movement between the user's own accounts (see PIX rule below)
- transferDirection: only when kind is "transfer" — "out" if the money left this account, "in" if it arrived; null for every other kind
- currency: "BRL" by default; use "USD", "EUR" etc. only when clearly foreign currency
- category: EXACT name from the categories list above that best fits; null if none fits
- tags: array of EXACT names from the existing tags list above that clearly apply (e.g. an existing "uber" tag on a ride-share charge); empty array if none clearly apply or the list is empty — never invent a tag not in that list
- cardHolder: cardholder name if identifiable (e.g. "TITULAR", "ADICIONAL - JOAO"); null if not
- installmentNumber: current installment integer if parcelado (e.g. 3 from "03/12"); null otherwise
- installmentTotal: total installments integer (e.g. 12 from "03/12"); null otherwise
- confidence: 0.0 to 1.0 — how certain you are this is a real transaction line

Rules:
- Ignore total lines, balance due, previous balance lines
- CARDHOLDER: if the document groups by holder name, set cardHolder for each transaction in that block
- INSTALLMENTS: detect "03/12", "3/12", "PARCELA 3 DE 12" — extract the numbers and clean the description
${
  documentType === "card_invoice"
    ? `- CARD INVOICE PAYMENT: the line that settles this card's previous invoice ("PAGAMENTO RECEBIDO", "PAGAMENTO EFETUADO", "PGTO FATURA", "PAGTO FATURA ANTERIOR") is "transfer" — it is money moving from a bank account to settle this card, not merchant income
- CARD INVOICE REFUND: most lines are purchases ("expense"), but a refund/chargeback/credit tied to a specific merchant charge ("ESTORNO", "CREDITO", "CHARGEBACK") is "income" — never force it to "expense" just because it's on an invoice`
    : "- ACCOUNT STATEMENT: judge each line's kind from its own description/sign, not from an assumed default"
}${
  userFullName
    ? `\n- PIX TRANSFER: if a PIX line's description names the account holder themself ("${userFullName}", case-insensitive, partial name match ok — e.g. a PIX sent/received to/from their own name, or between their own accounts) set kind to "transfer" instead of "income"/"expense"`
    : ""
}
- Do not include any text outside the JSON array
- Do not wrap the array in markdown code fences`;
}

function cleanJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

interface RawItem {
  date?: string | null;
  description: string;
  amountCents: number;
  kind?: string;
  transferDirection?: string | null;
  currency?: string;
  category?: string | null;
  cardHolder?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  confidence?: number;
  tags?: string[];
}

// Same 3-tier recovery as the money-flow precedent: full parse, then trim to
// the last complete `]`, then (LLM output truncated mid-object) recover
// every complete `{...}` seen so far instead of discarding the whole batch.
function parseJsonArray(text: string): RawItem[] {
  const start = text.indexOf("[");
  if (start === -1) {
    throw new Error(
      `LLM não retornou um JSON array. Início: ${text.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(text.slice(start));
  } catch {
    // continua
  }

  const end = text.lastIndexOf("]");
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // continua
    }
  }

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > start) {
    try {
      return JSON.parse(`${text.slice(start, lastBrace + 1)}]`) as RawItem[];
    } catch {
      // continua
    }
  }

  throw new Error(
    `JSON malformado ou truncado. Início: ${text.slice(start, start + 200)}`,
  );
}

export interface DocumentMetadata {
  institutionId?: string | null;
  institutionName?: string | null;
  limitCents?: number | null;
  initialBalanceCents?: number | null;
  closingDay?: number | null;
  dueDayOrPaymentDay?: number | null;
}

export type ChatFn = (
  action: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
) => Promise<string>;

function buildMetadataPrompt(): string {
  return `You are a financial document analyzer.
Extract metadata from a bank statement or credit card invoice (markdown format).

Return a JSON object with these fields (all optional, use null if not found):
- institutionName: name of the bank/institution (e.g., "Itaú", "Nubank", "Bradesco")
- limitCents: credit limit in cents (integer, for credit cards only)
- initialBalanceCents: account/card balance before these transactions in cents (integer)
- closingDay: day of month when credit card closes (integer 1-31, for credit cards only)
- dueDayOrPaymentDay: day of month when payment is due for credit cards, or transfer day for checking accounts (integer 1-31)

Rules:
- Extract numbers in BRL currency (convert to cents if shown in reais)
- Look for patterns like "Limite disponível", "Saldo anterior", "Data de fechamento", "Vencimento"
- Do not include any text outside the JSON object
- Do not wrap the object in markdown code fences`;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  if (start === -1) {
    return {};
  }

  try {
    const end = text.lastIndexOf("}");
    if (end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
  } catch {
    // continue
  }

  return {};
}

export async function extractDocumentMetadata(
  text: string,
  documentType: "card_invoice" | "account_statement",
  chat: ChatFn,
): Promise<DocumentMetadata> {
  const raw = await chat("metadata-extract", [
    { role: "system", content: buildMetadataPrompt() },
    {
      role: "user",
      content: `Extract metadata from this ${documentType === "card_invoice" ? "credit card invoice" : "bank statement"} (markdown format):\n\n${text}`,
    },
  ]);

  const parsed = parseJsonObject(cleanJson(raw)) as Record<string, unknown>;

  return {
    institutionName: (parsed.institutionName as string | null) ?? null,
    limitCents: (parsed.limitCents as number) ?? null,
    initialBalanceCents: (parsed.initialBalanceCents as number) ?? null,
    closingDay: (parsed.closingDay as number) ?? null,
    dueDayOrPaymentDay: (parsed.dueDayOrPaymentDay as number) ?? null,
  };
}

export async function extractTransactionsFromText(
  text: string,
  categories: { name: string; kind: string }[],
  chat: ChatFn,
  existingTagNames: string[] = [],
  documentType: "card_invoice" | "account_statement" = "account_statement",
  userFullName: string | null = null,
): Promise<ExtractedItem[]> {
  const raw = await chat("pdf-extract", [
    {
      role: "system",
      content: buildSystemPrompt(
        categories,
        existingTagNames,
        documentType,
        userFullName,
      ),
    },
    {
      role: "user",
      content: `Extract all transactions from this document (markdown format):\n\n${text}`,
    },
  ]);

  const parsed = parseJsonArray(cleanJson(raw));
  const existingTagSet = new Set(existingTagNames.map((t) => t.toLowerCase()));

  return parsed.map((t) => {
    const kind: "income" | "expense" | "transfer" =
      t.kind === "income" || t.kind === "transfer" ? t.kind : "expense";
    return {
      description: t.description,
      amountCents: Math.round(Math.abs(t.amountCents)),
      transactionDate: t.date ?? null,
      kind,
      // Numa fatura, dinheiro nunca sai do cartão: a perna que o documento
      // registra é sempre a de entrada. Regra fixa do servidor, não uma
      // inferência — o que o modelo devolveu é ignorado. Num extrato de conta
      // a direção vem do modelo.
      transferDirection:
        kind !== "transfer"
          ? null
          : documentType === "card_invoice"
            ? ("in" as const)
            : t.transferDirection === "out"
              ? ("out" as const)
              : ("in" as const),
      cardHolderRaw: t.cardHolder ?? null,
      installmentNumber: t.installmentNumber ?? null,
      installmentTotal: t.installmentTotal ?? null,
      currency: t.currency ?? "BRL",
      confidence: t.confidence ?? 1,
      suggestedCategoryName: t.category ?? null,
      // Defensive re-filter against the model's own vocabulary — a hallucinated
      // tag name here would otherwise create a new Tag row nobody asked for
      // (routes.ts resolves these names into Tag rows, see § description-tag-suggestion).
      suggestedTagNames: (t.tags ?? []).filter((name) =>
        existingTagSet.has(name.toLowerCase()),
      ),
    };
  });
}
