-- 2026-09-11, Phase 6 of the notifications + warehouse plan: the seam for
-- syncing with the shop's POS vendor (Smart Software) once their inventory /
-- loyalty / management APIs are documented. Nothing here calls the vendor;
-- it is the storage the real adapter will need, so that adding it later is
-- "write one adapter file", not another schema change.
--
-- 1. external_refs -- our id <-> the vendor's id, per entity type. Products
--    need no row: the 13-digit JAN barcode (products.sku / variants.sku) is
--    already the shared key. Branches do (the vendor's store code), and so do
--    imported sales (so a sale pulled twice is recorded once). Unique both
--    ways, so one vendor id can never map to two of ours or vice versa.
--
-- 2. integration_sync_state -- one row per (provider, stream): the cursor
--    (last pushed movement id / last pulled sale token), when it last ran,
--    when it last succeeded, and the last error, for the admin status card.
--
-- 3. stock_movements.type gains 'sale_pos_external' -- a sale rung up in the
--    vendor's POS and pulled in. Tagged refType 'external' so it is never
--    pushed back to the vendor it came from.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0066_external_sync.sql

CREATE TABLE `external_refs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`entityType` enum('branch','variant','user','sale') NOT NULL,
	`entityId` int NOT NULL,
	`externalId` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_refs_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_refs_ours_unique` UNIQUE(`provider`,`entityType`,`entityId`),
	CONSTRAINT `external_refs_theirs_unique` UNIQUE(`provider`,`entityType`,`externalId`)
);

CREATE TABLE `integration_sync_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`stream` varchar(40) NOT NULL,
	`cursor` varchar(200),
	`lastRunAt` timestamp NULL,
	`lastOkAt` timestamp NULL,
	`lastError` varchar(500),
	CONSTRAINT `integration_sync_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_sync_state_unique` UNIQUE(`provider`,`stream`)
);

ALTER TABLE `stock_movements` MODIFY `type` enum('opening','sale_online','sale_pos','order_restock','refund_restock','admin_set','product_form_set','variant_seed','receipt','transfer_out','transfer_in','transfer_return','transfer_writeoff','count_adjust','rebaseline','sale_pos_external') NOT NULL;
