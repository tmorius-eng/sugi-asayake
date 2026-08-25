-- ROADMAP.md TIER 2: "Хайлт зөвхөн клиент талд" — the /shop search box
-- previously worked by shipping the ENTIRE published catalog (~937 rows) to
-- every visitor's browser and filtering it with a JS substring check. This
-- adds a real server-side full-text index so a search query only returns
-- matching rows from the database, matching against name/brand/short
-- description (see server/db.ts searchPublishedCatalog).
ALTER TABLE `products` ADD FULLTEXT INDEX `products_search_idx` (`name`, `brand`, `shortDescription`);
