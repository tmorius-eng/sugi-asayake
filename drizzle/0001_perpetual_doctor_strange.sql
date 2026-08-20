CREATE TABLE `cart_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cartId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('active','converted','abandoned') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carts_id` PRIMARY KEY(`id`),
	CONSTRAINT `carts_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `cart_items_cart_idx` ON `cart_items` (`cartId`);--> statement-breakpoint
CREATE INDEX `cart_items_product_idx` ON `cart_items` (`productId`);--> statement-breakpoint
CREATE INDEX `carts_status_idx` ON `carts` (`status`);