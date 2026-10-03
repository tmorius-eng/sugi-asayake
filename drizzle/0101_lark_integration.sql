-- 2026-10-03, Lark (larksuite.com) — компанийн удирдлагын орчин (docs/LARK.md).
-- Сайтын DB нь эх сурвалж, Lark нь нэг чиглэлийн толь: захиалга/нөөц/тооллогын
-- мэдэгдэл Lark-ийн бүлэг чат руу карт болж очно, хожим Base хүснэгтүүд.
--
-- 1. integration_configs.provider-т 'lark' (жишиг 0062). Enum өргөсгөх нь
--    хуучин кодонд аюулгүй — getAdminIntegrations зөвхөн мэдэх провайдераа жагсаана.
--
-- 2. lark_chat_deliveries — notification_outbox-ийн ХОЁР ДАХЬ хэрэглэгч.
--    ntfy-ийн dispatcher outbox-ын `status` баганыг өөрчилдөг тул Lark түүнийг
--    хуваалцаж болохгүй: outbox мөр бүрт Lark-ийн хүргэлт тусдаа мөртэй.
--    UNIQUE(outboxId) + INSERT IGNORE = "энэ мөрийг би эзэмшлээ" атом цоож
--    (хоёр лаптоп + prod нэг DB). ON DELETE CASCADE: purgeNotificationOutbox
--    outbox-ыг цэвэрлэхэд эндхийн мөр ч хамт арилна.
--
-- 3. lark_records — сайтын мөр ↔ Lark Base-ийн record_id (Phase 3). external_refs
--    хангалтгүй: entityId нь int, entityType enum тогтмол, hash багана байхгүй.
--    contentHash: өөрчлөгдөөгүй мөрийг дахин илгээхгүй (API квот, automation run).
--
-- 4. notification_outbox(createdAt) индекс — Lark-ийн anti-join сүүлийн 120
--    минутыг уншина.
--
-- Ажиллуулах: эхлээд staging, дараа нь prod (кодоос ӨМНӨ):
--   pnpm exec tsx scripts/db-apply-migration.ts drizzle/0101_lark_integration.sql --staging
--   pnpm exec tsx scripts/db-apply-migration.ts drizzle/0101_lark_integration.sql

ALTER TABLE `integration_configs` MODIFY `provider` enum('ebarimt','storepay','card_golomt','courier_ebuuhia','ntfy','smartsoftware','lark') NOT NULL;
--> statement-breakpoint
CREATE TABLE `lark_chat_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`outboxId` int NOT NULL,
	`chatKey` varchar(40) NOT NULL,
	`status` enum('pending','sending','sent','failed','skipped','expired') NOT NULL DEFAULT 'sending',
	`attempts` int NOT NULL DEFAULT 1,
	`lastError` varchar(300),
	`claimedAt` timestamp NULL DEFAULT (now()),
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp NULL,
	`larkMessageId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lark_chat_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `lark_chat_deliveries_outbox_unique` UNIQUE(`outboxId`),
	CONSTRAINT `lark_chat_deliveries_outboxId_notification_outbox_id_fk` FOREIGN KEY (`outboxId`) REFERENCES `notification_outbox`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `lark_chat_deliveries_status_next_idx` ON `lark_chat_deliveries` (`status`,`nextAttemptAt`);
--> statement-breakpoint
CREATE TABLE `lark_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableKey` varchar(40) NOT NULL,
	`entityKey` varchar(80) NOT NULL,
	`objectId` varchar(64) NOT NULL,
	`contentHash` char(40) NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lark_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `lark_records_entity_unique` UNIQUE(`tableKey`,`entityKey`),
	CONSTRAINT `lark_records_object_unique` UNIQUE(`tableKey`,`objectId`)
);
--> statement-breakpoint
CREATE INDEX `notification_outbox_created_idx` ON `notification_outbox` (`createdAt`);
