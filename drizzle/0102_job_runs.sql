-- 2026-10-05: хуваарьт ажлын (scheduler job) ажиллалт бүрийн түүх.
--
-- scheduled_job_runs нь job бүрт НЭГ мөр (lastRunAt, claimedAt) л хадгалдаг;
-- ажиллалт унасан эсэх, хэдэн секунд болсон, ямар алдаа гарсан, аль хост
-- (хоёр лаптоп + prod нэг DB) ажиллуулсан нь зөвхөн console-д үлддэг байв.
-- Энэ хүснэгтэд server/_core/scheduler.ts ажиллалт бүрийн эхлэл/төгсгөлийг
-- бичнэ; data-retention job 30 хоногоос хуучныг устгана.
CREATE TABLE `job_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobName` varchar(80) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `finishedAt` timestamp,
  `ok` boolean,
  `error` varchar(500),
  `affectedCount` int,
  `claimedBy` varchar(80),
  CONSTRAINT `job_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_started_idx` ON `job_runs` (`jobName`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `job_runs_started_idx` ON `job_runs` (`startedAt`);
