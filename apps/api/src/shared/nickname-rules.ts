// apps/api/src/shared/nickname-rules.ts
// issues.md: (1) o apelido (`name` de Account/CreditCard) precisa ser único
// entre todas as contas e cartões do usuário — duas linhas "Nubank"/"Nubank"
// ficam indistinguíveis na lista; (2) cada instituição só pode ter UM
// registro (conta OU cartão, separadamente) sem apelido — do contrário duas
// contas do mesmo banco sem apelido também ficam indistinguíveis.
import type { FastifyInstance } from "fastify";
import { VALIDATION_FAILED } from "../errors.js";

const FIELD = "name";

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export async function assertUniqueNickname(
  fastify: FastifyInstance,
  userId: string,
  name: string | null | undefined,
  exclude: { accountId?: string; cardId?: string } = {},
): Promise<void> {
  if (!name) return;
  const normalized = normalize(name);

  const [accounts, cards] = await Promise.all([
    fastify.prisma.account.findMany({
      where: { userId, isActive: true, name: { not: null } },
    }),
    fastify.prisma.creditCard.findMany({
      where: { userId, isActive: true, name: { not: null } },
    }),
  ]);

  const clash =
    accounts.some(
      (a) =>
        a.id !== exclude.accountId &&
        normalize(a.name as string) === normalized,
    ) ||
    cards.some(
      (c) =>
        c.id !== exclude.cardId && normalize(c.name as string) === normalized,
    );

  if (clash) {
    throw VALIDATION_FAILED([
      {
        field: FIELD,
        message: "Já existe uma conta ou cartão com este apelido.",
      },
    ]);
  }
}

export async function assertInstitutionNicknameRule(
  fastify: FastifyInstance,
  userId: string,
  institutionId: string | null | undefined,
  name: string | null | undefined,
  entity: "account" | "card",
  excludeId?: string,
): Promise<void> {
  if (!institutionId || name) return;

  const siblings =
    entity === "account"
      ? await fastify.prisma.account.findMany({
          where: { userId, institutionId, isActive: true, name: null },
        })
      : await fastify.prisma.creditCard.findMany({
          where: { userId, institutionId, isActive: true, name: null },
        });

  if (siblings.some((s) => s.id !== excludeId)) {
    throw VALIDATION_FAILED([
      {
        field: FIELD,
        message:
          "Já existe uma conta ou cartão desta instituição sem apelido. Defina um apelido para diferenciá-los.",
      },
    ]);
  }
}
