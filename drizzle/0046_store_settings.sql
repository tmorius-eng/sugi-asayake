CREATE TABLE `store_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(80) NOT NULL,
	`settingValue` varchar(2000) NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
ALTER TABLE `store_settings` ADD CONSTRAINT `store_settings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `store_settings_updated_by_idx` ON `store_settings` (`updatedByUserId`);
