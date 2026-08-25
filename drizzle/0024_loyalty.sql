-- PREMIUM-FEATURES.md TIER 5: cumulative-spend loyalty tiers (native-only,
-- no Smart POS API integration per Tom, 2026-08-25).
ALTER TABLE `users` ADD `loyaltyManualAdjustmentMnt` int NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD `loyaltyDiscountMnt` int NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD `appliedLoyaltyTierName` varchar(40);
