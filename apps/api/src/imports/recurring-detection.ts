// Detecção de assinatura (docs/superpowers/specs/2026-08-19-subscription-detection-design.md).
// Duas buscas, escopadas ao usuário, mesma convenção de "sinal pra revisão
// humana decidir" que findDuplicateTransactions já usa em routes.ts — não
// são checagens exaustivas nem bloqueiam nada.
import type { PrismaClient } from "@lurem/db";

const CADENCE_MIN_DAYS = 25;
const CADENCE_MAX_DAYS = 35;
const AMOUNT_TOLERANCE = 0.05;
const MIN_PRIOR_OCCURRENCES = 2;
const MS_PER_DAY = 86_400_000;

// Caso A (spec §"Dois campos, dois comportamentos") — já existe uma série
// ATIVA com a mesma descrição (pós-alias, match exato). Retorna descrição →
// recurringTransactionId; ausência de entrada = nenhuma série bate.
export async function findRecurringSeriesMatches(
  prisma: PrismaClient,
  userId: string,
  descriptions: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(descriptions)];
  if (unique.length === 0) return new Map();

  const series = await prisma.recurringTransaction.findMany({
    where: { userId, isActive: true, description: { in: unique } },
    select: { id: true, description: true },
  });

  const byDescription = new Map<string, string>();
  for (const s of series) {
    if (!byDescription.has(s.description))
      byDescription.set(s.description, s.id);
  }
  return byDescription;
}

export interface PatternCandidate {
  description: string;
  currency: string;
  kind: string;
  amountCents: number;
  date: Date;
}

// Caso B, padrão genérico (spec §"Padrão genérico") — precisa de
// MIN_PRIOR_OCCURRENCES (2) Transaction confirmadas do mesmo usuário, mesma
// descrição/moeda/kind, valor dentro de ±5%, formando uma cadeia de
// intervalos de 25–35 dias terminando logo antes da data do candidato.
// Retorna descrição → ids das transações que formaram o padrão, em ordem
// cronológica (mais antiga primeiro) — é o que o confirm usa pra religar o
// histórico.
export async function findRecurringPatternMatches(
  prisma: PrismaClient,
  userId: string,
  candidates: PatternCandidate[],
): Promise<Map<string, string[]>> {
  const descriptions = [...new Set(candidates.map((c) => c.description))];
  if (descriptions.length === 0) return new Map();

  const priorTxs = await prisma.transaction.findMany({
    where: { userId, description: { in: descriptions } },
    orderBy: { transactionDate: "desc" },
    select: {
      id: true,
      description: true,
      currency: true,
      kind: true,
      amountCents: true,
      transactionDate: true,
    },
  });

  const byDescription = new Map<string, typeof priorTxs>();
  for (const tx of priorTxs) {
    const list = byDescription.get(tx.description) ?? [];
    list.push(tx);
    byDescription.set(tx.description, list);
  }

  const result = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (result.has(candidate.description)) continue;

    const pool = (byDescription.get(candidate.description) ?? []).filter(
      (tx) =>
        tx.currency === candidate.currency &&
        tx.kind === candidate.kind &&
        Math.abs(tx.amountCents - candidate.amountCents) <=
          candidate.amountCents * AMOUNT_TOLERANCE,
    );

    const chain: (typeof pool)[number][] = [];
    let cursor = candidate.date;
    for (const tx of pool) {
      const gapDays =
        (cursor.getTime() - tx.transactionDate.getTime()) / MS_PER_DAY;
      if (gapDays < CADENCE_MIN_DAYS || gapDays > CADENCE_MAX_DAYS) break;
      chain.push(tx);
      cursor = tx.transactionDate;
      if (chain.length === MIN_PRIOR_OCCURRENCES) break;
    }

    if (chain.length === MIN_PRIOR_OCCURRENCES) {
      result.set(candidate.description, chain.map((tx) => tx.id).reverse());
    }
  }
  return result;
}
