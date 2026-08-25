CREATE TABLE `discount_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`type` enum('percent','fixed') NOT NULL,
	`percentValue` int,
	`fixedAmountMnt` int,
	`minSubtotalMnt` int NOT NULL DEFAULT 0,
	`maxUses` int,
	`usesCount` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`expiresAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discount_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_codes_code_unique` UNIQUE(`code`)
);

ALTER TABLE `discount_codes` ADD CONSTRAINT `discount_codes_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;

CREATE INDEX `discount_codes_active_idx` ON `discount_codes` (`isActive`);

ALTER TABLE `orders` ADD `couponCode` varchar(40);
ALTER TABLE `orders` ADD `couponDiscountMnt` int NOT NULL DEFAULT 0;
