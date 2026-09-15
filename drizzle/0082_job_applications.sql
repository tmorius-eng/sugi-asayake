-- 2026-09-14: /careers-аас ирсэн анкетууд.
--
-- Tom: "Ирүүлсэн анкет хаана яаж хадгалагдах вэ, админ хэн CV илгээснийг яаж
-- харах вэ — шийд." Өмнө нь "Өргөдөл илгээх" товч зөвхөн mailto: холбоос байсан
-- тул юу ч бүртгэгдэхгүй, хэн илгээснийг мэдэх аргагүй байв. Одоо анкет бүр
-- энэ хүснэгтэд, CV файл нь R2 дээр `applications/<санамсаргүй id>/…` түлхүүрээр
-- (олон нийтийн /cdn/ замаар хэзээ ч зурагдахгүй, админ гарын үсэгтэй түр
-- URL-ээр нээнэ), админд push мэдэгдэл (нэр, утасгүй) очно.
--
-- positionTitle нь SNAPSHOT: зар устсан ч анкет "аль ажлын байрт" гэдгээ мэднэ.
--
-- HeatWave дээр ажиллуулах: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0082_job_applications.sql

CREATE TABLE `job_applications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobPostingId` int NULL,
  `positionTitle` varchar(160) NOT NULL,
  `fullName` varchar(120) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(320) NULL,
  `message` text NULL,
  `cvKey` varchar(300) NULL,
  `cvFileName` varchar(200) NULL,
  `cvSizeBytes` int NULL,
  `status` enum('new','reviewed','contacted','rejected') NOT NULL DEFAULT 'new',
  `adminNote` text NULL,
  `ipAddress` varchar(64) NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `job_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `job_applications_status_idx` ON `job_applications` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `job_applications_posting_idx` ON `job_applications` (`jobPostingId`);
--> statement-breakpoint
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_jobPostingId_job_postings_id_fk` FOREIGN KEY (`jobPostingId`) REFERENCES `job_postings`(`id`) ON DELETE set null ON UPDATE no action;
