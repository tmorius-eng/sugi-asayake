-- PREMIUM-FEATURES.md TIER 1: mirrors users.skinType/skinConcerns/
-- interiorStyle onto products, so "recommended for you" is just an
-- intersection of a shopper's saved preferences against these columns.
ALTER TABLE `products` ADD `skinType` enum('dry','oily','combination','sensitive','normal');
ALTER TABLE `products` ADD `skinConcerns` varchar(300);
ALTER TABLE `products` ADD `interiorStyle` varchar(60);
