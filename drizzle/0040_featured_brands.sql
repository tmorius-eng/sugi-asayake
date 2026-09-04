-- NEWVISION.md §5 "Топ брэндүүд" -- approved 2026-09-02, this migration is
-- its one real schema change (everything else in that plan reuses existing
-- tables/site_text/site_media slots). Same shape as product_categories.
CREATE TABLE `featured_brands` (
  `id` int AUTO_INCREMENT NOT NULL,
  `brandName` varchar(120) NOT NULL,
  `tagline` text,
  `photoUrl` text,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `featured_brands_id` PRIMARY KEY(`id`)
);
