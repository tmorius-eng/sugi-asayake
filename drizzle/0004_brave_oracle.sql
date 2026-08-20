CREATE TABLE `staff_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`tokenHash` varchar(64) NOT NULL,
	`invitedByUserId` int NOT NULL,
	`acceptedUserId` int,
	`status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_invitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `staff_invites_email_idx` ON `staff_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `staff_invites_status_idx` ON `staff_invitations` (`status`);--> statement-breakpoint
CREATE INDEX `staff_invites_expires_idx` ON `staff_invitations` (`expiresAt`);