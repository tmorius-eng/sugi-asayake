CREATE TABLE `scheduled_job_runs` (
	`jobName` varchar(80) NOT NULL,
	`lastRunAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduled_job_runs_jobName` PRIMARY KEY(`jobName`)
);
