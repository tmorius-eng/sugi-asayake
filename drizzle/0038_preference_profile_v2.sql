-- Preference Profile v2 (2026-09-01): expanded personal-info + Beauty/Home
-- preference quiz, feeding recommendation engine v2 (getRecommendedProducts
-- in server/db.ts). See the schema.ts doc-comments on `users` and
-- `products` for the full rationale. All columns nullable -- never asked
-- at signup, always optional.
ALTER TABLE `users` ADD COLUMN `gender` enum('male','female','other');
ALTER TABLE `users` ADD COLUMN `primaryDistrict` enum('baganuur','bagakhangai','bayangol','bayanzurkh','nalaikh','songinokhairkhan','sukhbaatar','khan_uul','chingeltei','other');
ALTER TABLE `users` ADD COLUMN `skinRoutineComplexity` enum('minimal','moderate','extensive');
ALTER TABLE `users` ADD COLUMN `hairType` enum('dry','oily','normal','damaged','color_treated');
ALTER TABLE `users` ADD COLUMN `hairConcerns` varchar(300);
ALTER TABLE `users` ADD COLUMN `fragrancePreference` enum('unscented','light','floral','citrus');
ALTER TABLE `users` ADD COLUMN `wellnessInterests` varchar(300);
ALTER TABLE `users` ADD COLUMN `hasYoungChildren` boolean;
ALTER TABLE `products` ADD COLUMN `hairType` enum('dry','oily','normal','damaged','color_treated');
ALTER TABLE `products` ADD COLUMN `hairConcerns` varchar(300);
ALTER TABLE `products` ADD COLUMN `fragrancePreference` enum('unscented','light','floral','citrus');
ALTER TABLE `products` ADD COLUMN `wellnessInterests` varchar(300);
