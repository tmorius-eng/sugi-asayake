CREATE TABLE `admin_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`metadataJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(220) NOT NULL,
	`slug` varchar(240) NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`coverImageUrl` text,
	`isPublished` boolean NOT NULL DEFAULT false,
	`publishedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `admin_audit_actor_idx` ON `admin_audit_logs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `admin_audit_entity_idx` ON `admin_audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `posts_published_idx` ON `posts` (`isPublished`);--> statement-breakpoint
CREATE INDEX `posts_created_by_idx` ON `posts` (`createdByUserId`);