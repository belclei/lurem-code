-- Category.colorToken still holds pre-rebrand Harmon token names (--hm-*),
-- which don't exist in the current lurem-tokens.css palette — any UI reading
-- this field (transaction-card redesign, 2026-08) would resolve to nothing.
-- Idempotent (WHERE-guarded UPDATEs), same pattern as
-- 20260817000000_enable_feature_flags, so this fixes rows in every
-- environment regardless of whether seed.ts ever runs there (it doesn't in
-- prod — only migrate:deploy does).
--
-- Mapping per docs/superpowers/plans/2026-08-02-lurem-rebrand.md's published
-- correspondence table: sage->petrol, sand->gold, ink->night (1:1 by
-- number), clay->the --lr-negative-* family. `blue` was left an open
-- question by that document for other call sites; for category color
-- specifically it's resolved here as blue->petrol (same family already used
-- for "selected state" elsewhere in the app).
--
-- Covers every value ever actually seeded (SYSTEM_CATEGORIES in
-- packages/db/prisma/seed.ts + the 2 demo-user categories in
-- apps/api/scripts/seed-demo-user.ts) — not a general hm-*-family regex,
-- since --lr-negative-700/-800 (which the rebrand doc's clay-700/800
-- correspondence points at) don't exist as defined tokens yet, and mapping
-- into a nonexistent token would silently break the border instead of
-- fixing it.
UPDATE "Category" SET "colorToken" = '--lr-petrol-600' WHERE "colorToken" = '--hm-sage-600';
UPDATE "Category" SET "colorToken" = '--lr-petrol-500' WHERE "colorToken" = '--hm-sage-500';
UPDATE "Category" SET "colorToken" = '--lr-petrol-700' WHERE "colorToken" = '--hm-sage-700';
UPDATE "Category" SET "colorToken" = '--lr-gold-500' WHERE "colorToken" = '--hm-sand-500';
UPDATE "Category" SET "colorToken" = '--lr-gold-600' WHERE "colorToken" = '--hm-sand-600';
UPDATE "Category" SET "colorToken" = '--lr-night-500' WHERE "colorToken" = '--hm-ink-500';
UPDATE "Category" SET "colorToken" = '--lr-petrol-600' WHERE "colorToken" = '--hm-blue-600';
UPDATE "Category" SET "colorToken" = '--lr-petrol-500' WHERE "colorToken" = '--hm-blue-500';
UPDATE "Category" SET "colorToken" = '--lr-petrol-700' WHERE "colorToken" = '--hm-blue-700';
UPDATE "Category" SET "colorToken" = '--lr-petrol-300' WHERE "colorToken" = '--hm-blue-300';
UPDATE "Category" SET "colorToken" = '--lr-negative' WHERE "colorToken" = '--hm-clay-600';
UPDATE "Category" SET "colorToken" = '--lr-negative-500' WHERE "colorToken" = '--hm-clay-500';
UPDATE "Category" SET "colorToken" = '--lr-negative-100' WHERE "colorToken" = '--hm-clay-100';
UPDATE "Category" SET "colorToken" = '--lr-negative-on-tint' WHERE "colorToken" = '--hm-clay-650';
