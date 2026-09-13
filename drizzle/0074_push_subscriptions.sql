-- 2026-09-13: customer Web Push (VAPID) subscriptions. One row per browser;
-- endpoint is the unique key. Gone (410/404 from the push service) rows are
-- deleted on send.
CREATE TABLE `push_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `endpoint` varchar(1000) NOT NULL,
  `p256dh` varchar(200) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `userAgent` varchar(300) NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `lastUsedAt` timestamp NULL,
  CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `push_subscriptions_endpoint_unique` UNIQUE(`endpoint`(255))
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`userId`);
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
