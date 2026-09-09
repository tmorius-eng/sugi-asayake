-- Audit 2026-09-09 (R1): per-customer redemption cap for discount codes.
--
-- `maxUses` is a GLOBAL budget for the code. On its own it let one shopper
-- redeem a percent code on every single order until the whole budget was
-- exhausted -- nothing tied a redemption to WHO redeemed it. NULL keeps
-- today's behaviour (unlimited per customer) for every existing code; N means
-- each customer -- matched by account id, or by phone number for guests --
-- may use the code on at most N non-cancelled orders. Enforced in
-- validateDiscountCode (server/db.ts) at both preview and order time.
ALTER TABLE `discount_codes` ADD COLUMN `maxUsesPerCustomer` int NULL;
