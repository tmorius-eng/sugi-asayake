ALTER TABLE `orders` ADD `fulfillingBranchId` int;
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_fulfillingBranchId_branches_id_fk` FOREIGN KEY (`fulfillingBranchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;
