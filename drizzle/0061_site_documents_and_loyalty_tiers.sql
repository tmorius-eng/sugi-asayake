-- 2026-09-12, "/admin дээр front website-ийн бүх зүйлийг 100% засварлах"
-- pass. Two tables, both the same slot/override shape every other
-- admin-editable table in this project already uses (site_text,
-- site_media, store_settings): a row overrides a code fallback, deleting
-- the row restores exactly today's behaviour.
--
-- 1. site_documents -- the three legal pages (/privacy, /terms, /returns).
--    These were a `documents` object literal inside Legal.tsx, so editing a
--    sentence of the returns policy (a business decision, and one Tom has
--    already revised twice) required a code deploy. Now edited in /admin
--    with the same TinyMCE editor as the news posts, and stored as
--    sanitized HTML (server/_core/sanitizeHtml.ts) exactly like posts.content.
--
--    `contentHtml` is `text` (64 KB) not `varchar`: the privacy policy is
--    already ~9 KB of prose before any admin expands it.
--
--    `updatedLabel` is a free-text "Сүүлд шинэчилсэн: 2026.09.06" stamp,
--    deliberately NOT derived from `updatedAt`. A legal document's stated
--    revision date is an editorial claim the shop makes (and may want to
--    leave alone while fixing a typo), not a row's mtime.
--
-- 2. loyalty_tiers -- the cumulative-spend discount ladder that until now
--    lived in shared/loyalty.ts as a TypeScript constant. It mirrors the
--    real tiers configured on the shop's Smart POS, so when those change
--    the website has to follow without a deploy. Seeded below with exactly
--    today's four tiers so behaviour is unchanged on the day this runs.
--
--    `minSpendMnt` is `int`: the top tier is 10,000,000₮ and MySQL's signed
--    int reaches 2.1 billion, which is far beyond any real lifetime-spend
--    threshold this shop would set.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0061_site_documents_and_loyalty_tiers.sql

CREATE TABLE `site_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentKey` varchar(40) NOT NULL,
	`title` varchar(200) NOT NULL,
	`lead` text,
	`contentHtml` text NOT NULL,
	`updatedLabel` varchar(40),
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_documents_documentKey_unique` UNIQUE(`documentKey`)
);

ALTER TABLE `site_documents` ADD CONSTRAINT `site_documents_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;

CREATE INDEX `site_documents_updated_by_idx` ON `site_documents` (`updatedByUserId`);

CREATE TABLE `loyalty_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`discountPercent` int NOT NULL DEFAULT 0,
	`minSpendMnt` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_tiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `loyalty_tiers_name_unique` UNIQUE(`name`)
);

ALTER TABLE `loyalty_tiers` ADD CONSTRAINT `loyalty_tiers_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

CREATE INDEX `loyalty_tiers_min_spend_idx` ON `loyalty_tiers` (`minSpendMnt`);

-- Seed with exactly the four tiers shared/loyalty.ts has served since
-- 2026-08-25 (confirmed against the shop's own POS). Written as an
-- idempotent INSERT so re-running the file after a partial apply does not
-- duplicate them.
INSERT INTO `loyalty_tiers` (`name`, `discountPercent`, `minSpendMnt`, `sortOrder`)
VALUES ('Стандарт', 0, 0, 0), ('Хүрэл', 3, 500000, 1), ('Мөнгөн', 5, 1000000, 2), ('Алтан', 10, 10000000, 3)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
