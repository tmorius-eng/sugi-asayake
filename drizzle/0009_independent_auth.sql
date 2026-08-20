-- Migration: replace Manus OAuth identity columns with the app's own
-- email+password auth.
--
-- IMPORTANT — apply this by hand (e.g. via the mysql CLI or a MySQL GUI),
-- not via `pnpm db:push`. The drizzle-kit "meta" journal/snapshot folder
-- that tracks which of the prior 0000-0008 migrations have already run
-- against your database was not included in the project export, so
-- drizzle-kit cannot safely auto-diff against your real schema right now.
-- (See the audit notes for how to regenerate that journal before trusting
-- `db:push` again.)
--
-- This migration assumes the `users` table currently has no rows you need to
-- keep (true for this project: the catalog/orders were empty at last audit,
-- and no real customer had registered through OAuth yet). If real users
-- already exist, back up the table first and decide how to backfill
-- `passwordHash` for them (e.g. force a password-reset flow) before running
-- the DROP/NOT NULL statements below.

ALTER TABLE `users`
  ADD COLUMN `passwordHash` varchar(200) NOT NULL DEFAULT '' AFTER `name`;

ALTER TABLE `users`
  MODIFY COLUMN `email` varchar(320) NOT NULL;

-- Drop the old OAuth-only unique index/column before adding the new unique
-- index on email (email was not previously guaranteed unique/non-null).
ALTER TABLE `users` DROP INDEX `openId`;
ALTER TABLE `users` DROP COLUMN `openId`;
ALTER TABLE `users` DROP COLUMN `loginMethod`;

ALTER TABLE `users`
  ADD UNIQUE INDEX `users_email_unique` (`email`);
