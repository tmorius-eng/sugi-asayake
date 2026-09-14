-- 2026-09-14: one legal document per language. The storefront can be read in
-- Mongolian, English or Japanese, and a translated privacy policy is a
-- separate authored text, not a dictionary lookup. Existing rows keep
-- working as the Mongolian version (DEFAULT 'mn').
ALTER TABLE `site_documents` ADD COLUMN `locale` varchar(2) NOT NULL DEFAULT 'mn' AFTER `documentKey`;
--> statement-breakpoint
ALTER TABLE `site_documents` DROP INDEX `site_documents_documentKey_unique`;
--> statement-breakpoint
ALTER TABLE `site_documents` ADD CONSTRAINT `site_documents_key_locale_unique` UNIQUE (`documentKey`, `locale`);
