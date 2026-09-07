-- 2026-09-07: WordPress-classic-editor-parity admin Posts rebuild.
-- Run directly against Aiven via the mysql CLI (drizzle/meta isn't exported
-- in this project, per CLAUDE.md) -- strip every "--> statement-breakpoint"
-- line first, MySQL 8 does not understand it.

ALTER TABLE `posts`
  ADD COLUMN `deletedAt` timestamp NULL,
  ADD COLUMN `metaTitle` varchar(70) NULL,
  ADD COLUMN `metaDescription` varchar(160) NULL,
  ADD COLUMN `format` varchar(20) NOT NULL DEFAULT 'standard';
--> statement-breakpoint
CREATE INDEX `posts_deleted_idx` ON `posts` (`deletedAt`);
--> statement-breakpoint
CREATE TABLE `post_categories` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(80) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `post_categories_id` PRIMARY KEY(`id`),
  CONSTRAINT `post_categories_name_unique` UNIQUE(`name`),
  CONSTRAINT `post_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `post_category_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int NOT NULL,
  `categoryId` int NOT NULL,
  CONSTRAINT `post_category_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `post_category_links_unique` UNIQUE(`postId`,`categoryId`)
);
--> statement-breakpoint
CREATE INDEX `post_category_links_category_idx` ON `post_category_links` (`categoryId`);
--> statement-breakpoint
ALTER TABLE `post_category_links` ADD CONSTRAINT `post_category_links_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `post_category_links` ADD CONSTRAINT `post_category_links_categoryId_post_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `post_categories`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `post_tags` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(60) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `post_tags_id` PRIMARY KEY(`id`),
  CONSTRAINT `post_tags_name_unique` UNIQUE(`name`),
  CONSTRAINT `post_tags_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `post_tag_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int NOT NULL,
  `tagId` int NOT NULL,
  CONSTRAINT `post_tag_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `post_tag_links_unique` UNIQUE(`postId`,`tagId`)
);
--> statement-breakpoint
CREATE INDEX `post_tag_links_tag_idx` ON `post_tag_links` (`tagId`);
--> statement-breakpoint
ALTER TABLE `post_tag_links` ADD CONSTRAINT `post_tag_links_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `post_tag_links` ADD CONSTRAINT `post_tag_links_tagId_post_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `post_tags`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `media_library` (
  `id` int AUTO_INCREMENT NOT NULL,
  `key` varchar(500) NOT NULL,
  `url` varchar(500) NOT NULL,
  `fileName` varchar(200) NOT NULL,
  `contentType` varchar(50) NOT NULL,
  `sizeBytes` int NOT NULL,
  `uploadedByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `media_library_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `media_library_created_idx` ON `media_library` (`createdAt`);
--> statement-breakpoint
ALTER TABLE `media_library` ADD CONSTRAINT `media_library_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
