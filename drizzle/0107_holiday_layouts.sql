-- 2026-10-06: Баяр тус бүрийн нүүрний бүтэц. Tom: "баяр бүрт theme БОЛОН layout солигдоно".
-- site_layouts нэг pageKey-д ганц мөртэй (глобал) байсан; одоо themeKey-ээр давхар:
--   themeKey = ''            → бүх өдрийн (глобал) бүтэц (одоо байгаа мөр хэвээр)
--   themeKey = 'new-year' …  → тухайн баяр идэвхтэй үед л нүүрэнд хэрэглэгдэх бүтэц
-- Баярын мөр байхгүй бол глобал бүтэц хэвээр (fallback) — тиймээс энэ migration-ээр
-- ямар ч харагдац өөрчлөгдөхгүй. NULL биш '' ашигласан: MySQL-ийн UNIQUE нь олон NULL-ийг
-- зөвшөөрдөг тул (pageKey, NULL) давхардах байсан.
--
-- Ажиллуулах: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0107_holiday_layouts.sql
-- (staging: --staging). Кодоос ӨМНӨ — server/_core/migrationCheck.ts шаардана.

ALTER TABLE `site_layouts` ADD COLUMN `themeKey` varchar(64) NOT NULL DEFAULT '';

ALTER TABLE `site_layouts` DROP INDEX `site_layouts_page_unique`;

ALTER TABLE `site_layouts` ADD CONSTRAINT `site_layouts_page_theme_unique` UNIQUE(`pageKey`, `themeKey`);
