-- 2026-09-20: хайлт v3 + монгол нэр.
--  nameMn         — барааны монгол нэр (storefront-ийн үндсэн гарчиг болно,
--                   `catalog-name-display` store setting-ээр; захиалга/POS латин
--                   `name` хэвээр). Эхний утга scripts/generate-product-names-mn.ts.
--  searchKeywords — admin-ий нэмэлт хайлтын үгс (таслалаар), хайлтын индекст
--                   өндөр жинтэй ордог.
--  productType    — барааны төрөл (shared/catalog-filter.ts productTypeOptions):
--                   санал болголтын төрлийн диверс + хайлтын concept.
ALTER TABLE `products` ADD COLUMN `nameMn` varchar(200);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `searchKeywords` varchar(500);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `productType` varchar(40);
