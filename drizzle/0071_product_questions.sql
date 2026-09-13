-- 2026-09-13: product questions & answers ("does this suit dry skin?").
-- Anyone signed in may ask; answers come from staff or from customers who
-- bought the product (same rule as review replies). Text goes through the
-- same moderation layers as reviews before it is stored.
--
-- Run against HeatWave via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0071_product_questions.sql

CREATE TABLE `product_questions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productId` int NOT NULL,
  `userId` int NOT NULL,
  `body` text NOT NULL,
  `isApproved` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `product_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `product_questions_product_idx` ON `product_questions` (`productId`,`createdAt`);
--> statement-breakpoint
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `product_question_answers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `questionId` int NOT NULL,
  `userId` int NOT NULL,
  `body` text NOT NULL,
  `isApproved` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `product_question_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `product_question_answers_question_idx` ON `product_question_answers` (`questionId`);
--> statement-breakpoint
ALTER TABLE `product_question_answers` ADD CONSTRAINT `product_question_answers_questionId_fk` FOREIGN KEY (`questionId`) REFERENCES `product_questions`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `product_question_answers` ADD CONSTRAINT `product_question_answers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
