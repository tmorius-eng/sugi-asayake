-- PREMIUM-FEATURES.md TIER 2: verified-purchase product reviews & ratings.
CREATE TABLE `product_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`userId` int NOT NULL,
	`orderId` int,
	`rating` int NOT NULL,
	`comment` text,
	`isApproved` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`)
);

ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX `product_reviews_user_product_idx` ON `product_reviews` (`userId`,`productId`);
CREATE INDEX `product_reviews_product_idx` ON `product_reviews` (`productId`);
