-- Tier F of the admin analytics dashboard: admin-entered monthly marketing
-- spend, the one input CAC needs. See the schema comment on marketingSpend.
CREATE TABLE `marketing_spend` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`spendMnt` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketing_spend_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketing_spend_monthKey_unique` UNIQUE(`monthKey`)
);

ALTER TABLE `marketing_spend` ADD CONSTRAINT `marketing_spend_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`);

CREATE INDEX `marketing_spend_updated_by_idx` ON `marketing_spend` (`updatedByUserId`);
