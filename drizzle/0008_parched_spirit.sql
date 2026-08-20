CREATE TABLE `site_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotKey` varchar(80) NOT NULL,
	`imageUrl` text NOT NULL,
	`altText` varchar(240),
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_media_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_media_slotKey_unique` UNIQUE(`slotKey`)
);
--> statement-breakpoint
CREATE INDEX `site_media_updated_by_idx` ON `site_media` (`updatedByUserId`);