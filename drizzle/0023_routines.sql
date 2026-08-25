-- PREMIUM-FEATURES.md TIER 4: Routine Builder & Bundles.
CREATE TABLE `routines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`description` text,
	`discountPercent` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routines_id` PRIMARY KEY(`id`),
	CONSTRAINT `routines_slug_unique` UNIQUE(`slug`)
);

CREATE TABLE `routine_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routineId` int NOT NULL,
	`productId` int NOT NULL,
	`stepNumber` int NOT NULL,
	`stepLabel` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routine_steps_id` PRIMARY KEY(`id`)
);

ALTER TABLE `routine_steps` ADD CONSTRAINT `routine_steps_routineId_routines_id_fk` FOREIGN KEY (`routineId`) REFERENCES `routines`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `routine_steps` ADD CONSTRAINT `routine_steps_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX `routine_steps_routine_step_idx` ON `routine_steps` (`routineId`,`stepNumber`);
CREATE UNIQUE INDEX `routine_steps_routine_product_idx` ON `routine_steps` (`routineId`,`productId`);
CREATE INDEX `routine_steps_product_idx` ON `routine_steps` (`productId`);

ALTER TABLE `orders` ADD `discountMnt` int NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD `appliedRoutineId` int;
ALTER TABLE `orders` ADD CONSTRAINT `orders_appliedRoutineId_routines_id_fk` FOREIGN KEY (`appliedRoutineId`) REFERENCES `routines`(`id`) ON DELETE set null ON UPDATE no action;
