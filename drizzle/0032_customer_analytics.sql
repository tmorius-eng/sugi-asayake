-- Admin analytics dashboard (sales/district/demographics) foundation.
-- birthYear/occupation are optional, opt-in only (never asked at signup) --
-- see the schema comment on users.birthYear. district/deliveryDistrict are
-- structured Ulaanbaatar-дүүрэг fields alongside the existing free-text
-- address fields, purely so real district reporting doesn't depend on
-- guessing from prose -- see shared/districts.ts.
ALTER TABLE `users` ADD COLUMN `birthYear` int;

ALTER TABLE `users` ADD COLUMN `occupation` varchar(120);

ALTER TABLE `user_addresses` ADD COLUMN `district` enum('baganuur','bagakhangai','bayangol','bayanzurkh','nalaikh','songinokhairkhan','sukhbaatar','khan_uul','chingeltei','other');

ALTER TABLE `orders` ADD COLUMN `deliveryDistrict` enum('baganuur','bagakhangai','bayangol','bayanzurkh','nalaikh','songinokhairkhan','sukhbaatar','khan_uul','chingeltei','other') AFTER `deliveryAddress`;

CREATE INDEX `orders_delivery_district_idx` ON `orders` (`deliveryDistrict`);
