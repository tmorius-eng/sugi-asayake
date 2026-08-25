-- Profile page expansion: Beauty & Home preferences, notification opt-ins,
-- and a wishlist / saved-items list with back-in-stock alerts.
ALTER TABLE `users` ADD `skinType` enum('dry','oily','combination','sensitive','normal');
ALTER TABLE `users` ADD `skinConcerns` varchar(300);
ALTER TABLE `users` ADD `interiorStyle` varchar(60);
ALTER TABLE `users` ADD `emailOptIn` boolean NOT NULL DEFAULT true;
ALTER TABLE `users` ADD `smsOptIn` boolean NOT NULL DEFAULT true;

CREATE TABLE `wishlist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`notifyOnRestock` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wishlist_items_id` PRIMARY KEY(`id`)
);
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE;
CREATE UNIQUE INDEX `wishlist_items_user_product_idx` ON `wishlist_items` (`userId`, `productId`);
CREATE INDEX `wishlist_items_product_idx` ON `wishlist_items` (`productId`);
