// apps/api/src/auth/refresh-tokens.ts
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@lurem/db";
import type { FastifyReply } from "fastify";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Shared by every flow that starts a session (login, register) — the
 * cookie's security flags live in exactly one place so a future fix to
 * them can't miss a call site. */
export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/v1/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export class RefreshTokenReuseError extends Error {
  constructor() {
    super("Refresh token reuse detected — family revoked");
  }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function createTokenRow(
  prisma: PrismaClient,
  userId: string,
  familyId: string,
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

export async function issueRefreshTokenFamily(
  prisma: PrismaClient,
  userId: string,
): Promise<{ token: string; familyId: string }> {
  const familyId = randomUUID();
  const token = await createTokenRow(prisma, userId, familyId);
  return { token, familyId };
}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<{ token: string; userId: string; familyId: string }> {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    throw new Error("Invalid or expired refresh token");
  }

  const claim = await prisma.refreshToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claim.count === 0) {
    // Either already used, or being raced right now — either way, reuse.
    await revokeRefreshFamily(prisma, row.familyId);
    throw new RefreshTokenReuseError();
  }

  const newToken = await createTokenRow(prisma, row.userId, row.familyId);
  return { token: newToken, userId: row.userId, familyId: row.familyId };
}

export async function revokeRefreshFamily(
  prisma: PrismaClient,
  familyId: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoga TODAS as famílias de refresh token do usuário — usado após uma
 * troca de senha (reset ou settings) para forçar logout de toda sessão
 * ativa, não só a família da sessão atual (revokeRefreshFamily). */
export async function revokeAllRefreshTokensForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
