-- 2026-09-20: хайлтын лог. Өмнө нь catalog.search юу хайгдсаныг хадгалдаггүй
-- тул "юу хайгаад олдоогүй вэ" гэдгийг хэн ч мэдэхгүй байв (MERCHANDISING-PLAN
-- §2.2). Admin → Хайлт → Статистик нь энд суурилж, 0 үр дүнтэй query-г шууд
-- синоним болгох гогцоог өгнө.
--
-- ⚠️ PII байхгүй: `query`/`normalised` нь хайлтын текст, `visitorHash` нь
-- зочны session cookie-ийн keyed sha256 (IP, түүхий token хэзээ ч биш),
-- `userId` нэвтэрсэн бол л. 90 хоногийн дараа data-retention job устгана.
CREATE TABLE `search_queries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `query` varchar(120) NOT NULL,
  `normalised` varchar(120) NOT NULL,
  `resultCount` int NOT NULL,
  `mode` enum('strict','broad','barcode','none') NOT NULL,
  `source` enum('shop','header') NOT NULL,
  `userId` int,
  `visitorHash` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `search_queries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `search_queries_created_idx` ON `search_queries` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `search_queries_results_idx` ON `search_queries` (`resultCount`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `search_queries_normalised_idx` ON `search_queries` (`normalised`);
--> statement-breakpoint
ALTER TABLE `search_queries` ADD CONSTRAINT `search_queries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
