-- 2026-09-14: gift cards sold at checkout. A product is either a physical
-- item (shelf stock, delivery) or a gift card (digital: no stock decrement,
-- no delivery, codes issued into gift_cards the moment the order is paid,
-- keyed by gift_cards.purchaseOrderId). Every existing row is physical.
ALTER TABLE `products` ADD COLUMN `kind` ENUM('physical','gift_card') NOT NULL DEFAULT 'physical' AFTER `isPublished`;
