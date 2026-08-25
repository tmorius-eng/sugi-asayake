CREATE TABLE `site_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`displayMode` enum('popup','banner') NOT NULL DEFAULT 'popup',
	`headline` varchar(160) NOT NULL,
	`message` text,
	`imageUrl` text,
	`ctaLabel` varchar(60),
	`ctaUrl` varchar(300),
	`startsAt` timestamp,
	`endsAt` timestamp,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_promotions_id` PRIMARY KEY(`id`)
);

ALTER TABLE `site_promotions` ADD CONSTRAINT `site_promotions_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;

CREATE INDEX `site_promotions_active_idx` ON `site_promotions` (`isActive`);
