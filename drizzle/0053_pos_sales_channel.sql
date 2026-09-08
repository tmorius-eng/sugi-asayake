ALTER TABLE `orders` MODIFY COLUMN `paymentMethod` enum('qpay','bank_transfer','card','cash_on_delivery','in_store') NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `salesChannel` enum('online','in_store') NOT NULL DEFAULT 'online';
