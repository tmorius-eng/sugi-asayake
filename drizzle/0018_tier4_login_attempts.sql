-- TIER 4: persistent login history (successful + failed attempts), backing
-- the admin "login history" view. Independent of the in-memory rate limiter.
CREATE TABLE `login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`userId` int,
	`success` boolean NOT NULL,
	`reason` varchar(60),
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
ALTER TABLE `login_attempts` ADD CONSTRAINT `login_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL;
CREATE INDEX `login_attempts_email_idx` ON `login_attempts` (`email`);
CREATE INDEX `login_attempts_created_idx` ON `login_attempts` (`createdAt`);
CREATE INDEX `login_attempts_user_idx` ON `login_attempts` (`userId`);
