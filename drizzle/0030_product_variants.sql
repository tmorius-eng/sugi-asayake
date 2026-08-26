-- PHASE 1 of product variants (see the long comment above productVariants
-- in drizzle/schema.ts). Purely additive: creates the table, then backfills
-- exactly one variant per existing product mirroring its own sku/price/
-- stock. products.priceMnt/stockQuantity/sku remain the source of truth for
-- cart/checkout/orders in this phase -- nothing about live purchasing
-- behavior changes.
CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`sku` varchar(80) NOT NULL,
	`attributesJson` text,
	`priceMnt` int NOT NULL,
	`compareAtPriceMnt` int,
	`stockQuantity` int NOT NULL DEFAULT 0,
	`imageUrl` text,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_sku_unique` UNIQUE(`sku`)
);

ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;

CREATE INDEX `product_variants_product_idx` ON `product_variants` (`productId`);

INSERT INTO `product_variants` (`productId`, `sku`, `attributesJson`, `priceMnt`, `compareAtPriceMnt`, `stockQuantity`, `imageUrl`, `isDefault`, `createdAt`, `updatedAt`)
SELECT `id`, `sku`, NULL, `priceMnt`, `compareAtPriceMnt`, `stockQuantity`, `imageUrl`, true, NOW(), NOW()
FROM `products`;
