-- 2026-09-11, Phase 2 of the notifications + warehouse plan: a stock
-- movement ledger.
--
-- Until now branch_stock only ever held the CURRENT number: a checkout, a
-- cancellation, a POS sale or an admin typing a new count all overwrote or
-- adjusted it in place, leaving no record of what moved, why, or who did
-- it. Receiving goods, warehouse->store transfers and stocktakes (the next
-- phases) are meaningless without that history.
--
-- stock_movements is append-only: one row per change to one branch's shelf
-- of one variant, written in the SAME transaction as the branch_stock
-- change (server/stockLedger.ts). `delta` is signed; `balanceAfter` is the
-- shelf count right after the change, so a row can be read on its own.
-- `sku` is copied at the time, so history stays readable after a rename.
--
-- ON DELETE CASCADE on branch and variant, deliberately: a movement has no
-- meaning without the shelf it moved on, and it matches branch_stock's own
-- cascade. (The app refuses to delete a branch that has stock or history --
-- see deleteBranch -- so in practice this only fires for test fixtures.)
--
-- Opening balances: one 'opening' row per non-zero branch_stock row, so the
-- ledger sums to the live balances from day one. Anything that changes
-- branch_stock without writing a movement (the other laptop running older
-- code, a manual SQL edit) shows up as drift on the admin System Health card
-- and is re-based by scripts/stock-ledger-rebaseline.ts.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0063_stock_movements_ledger.sql

CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`variantId` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`type` enum('opening','sale_online','sale_pos','order_restock','refund_restock','admin_set','product_form_set','variant_seed','receipt','transfer_out','transfer_in','transfer_return','transfer_writeoff','count_adjust','rebaseline') NOT NULL,
	`delta` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`refType` varchar(20),
	`refId` int,
	`actorUserId` int,
	`note` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

CREATE INDEX `stock_movements_branch_variant_idx` ON `stock_movements` (`branchId`,`variantId`,`id`);
CREATE INDEX `stock_movements_variant_idx` ON `stock_movements` (`variantId`,`id`);
CREATE INDEX `stock_movements_ref_idx` ON `stock_movements` (`refType`,`refId`);
CREATE INDEX `stock_movements_created_idx` ON `stock_movements` (`createdAt`);

INSERT INTO `stock_movements` (`branchId`, `variantId`, `sku`, `type`, `delta`, `balanceAfter`, `refType`, `note`)
SELECT bs.`branchId`, bs.`variantId`, pv.`sku`, 'opening', bs.`stockQuantity`, bs.`stockQuantity`, 'manual', 'Эхний үлдэгдэл (ledger эхэлсэн, migration 0063)'
FROM `branch_stock` bs
JOIN `product_variants` pv ON pv.`id` = bs.`variantId`
WHERE bs.`stockQuantity` <> 0;
