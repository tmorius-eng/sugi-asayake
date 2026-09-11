-- 2026-09-11, Phase 3 of the notifications + warehouse plan: a warehouse
-- location, staff tied to a branch, receiving goods by barcode scan, and
-- stocktakes. Replaces the handwritten A4 list a store consultant used to
-- photograph into the work group chat whenever goods arrived.
--
-- 1. branches.kind -- 'warehouse' is a stock location that is NOT a store:
--    never offered for store pickup, never listed on the storefront.
--    Existing rows default to 'store', so nothing changes today.
--
-- 2. branches.countsTowardOnlineStock -- whether this location's shelf is
--    part of the stock the website sells. The stores ring their sales up in
--    Smart POS, not here (Tom, 2026-09-11), so until that is synced a store's
--    count in this system only ever goes UP (receipts, transfers) and would
--    make the site sell goods that are already gone. The plan is to switch
--    this off for the stores at cutover, leaving online stock = warehouse
--    stock. Default TRUE, so behaviour is unchanged until someone flips it.
--
-- 3. branches.lowStockThreshold -- per-location low-stock alert level (used
--    by Phase 5). NULL = no alerts for that location.
--
-- 4. users.branchId -- which location a staff member works at. A store
--    consultant (role 'staff') can only receive or count at their own branch.
--
-- 5. stock_receipts / _lines -- goods arriving from a supplier (or anywhere
--    else that is not one of our own transfers). Lines are saved while the
--    staff member scans (absolute counts, so a retried save is harmless);
--    nothing touches stock until the receipt is POSTED.
--    `scannedCode` is what the scanner actually read; `variantId` is NULL for
--    a code the catalogue does not know yet, which blocks posting until it
--    is resolved or deliberately skipped.
--
-- 6. stock_counts / _lines -- stocktakes, including the opening count that
--    establishes the warehouse's real balance. The adjustment per line is
--    counted - systemQtyAtFirstScan (the system count at the moment that
--    line was FIRST scanned), so sales that happen during a long count are
--    not wiped out. Staff submit; only warehouse/admin post. A 'full' count
--    also zeroes every item with stock at that location that nobody
--    scanned (how the placeholder 18,725 at branch 1 gets corrected); a
--    'partial' count only touches the lines it has.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0064_warehouse_receiving_counts.sql

ALTER TABLE `branches` ADD `kind` enum('store','warehouse') NOT NULL DEFAULT 'store';
ALTER TABLE `branches` ADD `countsTowardOnlineStock` boolean NOT NULL DEFAULT true;
ALTER TABLE `branches` ADD `lowStockThreshold` int;

ALTER TABLE `users` ADD `branchId` int;
ALTER TABLE `users` ADD CONSTRAINT `users_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;

CREATE TABLE `stock_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(24) NOT NULL,
	`branchId` int NOT NULL,
	`supplierName` varchar(160),
	`supplierInvoiceNo` varchar(80),
	`invoicePhotoUrl` varchar(500),
	`status` enum('draft','posted','cancelled') NOT NULL DEFAULT 'draft',
	`note` varchar(500),
	`createdByUserId` int,
	`postedByUserId` int,
	`postedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_receipts_code_unique` UNIQUE(`code`)
);
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_postedByUserId_users_id_fk` FOREIGN KEY (`postedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
CREATE INDEX `stock_receipts_branch_status_idx` ON `stock_receipts` (`branchId`,`status`);

CREATE TABLE `stock_receipt_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`variantId` int,
	`scannedCode` varchar(80) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `stock_receipt_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_receipt_lines_unique` UNIQUE(`receiptId`,`scannedCode`)
);
ALTER TABLE `stock_receipt_lines` ADD CONSTRAINT `stock_receipt_lines_receiptId_stock_receipts_id_fk` FOREIGN KEY (`receiptId`) REFERENCES `stock_receipts`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_receipt_lines` ADD CONSTRAINT `stock_receipt_lines_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE set null ON UPDATE no action;

CREATE TABLE `stock_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(24) NOT NULL,
	`branchId` int NOT NULL,
	`isOpening` boolean NOT NULL DEFAULT false,
	`scope` enum('partial','full') NOT NULL DEFAULT 'partial',
	`status` enum('draft','submitted','posted','cancelled') NOT NULL DEFAULT 'draft',
	`note` varchar(500),
	`createdByUserId` int,
	`submittedAt` timestamp NULL,
	`postedByUserId` int,
	`postedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_counts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_counts_code_unique` UNIQUE(`code`)
);
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_postedByUserId_users_id_fk` FOREIGN KEY (`postedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
CREATE INDEX `stock_counts_branch_status_idx` ON `stock_counts` (`branchId`,`status`);

CREATE TABLE `stock_count_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countId` int NOT NULL,
	`variantId` int,
	`scannedCode` varchar(80) NOT NULL,
	`countedQty` int NOT NULL,
	`systemQtyAtFirstScan` int,
	`postedDelta` int,
	CONSTRAINT `stock_count_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_count_lines_unique` UNIQUE(`countId`,`scannedCode`)
);
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_countId_stock_counts_id_fk` FOREIGN KEY (`countId`) REFERENCES `stock_counts`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE set null ON UPDATE no action;
