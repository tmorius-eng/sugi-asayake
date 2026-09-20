-- 2026-09-20: брэндийн бичлэгийн хувилбарууд (alias → canonical).
--
-- `products.brand` POS-оос чөлөөт текстээр ирдэг: `S-Select` 241 + `SSELECT` 2,
-- `BA-YU` 7 + `BAYU` 1, `CICA method` + `CICAmethod`, `Love Liner` + `LoveLiner` +
-- `Loveline`. Мөн худалдан авагч кириллээр ("кокочи", "приеклат", "асми") хайдаг.
-- Хайлтын индекс alias бүрийг брэндийн талбарт индекслэнэ; бараа бичигч бүр
-- брэндийг canonical руу нормчилно. Admin → Хайлт → Брэндийн alias.
-- Одоо байгаа мөрүүдийг scripts/normalise-product-brands.ts --apply засна.
CREATE TABLE `brand_aliases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `canonicalBrand` varchar(120) NOT NULL,
  `alias` varchar(120) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `brand_aliases_id` PRIMARY KEY(`id`),
  CONSTRAINT `brand_aliases_alias_unique` UNIQUE(`alias`)
);
--> statement-breakpoint
CREATE INDEX `brand_aliases_canonical_idx` ON `brand_aliases` (`canonicalBrand`);
