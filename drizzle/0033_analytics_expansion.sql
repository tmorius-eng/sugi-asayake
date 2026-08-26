-- Tier B/C of the admin analytics dashboard: real profit/margin (once an
-- admin fills in product cost), and traffic-source/device snapshots
-- captured automatically going forward (see the schema comments on
-- products.costMnt and orders.trafficSource/deviceType).
ALTER TABLE `products` ADD COLUMN `costMnt` int;

ALTER TABLE `orders` ADD COLUMN `trafficSource` varchar(200);

ALTER TABLE `orders` ADD COLUMN `deviceType` enum('mobile','tablet','desktop','unknown');
