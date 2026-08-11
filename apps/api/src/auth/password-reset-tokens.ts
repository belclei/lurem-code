// apps/api/src/auth/password-reset-tokens.ts
// "Esqueci minha senha" (§6.1 emenda 10/08/2026) — mesmo padrão de token de
// access/tokens.ts e refresh-tokens.ts: gera um valor aleatório, guarda só
// o hash (sha256, hashToken já existente) e nunca o valor bruto.
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@lurem/db";
import { AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID } from "../errors.js";
import { hashToken } from "./refresh-tokens.js";

// Bem mais curto que os 7 dias de Invite/WaitlistEntry (access/tokens.ts) —
// um link de reset de senha vazado (e-mail comprometido, encaminhamento
// acidental) tem uma janela de exploração que deve ser mínima. 1h é o
// padrão de mercado (Auth0, GitHub, etc.) pra esse fluxo específico.
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Cria um novo token de reset para o usuário, invalidando (marcando como
 * usado) qualquer token anterior ainda não usado — só o pedido mais recente
 * continua válido. Retorna o valor bruto (nunca persistido). */
export async function issuePasswordResetToken(
  prisma: PrismaClient,
  userId: string,
): Promise<string> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    },
  });
  return raw;
}

/** Valida e consome (marca usedAt) atomicamente — mesma técnica de claim
 * usada por rotateRefreshToken (refresh-tokens.ts): a atualização
 * condicional em `usedAt: null` garante que, numa corrida de dois requests
 * com o mesmo token, só um vence. Retorna o userId do token; lança
 * AUTH_TOKEN_INVALID (inexistente/já usado) ou AUTH_TOKEN_EXPIRED. */
export async function consumePasswordResetToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<string> {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!row || row.usedAt) {
    throw AUTH_TOKEN_INVALID();
  }
  if (row.expiresAt < new Date()) {
    throw AUTH_TOKEN_EXPIRED();
  }

  const claim = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claim.count === 0) {
    // Perdeu a corrida contra outro request com o mesmo token.
    throw AUTH_TOKEN_INVALID();
  }
  return row.userId;
}
