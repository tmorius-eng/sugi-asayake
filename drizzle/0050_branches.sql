CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`address` text NOT NULL,
	`phone` varchar(40),
	`mapUrl` text,
	`photoUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`isFulfillmentDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_slug_unique` UNIQUE(`slug`)
);
