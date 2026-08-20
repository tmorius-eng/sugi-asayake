ALTER TABLE `carts` DROP INDEX `carts_userId_unique`;--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_product_unique` UNIQUE(`cartId`,`productId`);--> statement-breakpoint
CREATE INDEX `carts_user_idx` ON `carts` (`userId`);