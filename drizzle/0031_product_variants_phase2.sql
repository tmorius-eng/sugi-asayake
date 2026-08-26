-- PHASE 2 of product variants (see the long comment above productVariants in
-- drizzle/schema.ts, and PHASE 1's own 0030 migration). Wires cart_items and
-- order_items to a real variantId so a shopper can actually choose and buy a
-- non-default variant. Cart/checkout math now always resolves through
-- product_variants -- for every product, single- or multi-variant alike.

-- cart_items: variantId replaces productId as the line-item key. Nullable
-- first so it can be backfilled, then locked to NOT NULL. Every existing
-- product has exactly one isDefault=true variant (guaranteed by PHASE 1's
-- backfill and by deleteAdminProductVariant always keeping >=1), so this join
-- is deterministic -- an existing cart line's product resolves to that
-- product's current default variant.
ALTER TABLE `cart_items` ADD COLUMN `variantId` int AFTER `productId`;

UPDATE `cart_items` ci
INNER JOIN `product_variants` pv ON pv.`productId` = ci.`productId` AND pv.`isDefault` = true
SET ci.`variantId` = pv.`id`
WHERE ci.`variantId` IS NULL;

ALTER TABLE `cart_items` MODIFY COLUMN `variantId` int NOT NULL;

ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `cart_items` DROP INDEX `cart_items_cart_product_unique`;

ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_variant_unique` UNIQUE(`cartId`,`variantId`);

ALTER TABLE `cart_items` DROP FOREIGN KEY `cart_items_productId_products_id_fk`;

ALTER TABLE `cart_items` DROP INDEX `cart_items_product_idx`;

ALTER TABLE `cart_items` DROP COLUMN `productId`;

-- order_items: variantId added alongside the existing (already nullable,
-- already SET NULL) productId -- order rows denormalize productName/sku/
-- unitPriceMnt already, so history survives even if a variant is later
-- deleted. Backfilled best-effort the same way; historical rows that predate
-- variants entirely still get a sensible value since every product has at
-- least one variant today.
ALTER TABLE `order_items` ADD COLUMN `variantId` int AFTER `productId`;

UPDATE `order_items` oi
INNER JOIN `product_variants` pv ON pv.`productId` = oi.`productId` AND pv.`isDefault` = true
SET oi.`variantId` = pv.`id`
WHERE oi.`variantId` IS NULL AND oi.`productId` IS NOT NULL;

ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX `order_items_variant_idx` ON `order_items` (`variantId`);
