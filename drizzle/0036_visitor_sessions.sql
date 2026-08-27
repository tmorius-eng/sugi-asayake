-- Tier E of the admin analytics dashboard: minimal first-party visitor/
-- session tracking so Conversion Rate can be computed for real. See the
-- schema comments on visitorSessions and orders.visitorSessionId.
CREATE TABLE `visitor_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`landingPath` varchar(300) NOT NULL,
	`trafficSource` varchar(200),
	`deviceType` enum('mobile','tablet','desktop','unknown'),
	`pageViewCount` int NOT NULL DEFAULT 1,
	CONSTRAINT `visitor_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `visitor_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);

CREATE INDEX `visitor_sessions_last_seen_idx` ON `visitor_sessions` (`lastSeenAt`);

CREATE INDEX `visitor_sessions_created_idx` ON `visitor_sessions` (`createdAt`);

ALTER TABLE `orders` ADD COLUMN `visitorSessionId` int;

ALTER TABLE `orders` ADD CONSTRAINT `orders_visitorSessionId_visitor_sessions_id_fk` FOREIGN KEY (`visitorSessionId`) REFERENCES `visitor_sessions`(`id`) ON DELETE SET NULL;
