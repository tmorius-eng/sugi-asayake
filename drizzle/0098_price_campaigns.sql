-- 2026-09-29: бүх барааны нийтийн хямдрал (docs/SITEWIDE-SALE-PLAN.md).
-- DB-ийн барааны үнэ ХЭЗЭЭ Ч өөрчлөгдөхгүй — сервер үнэ уншдаг газар бүрт
-- идэвхтэй хямдралыг хэрэглэнэ (shared/price-campaign.ts).
CREATE TABLE `price_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(120) NOT NULL,
  `percentOff` int NOT NULL,
  `startsAt` timestamp NOT NULL,
  `endsAt` timestamp NOT NULL,
  `stoppedAt` timestamp NULL,
  `createdByUserId` int NULL,
  `updatedByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `price_campaigns_id` PRIMARY KEY(`id`),
  CONSTRAINT `price_campaigns_created_by_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `price_campaigns_updated_by_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `price_campaigns_window_idx` ON `price_campaigns` (`startsAt`, `endsAt`);
--> statement-breakpoint
-- Тайлан: ямар хямдралаар зарагдсан, анхны үнэ хэд байсан (хөнгөлсөн дүн = Σ (list − unit) × тоо).
ALTER TABLE `orders` ADD COLUMN `priceCampaignId` int NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_price_campaign_fk` FOREIGN KEY (`priceCampaignId`) REFERENCES `price_campaigns`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `listPriceMnt` int NULL;
