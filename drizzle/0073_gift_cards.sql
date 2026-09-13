-- 2026-09-13: gift cards (growth tier). Issued by finance/admin (or later by
-- a paid order), redeemed once by a signed-in customer into store credit
-- (users.storeCreditMnt + store_credit_ledger), which checkout already spends.
CREATE TABLE `gift_cards` (
  `id` int AUTO_INCREMENT NOT NULL,
  `code` varchar(24) NOT NULL,
  `amountMnt` int NOT NULL,
  `status` enum('active','redeemed','void') NOT NULL DEFAULT 'active',
  `issuedByUserId` int NULL,
  `purchaseOrderId` int NULL,
  `redeemedByUserId` int NULL,
  `redeemedAt` timestamp NULL,
  `recipientName` varchar(120) NULL,
  `note` varchar(300) NULL,
  `expiresAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `gift_cards_id` PRIMARY KEY(`id`),
  CONSTRAINT `gift_cards_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `gift_cards` ADD CONSTRAINT `gift_cards_issuedBy_fk` FOREIGN KEY (`issuedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gift_cards` ADD CONSTRAINT `gift_cards_redeemedBy_fk` FOREIGN KEY (`redeemedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gift_cards` ADD CONSTRAINT `gift_cards_order_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;
