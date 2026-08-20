CREATE TABLE `payment_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`provider` enum('qpay') NOT NULL,
	`providerInvoiceId` varchar(128) NOT NULL,
	`providerPaymentId` varchar(128),
	`status` enum('created','paid','failed','cancelled') NOT NULL DEFAULT 'created',
	`responseJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_attempts_providerInvoiceId_unique` UNIQUE(`providerInvoiceId`),
	CONSTRAINT `payment_attempts_providerPaymentId_unique` UNIQUE(`providerPaymentId`)
);
--> statement-breakpoint
CREATE INDEX `payment_attempts_order_idx` ON `payment_attempts` (`orderId`);--> statement-breakpoint
CREATE INDEX `payment_attempts_status_idx` ON `payment_attempts` (`status`);