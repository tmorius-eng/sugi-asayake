CREATE TABLE `branch_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`variantId` int NOT NULL,
	`stockQuantity` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branch_stock_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_stock_unique` UNIQUE(`branchId`,`variantId`)
);
--> statement-breakpoint
ALTER TABLE `branch_stock` ADD CONSTRAINT `branch_stock_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `branch_stock` ADD CONSTRAINT `branch_stock_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `branch_stock_variant_idx` ON `branch_stock` (`variantId`);
