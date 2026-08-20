// apps/api/test/db.ts
import type { PrismaClient } from "@lurem/db";

// Truncates every table in the schema between tests — keeps integration
// tests independent without needing a full migrate reset per test.
//
// ⚠ Found via a real full-suite failure (Sprint 12): this list had drifted
// from the schema since Sprint 1 — UserConnection/SharedItem/DomainEvent
// (Sprint 11) and WaitlistEntry/Invite (Sprint 12) were never added, so
// rows from one test file leaked into another whenever the full suite ran,
// while single-file runs stayed green (each file's own randomized users
// masked it). Keep this in sync with every `model` in schema.prisma —
// there's no FK enforcement at the DB level in this schema (§0: plain FK id
// columns, no `@relation`), so order here doesn't matter for integrity, but
// children-before-parents is kept anyway for readability.
export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.descriptionTagSuggestion.deleteMany(),
    prisma.descriptionAlias.deleteMany(),
    prisma.extractedTransaction.deleteMany(),
    prisma.importedDocument.deleteMany(),
    prisma.recurringFulfillment.deleteMany(),
    prisma.recurringTransaction.deleteMany(),
    prisma.investmentMovement.deleteMany(),
    prisma.investment.deleteMany(),
    prisma.transactionTag.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.sharedItem.deleteMany(),
    prisma.userConnection.deleteMany(),
    prisma.creditCard.deleteMany(),
    prisma.account.deleteMany(),
    prisma.category.deleteMany(),
    prisma.institution.deleteMany(),
    prisma.domainEvent.deleteMany(),
    prisma.usageEvent.deleteMany(),
    prisma.usageDailyRollup.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.featureFlagOverride.deleteMany(),
    prisma.featureFlag.deleteMany(),
    prisma.waitlistEntry.deleteMany(),
    prisma.invite.deleteMany(),
    prisma.globalCalendarEntry.deleteMany(),
    prisma.release.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
