-- Tier G/I of the admin analytics dashboard: order returns, plus fixing a
-- pre-existing gap where a cash_on_delivery/bank_transfer/card order never
-- became paymentStatus="paid" anywhere in the codebase (only the QPay
-- webhook ever wrote "paid" -- see the schema comments on orders.status/
-- returnedAt and updateAdminOrder in server/db.ts). MySQL requires
-- restating the full enum list on MODIFY COLUMN, not just the new value.
ALTER TABLE `orders` MODIFY COLUMN `status` enum('pending','confirmed','packed','out_for_delivery','completed','cancelled','returned') NOT NULL DEFAULT 'pending';

ALTER TABLE `orders` ADD COLUMN `returnedAt` timestamp;
