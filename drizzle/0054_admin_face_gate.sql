-- Admin face gate (2026-09-08): browser-camera face recognition as a second
-- factor in front of /admin, for all 5 panel roles. See drizzle/schema.ts for
-- the full rationale, including why only a 128-number descriptor is stored and
-- never a photograph, and why the public-domain dlib recognition model was
-- chosen over the more accurate but non-commercially-licensed ArcFace family.

ALTER TABLE `users` ADD COLUMN `faceVerifiedAt` timestamp;

CREATE TABLE `face_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`descriptorJson` text NOT NULL,
	`sampleCount` int NOT NULL DEFAULT 1,
	`modelVersion` varchar(60) NOT NULL,
	`consentedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `face_enrollments_id` PRIMARY KEY(`id`)
);

CREATE UNIQUE INDEX `face_enrollments_user_idx` ON `face_enrollments` (`userId`);
ALTER TABLE `face_enrollments` ADD CONSTRAINT `face_enrollments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;

CREATE TABLE `face_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` enum('blink','turn_left','turn_right','open_mouth') NOT NULL,
	`consumedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `face_challenges_id` PRIMARY KEY(`id`)
);

CREATE INDEX `face_challenges_user_idx` ON `face_challenges` (`userId`);
ALTER TABLE `face_challenges` ADD CONSTRAINT `face_challenges_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;

CREATE TABLE `face_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`outcome` enum('enrolled','verified','no_match','liveness_failed','error') NOT NULL,
	`distance` int,
	`detail` varchar(160),
	`ip` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `face_attempts_id` PRIMARY KEY(`id`)
);

CREATE INDEX `face_attempts_user_idx` ON `face_attempts` (`userId`);
CREATE INDEX `face_attempts_created_idx` ON `face_attempts` (`createdAt`);
ALTER TABLE `face_attempts` ADD CONSTRAINT `face_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
