CREATE TABLE `integration_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` enum('ebarimt','storepay','card_golomt','courier_ebuuhia') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`encryptedConfig` text,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integration_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_configs_provider_unique` UNIQUE(`provider`)
);

ALTER TABLE `integration_configs` ADD CONSTRAINT `integration_configs_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
