-- 2026-09-12 (forensic audit): an idempotency key for checkout.
--
-- The "Захиалга батлах" button disables itself while a request is in
-- flight, but that only covers one tab, one click. A shopper on a flaky
-- connection whose request timed out after the server had already committed
-- (mobile networks do this), a browser retry, or a second tab could place the
-- same basket twice -- two orders, stock decremented twice.
--
-- The browser now generates one random id per checkout attempt and sends it
-- with the order; the same id always resolves to the same order. Nullable so
-- every existing row, and any client that predates this, keeps working.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0069_order_client_request_id.sql

ALTER TABLE `orders` ADD COLUMN `clientRequestId` varchar(64) NULL;

ALTER TABLE `orders` ADD CONSTRAINT `orders_client_request_unique` UNIQUE(`clientRequestId`);
