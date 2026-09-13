import { getScheduledJobLastRun, markScheduledJobRun } from "../db";

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase D): the ONLY
 * scheduled/background-job infrastructure in this app. A single
 * `setInterval` tick checks every registered job's own `intervalMs` against
 * `scheduled_job_runs.lastRunAt` (drizzle/schema.ts) -- no cron-string
 * parsing, no new dependency, no separate worker process. Matches this
 * project's own single-process reality, the same tradeoff already accepted
 * for its in-memory rate-limit buckets and the SQL query log's ring buffer.
 *
 * Deliberately checks due-ness, then runs, THEN marks the run time (not
 * before) -- if a job throws, its lastRunAt is left untouched, so the very
 * next tick retries it rather than waiting a full interval for a transient
 * failure (a Brevo hiccup, a momentary Aiven blip) to be tried again. The
 * `runningJobNames` guard exists only so a job slower than the tick period
 * can't be started a second time concurrently with itself -- not something
 * the plan's own real job durations (a handful of DB queries + emails) are
 * expected to hit in practice, just cheap insurance.
 */
export type ScheduledJob = { name: string; intervalMs: number; run: () => Promise<void> };

const jobs: ScheduledJob[] = [];
const runningJobNames = new Set<string>();
let tickHandle: ReturnType<typeof setInterval> | null = null;

export function registerJob(job: ScheduledJob) {
  jobs.push(job);
}

export async function runDueJobsOnce(): Promise<void> {
  for (const job of jobs) {
    if (runningJobNames.has(job.name)) continue;
    let lastRunAt: Date | null;
    try {
      lastRunAt = await getScheduledJobLastRun(job.name);
    } catch (error) {
      console.error(`[Scheduler] Failed to read last-run time for "${job.name}":`, error);
      continue;
    }
    const due = !lastRunAt || Date.now() - lastRunAt.getTime() >= job.intervalMs;
    if (!due) continue;

    runningJobNames.add(job.name);
    try {
      await job.run();
      await markScheduledJobRun(job.name);
    } catch (error) {
      console.error(`[Scheduler] Job "${job.name}" failed (will retry next tick):`, error);
    } finally {
      runningJobNames.delete(job.name);
    }
  }
}

// 15 minutes -- frequent enough that an hourly job (Phase E) or a ~daily
// job (Phase F) never drifts noticeably late, infrequent enough that this
// never meaningfully competes with real request traffic for DB connections.
const TICK_INTERVAL_MS = 15 * 60 * 1000;

/** Called once from server/_core/index.ts's startServer() -- never touched
 *  by tests, since every *.integration.test.ts uses appRouter.createCaller()
 *  directly and never boots the real HTTP server. */
export function startScheduler() {
  if (tickHandle) return; // idempotent, in case something calls this twice
  tickHandle = setInterval(() => { void runDueJobsOnce(); }, TICK_INTERVAL_MS);
  // Staggered after the notification dispatcher (see startNotificationDispatcher):
  // the boot burst of connections is what timed out on the small HeatWave.
  const bootDelay = process.env.NODE_ENV === "production" ? 15_000 : 0;
  if (bootDelay) { const first = setTimeout(() => { void runDueJobsOnce(); }, bootDelay); first.unref?.(); return; }
  // Also run once shortly after startup, so a job that became overdue while
  // the server was down doesn't sit unnoticed for up to a full tick period.
  void runDueJobsOnce();
}
