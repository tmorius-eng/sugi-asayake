-- verify.mn (Mongolian Mobile-Originated SMS) phone verification, 2026-09-05.
-- Backs an optional phone-verification step during register AND a
-- phone-based alternative to the email code for forgot-password (added
-- specifically because Brevo email delivery has been unreliable). See the
-- schema comment on phoneVerificationSessions in drizzle/schema.ts.
CREATE TABLE `phone_verification_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`purpose` enum('register','password_reset') NOT NULL,
	`phone` varchar(20) NOT NULL,
	`verifyMnSessionId` varchar(64) NOT NULL,
	`code` varchar(6) NOT NULL,
	`status` enum('pending','verified','expired') NOT NULL DEFAULT 'pending',
	`consumedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phone_verification_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `phone_verification_sessions_verifyMnSessionId_unique` UNIQUE(`verifyMnSessionId`)
);

CREATE INDEX `phone_verification_sessions_user_idx` ON `phone_verification_sessions` (`userId`);

CREATE INDEX `phone_verification_sessions_phone_purpose_idx` ON `phone_verification_sessions` (`phone`, `purpose`);

ALTER TABLE `phone_verification_sessions` ADD CONSTRAINT `phone_verification_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
