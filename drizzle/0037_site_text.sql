CREATE TABLE `site_text` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotKey` varchar(80) NOT NULL,
	`textValue` text NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_text_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_text_slotKey_unique` UNIQUE(`slotKey`)
);
--> statement-breakpoint
ALTER TABLE `site_text` ADD CONSTRAINT `site_text_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `site_text_updated_by_idx` ON `site_text` (`updatedByUserId`);
