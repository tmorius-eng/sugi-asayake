-- 2026-09-11, Phase 4 of the notifications + warehouse plan: moving goods
-- from the warehouse to a store, checked by scanning at both ends.
--
-- Tom's flow: the warehouse packs a transfer (scanning what goes in the
-- box) and presses "Send" -- the goods leave the warehouse's shelf right
-- then and are IN TRANSIT. At the store, with /admin open, the consultant
-- scans every item that arrived (each scan = +1) WITHOUT seeing what was
-- sent, so they really count. Confirming compares the two lists: matched,
-- short, over, or an item that was never on the transfer. What arrived is
-- added to the store; any difference is recorded and pushed to admin, and
-- an admin decides what happened to it (written off, back to the
-- warehouse, found later, ...). Nothing is silently lost or invented.
--
-- stock_transfer_lines keys lines by the scanned code (like receipts), and
-- copies sku/productName at the time so a transfer stays readable after a
-- product is renamed. qtySent is fixed once sent; receivedDraftQty is the
-- store's scan in progress; qtyReceived is fixed at confirmation.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0065_stock_transfers.sql

CREATE TABLE `stock_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(24) NOT NULL,
	`fromBranchId` int NOT NULL,
	`toBranchId` int NOT NULL,
	`status` enum('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
	`discrepancyStatus` enum('none','open','resolved') NOT NULL DEFAULT 'none',
	`note` varchar(500),
	`createdByUserId` int,
	`sentByUserId` int,
	`sentAt` timestamp NULL,
	`receivedByUserId` int,
	`receivedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_transfers_code_unique` UNIQUE(`code`)
);
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_fromBranchId_branches_id_fk` FOREIGN KEY (`fromBranchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_toBranchId_branches_id_fk` FOREIGN KEY (`toBranchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_sentByUserId_users_id_fk` FOREIGN KEY (`sentByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_receivedByUserId_users_id_fk` FOREIGN KEY (`receivedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
CREATE INDEX `stock_transfers_to_status_idx` ON `stock_transfers` (`toBranchId`,`status`);
CREATE INDEX `stock_transfers_from_status_idx` ON `stock_transfers` (`fromBranchId`,`status`);

CREATE TABLE `stock_transfer_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transferId` int NOT NULL,
	`variantId` int,
	`scannedCode` varchar(80) NOT NULL,
	`sku` varchar(100),
	`productName` varchar(255),
	`qtySent` int NOT NULL DEFAULT 0,
	`receivedDraftQty` int,
	`qtyReceived` int,
	`resolution` enum('write_off','returned_to_source','found_later','deducted_from_source','accepted_over'),
	`resolutionNote` varchar(300),
	CONSTRAINT `stock_transfer_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_transfer_lines_unique` UNIQUE(`transferId`,`scannedCode`)
);
ALTER TABLE `stock_transfer_lines` ADD CONSTRAINT `stock_transfer_lines_transferId_stock_transfers_id_fk` FOREIGN KEY (`transferId`) REFERENCES `stock_transfers`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_transfer_lines` ADD CONSTRAINT `stock_transfer_lines_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE set null ON UPDATE no action;
