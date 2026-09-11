-- 2026-09-11, phone push notifications (ntfy) -- Phase 1 of the
-- notifications + warehouse plan.
--
-- 1. integration_configs.provider gains 'ntfy' (the push-notification
--    service, see server/_core/ntfy.ts) and 'smartsoftware' (a placeholder
--    for the shop's POS vendor, whose API has no public documentation yet --
--    see EBARIMT.md). Widening an enum is safe for code that predates it:
--    getAdminIntegrations only ever lists the providers it knows about, so
--    the other laptop's older build keeps working against this schema.
--
-- 2. notification_outbox -- every push is written here first, inside the same
--    transaction as the event that caused it (an order, a payment, a refund),
--    and delivered afterwards by server/notifications.ts. Why a table instead
--    of calling ntfy straight from the checkout code:
--      * a rolled-back checkout must not have announced an order;
--      * a slow or unreachable ntfy.sh must never slow down or fail a checkout;
--      * both laptops share this database, so a guarded claim
--        (UPDATE ... WHERE status='pending') is what stops two machines from
--        sending the same message twice;
--      * UNIQUE (groupKey, dedupeKey) turns QPay's at-least-once callbacks
--        into exactly one "paid" notification per order.
--    A NULL dedupeKey is allowed (and never collides) for events that can
--    legitimately repeat.
--
-- 3. users.lastSeenNotificationId -- the admin top bar's bell lists the same
--    notifications (the outbox rows for the user's group); rows with a
--    higher id are "unread". On the account, not in the browser, so the shop
--    PC and the owner's phone agree. Nullable: older code never reads it.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0062_integrations_ntfy_notification_outbox.sql

ALTER TABLE `integration_configs` MODIFY `provider` enum('ebarimt','storepay','card_golomt','courier_ebuuhia','ntfy','smartsoftware') NOT NULL;

CREATE TABLE `notification_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(60) NOT NULL,
	`groupKey` varchar(40) NOT NULL,
	`dedupeKey` varchar(160),
	`title` varchar(200) NOT NULL,
	`message` text NOT NULL,
	`priority` tinyint NOT NULL DEFAULT 3,
	`tagsJson` varchar(300),
	`clickPath` varchar(300),
	`status` enum('pending','sending','sent','failed','suppressed','expired') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` varchar(300),
	`claimedAt` timestamp NULL,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_outbox_dedupe_unique` UNIQUE(`groupKey`,`dedupeKey`)
);

CREATE INDEX `notification_outbox_status_next_idx` ON `notification_outbox` (`status`,`nextAttemptAt`);

-- The bell's feed reads "latest rows for my group".
CREATE INDEX `notification_outbox_group_id_idx` ON `notification_outbox` (`groupKey`,`id`);

ALTER TABLE `users` ADD `lastSeenNotificationId` int;
