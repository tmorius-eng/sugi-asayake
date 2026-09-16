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

-- ⚠️ 2026-09-16 засвар. Энэ файл нь ГАНЦ chunk байсан бөгөөд дотор нь
-- `ALTER TABLE users DROP INDEX openId` гэсэн мөр байв. 0000-д тэр индекс
-- `CONSTRAINT users_openId_unique UNIQUE(openId)` гэж үүсдэг тул МySQL-ийн
-- өгөх нэр нь `users_openId_unique`, `openId` БИШ — мөр нь "Can't DROP
-- 'openId'" гэж унана. `scripts/db-apply-all-migrations.ts` тэр алдааг
-- алгасдаг (SKIPPABLE) ба chunk нь ганц байсан тул **түүнээс хойшхи бүх
-- мөр хамт алгасагдана**: `openId`, `loginMethod` устгагдахгүй,
-- `users_email_unique` индекс огт үүсэхгүй. Production дээр гараар
-- ажилласан тул зөв төлөвтэй байсан ч, гинжээс шинээр байгуулсан ямар ч
-- DB (CI) буруу схемтэй гарч, 42 integration файл "Field 'openId' doesn't
-- have a default value" гэж унаж байв.
--
-- Засвар хоёр хэсэгтэй: (1) DROP INDEX мөрийг бүрмөсөн хассан — багана
-- устахад ЗӨВХӨН түүнийг хамарсан индекс MySQL-д автоматаар хамт устдаг
-- (бодит MySQL дээр хэмжиж баталсан); (2) мөр бүрийг өөрийн chunk болгов,
-- ингэснээр нэг мөрийн алдаа дараагийнхыг чимээгүй залгихгүй.
ALTER TABLE `users`
  ADD COLUMN `passwordHash` varchar(200) NOT NULL DEFAULT '' AFTER `name`;
--> statement-breakpoint
ALTER TABLE `users`
  MODIFY COLUMN `email` varchar(320) NOT NULL;
--> statement-breakpoint
-- Drop the old OAuth-only columns before adding the new unique index on
-- email (email was not previously guaranteed unique/non-null).
ALTER TABLE `users` DROP COLUMN `openId`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;
--> statement-breakpoint
ALTER TABLE `users`
  ADD UNIQUE INDEX `users_email_unique` (`email`);
