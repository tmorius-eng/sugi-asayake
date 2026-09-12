-- 2026-09-12: StorePay (buy now, pay later) as a second online payment
-- provider next to QPay. Tom: all four branches already accept StorePay in
-- person, so the website should too.
--
-- Two enums widen; nothing existing changes meaning:
--   payment_attempts.provider -- one row per loan we ask StorePay to create,
--     exactly as QPay gets one row per invoice (the loan id goes in
--     providerInvoiceId, so the existing per-provider unique key and the
--     "look up the attempt a callback is about" query both keep working).
--   orders.paymentMethod -- 'storepay' joins qpay / bank_transfer / card /
--     cash_on_delivery / in_store.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0067_storepay.sql

ALTER TABLE `payment_attempts` MODIFY `provider` enum('qpay','storepay') NOT NULL;

ALTER TABLE `orders` MODIFY `paymentMethod` enum('qpay','storepay','bank_transfer','card','cash_on_delivery','in_store') NOT NULL;
