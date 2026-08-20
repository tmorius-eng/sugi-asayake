CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int,
	`productName` varchar(180) NOT NULL,
	`sku` varchar(80) NOT NULL,
	`unitPriceMnt` int NOT NULL,
	`quantity` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`orderNumber` varchar(32) NOT NULL,
	`status` enum('pending','confirmed','packed','out_for_delivery','completed','cancelled') NOT NULL DEFAULT 'pending',
	`paymentMethod` enum('qpay','bank_transfer','card','cash_on_delivery') NOT NULL,
	`paymentStatus` enum('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
	`deliveryMethod` enum('ub_delivery','store_pickup') NOT NULL,
	`deliveryAddress` text,
	`customerName` varchar(160) NOT NULL,
	`customerPhone` varchar(40) NOT NULL,
	`customerEmail` varchar(320),
	`subtotalMnt` int NOT NULL,
	`deliveryFeeMnt` int NOT NULL DEFAULT 0,
	`totalMnt` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`description` text,
	`imageUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`brand` varchar(120),
	`shortDescription` text,
	`description` text,
	`priceMnt` int NOT NULL,
	`compareAtPriceMnt` int,
	`sku` varchar(80) NOT NULL,
	`imageUrl` text,
	`galleryJson` text,
	`stockQuantity` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`userId`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`categoryId`);--> statement-breakpoint
CREATE INDEX `products_published_idx` ON `products` (`isPublished`);