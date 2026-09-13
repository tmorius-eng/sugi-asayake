-- 2026-09-13: threaded review conversations and likes (Tom: the comment UI
-- should look like a comment thread -- avatar, bubble, Like / Reply / time,
-- replies indented under the review -- and be manageable from /admin).
--
-- Replies live in their OWN table rather than as self-referencing rows in
-- product_reviews: that table has a unique (userId, productId) constraint
-- ("one review per buyer per product") and a NOT NULL rating, both of which
-- a reply must not have. Keeping reviews as they are also keeps every
-- existing query (ratings, bestsellers, featured reviews) untouched.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0070_review_replies_likes.sql

CREATE TABLE `product_review_replies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reviewId` int NOT NULL,
  `userId` int NOT NULL,
  `body` text NOT NULL,
  `isApproved` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `product_review_replies_id` PRIMARY KEY(`id`),
  CONSTRAINT `product_review_replies_reviewId_fk` FOREIGN KEY (`reviewId`) REFERENCES `product_reviews`(`id`) ON DELETE CASCADE,
  CONSTRAINT `product_review_replies_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `product_review_replies_review_idx` ON `product_review_replies` (`reviewId`);
--> statement-breakpoint
CREATE TABLE `product_review_likes` (
  `reviewId` int NOT NULL,
  `userId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `product_review_likes_pk` PRIMARY KEY(`reviewId`, `userId`),
  CONSTRAINT `product_review_likes_reviewId_fk` FOREIGN KEY (`reviewId`) REFERENCES `product_reviews`(`id`) ON DELETE CASCADE,
  CONSTRAINT `product_review_likes_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
