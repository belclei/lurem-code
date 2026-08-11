import { PrismaClient } from "@lurem/db";
// apps/api/src/auth/password-reset-tokens.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetTestDb } from "../../test/db.js";
import { AppError } from "../errors.js";
import {
  consumePasswordResetToken,
  issuePasswordResetToken,
} from "./password-reset-tokens.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});
afterEach(async () => {
  await resetTestDb(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `${crypto.randomUUID()}@test.com`,
      name: "Test",
      birthDate: new Date("1990-01-01"),
    },
  });
}

describe("password reset tokens", () => {
  it("issues a token that consumes back to the same userId", async () => {
    const user = await makeUser();
    const raw = await issuePasswordResetToken(prisma, user.id);
    const userId = await consumePasswordResetToken(prisma, raw);
    expect(userId).toBe(user.id);
  });

  it("rejects a token that was already consumed", async () => {
    const user = await makeUser();
    const raw = await issuePasswordResetToken(prisma, user.id);
    await consumePasswordResetToken(prisma, raw);

    await expect(consumePasswordResetToken(prisma, raw)).rejects.toThrow(
      AppError,
    );
  });

  it("rejects an expired token", async () => {
    const user = await makeUser();
    const raw = await issuePasswordResetToken(prisma, user.id);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(consumePasswordResetToken(prisma, raw)).rejects.toMatchObject({
      code: "auth.token_expired",
    });
  });

  it("rejects a token that never existed", async () => {
    await expect(
      consumePasswordResetToken(prisma, "not-a-real-token"),
    ).rejects.toMatchObject({ code: "auth.token_invalid" });
  });

  it("invalidates a previous unused token when a new one is issued for the same user", async () => {
    const user = await makeUser();
    const firstRaw = await issuePasswordResetToken(prisma, user.id);
    await issuePasswordResetToken(prisma, user.id);

    await expect(
      consumePasswordResetToken(prisma, firstRaw),
    ).rejects.toMatchObject({ code: "auth.token_invalid" });
  });
});
