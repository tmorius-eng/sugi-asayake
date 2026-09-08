ALTER TABLE `users` ADD `storeCreditMnt` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `orders` ADD `storeCreditAppliedMnt` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `store_credit_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deltaMnt` int NOT NULL,
	`reason` varchar(300) NOT NULL,
	`actorUserId` int,
	`orderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `store_credit_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `store_credit_ledger` ADD CONSTRAINT `store_credit_ledger_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `store_credit_ledger` ADD CONSTRAINT `store_credit_ledger_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `store_credit_ledger` ADD CONSTRAINT `store_credit_ledger_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `store_credit_ledger_user_idx` ON `store_credit_ledger` (`userId`);
