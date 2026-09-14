-- 2026-09-14: нээлттэй ажлын байрны зар (/careers).
--
-- Хуучин asayake.mn (Zochil)-д "Ажлын зар" хэсэг байсан (одоогоор зартай мөр
-- байхгүй). Шинэ сайтад ажлын байрыг кодонд бичихгүй, /admin -> Баримт бичиг
-- хэсгээс нэмж, засаж, нуудаг мөр болгов. Зар байхгүй үед /careers хуудас
-- site_documents-ийн "careers" бичвэрээ л харуулна (хоосон хуудас гарахгүй).
--
-- HeatWave дээр ажиллуулах: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0081_job_postings.sql

CREATE TABLE `job_postings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(160) NOT NULL,
  -- Чөлөөтэй бичих талбарууд: "Бүтэн цаг", "Улаанбаатар", "1,500,000₮-с" гэх мэт.
  -- Тогтмол жагсаалт (enum) болговол шинэ төрөл нэмэх бүрт deploy шаардана.
  `employmentType` varchar(60) NOT NULL DEFAULT '',
  `location` varchar(120) NOT NULL DEFAULT '',
  `salaryRange` varchar(80) NOT NULL DEFAULT '',
  `description` text,
  -- Аль нэг нь (эсвэл хоёул) байж болно: имэйлээр анкет авах, эсвэл гадаад
  -- маягт руу заах. Хоосон бол дэлгүүрийн ерөнхий имэйл рүү бичнэ.
  `applyEmail` varchar(320),
  `applyUrl` varchar(300),
  `isPublished` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `job_postings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `job_postings_published_idx` ON `job_postings` (`isPublished`,`sortOrder`);
--> statement-breakpoint
ALTER TABLE `job_postings` ADD CONSTRAINT `job_postings_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
