-- 2026-09-14: product facts a cosmetics/food shopper (and the consumer
-- protection law) expects -- ingredients, net content, country of origin,
-- shelf life. Editable per product in /admin, importable by CSV, and
-- pre-filled from the Open Food/Beauty Facts barcode databases by
-- scripts/enrich-products-from-open-facts.ts (factsSource says where a
-- value came from; an admin edit sets it to "admin").
ALTER TABLE `products`
  ADD COLUMN `ingredients` TEXT NULL AFTER `wellnessInterests`,
  ADD COLUMN `netContent` VARCHAR(80) NULL AFTER `ingredients`,
  ADD COLUMN `countryOfOrigin` VARCHAR(80) NULL AFTER `netContent`,
  ADD COLUMN `shelfLifeMonths` INT NULL AFTER `countryOfOrigin`,
  ADD COLUMN `factsSource` VARCHAR(40) NULL AFTER `shelfLifeMonths`;
