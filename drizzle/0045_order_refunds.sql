-- 2026-09-08 (Admin overhaul, Phase E): the refund/credit flow orders.ts's
-- own returnedAt comment flagged as "separate, unscoped work" -- now scoped.
-- Single-column addition on orders itself (not a separate refunds table),
-- matching the existing returnedAt precedent: one terminal refund event per
-- order, not multi-tranche partial refunds. All nullable/additive -- no
-- existing row is affected. See server/db.ts's refundOrder for the guards
-- (must be status="returned", must not already be paymentStatus="refunded",
-- amount capped at totalMnt) and server/_core/trpc.ts's financeProcedure for
-- who's allowed to call it.
ALTER TABLE `orders` ADD COLUMN `refundAmountMnt` int NULL;
ALTER TABLE `orders` ADD COLUMN `refundedAt` timestamp NULL;
ALTER TABLE `orders` ADD COLUMN `refundNote` varchar(300) NULL;
