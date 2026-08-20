-- Customer profile page: phone + avatar on users, plus a saved address book
-- so a returning shopper doesn't retype delivery info every checkout.
ALTER TABLE `users` ADD `phone` varchar(40);
ALTER TABLE `users` ADD `avatarUrl` varchar(500);

CREATE TABLE `user_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(60) NOT NULL,
	`recipientName` varchar(160) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`addressLine` text NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_addresses_id` PRIMARY KEY(`id`)
);
ALTER TABLE `user_addresses` ADD CONSTRAINT `user_addresses_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
CREATE INDEX `user_addresses_user_idx` ON `user_addresses` (`userId`);
