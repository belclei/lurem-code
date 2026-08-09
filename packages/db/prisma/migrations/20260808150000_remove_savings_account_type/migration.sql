-- Unify "checking" and "savings" into a single AccountType — the two never
-- had any behavioral difference (only enum validation + UI label), so the
-- distinction is removed rather than kept dormant.

-- Step 1: backfill existing rows away from the value being dropped, while
-- the old enum (which still contains 'savings') is still in place.
UPDATE "Account" SET "type" = 'checking' WHERE "type" = 'savings';

-- Step 2: Postgres has no direct "DROP VALUE" for enums — recreate the type
-- without it, repoint the column, then swap names.
BEGIN;
CREATE TYPE "AccountType_new" AS ENUM ('checking', 'cash');
ALTER TABLE "Account" ALTER COLUMN "type" TYPE "AccountType_new" USING ("type"::text::"AccountType_new");
ALTER TYPE "AccountType" RENAME TO "AccountType_old";
ALTER TYPE "AccountType_new" RENAME TO "AccountType";
DROP TYPE "AccountType_old";
COMMIT;
