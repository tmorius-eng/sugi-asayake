import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { scheduledJobRuns } from "../../drizzle/schema";
import { hostname } from "node:os";
import { finishJobRun, getDb, getScheduledJobLastRun, markScheduledJobRun, startJobRun } from "../db";

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
 * can't be started a second time concurrently with itself within ONE process.
 *
 * 2026-09-27: `runningJobNames` alone never protected against TWO processes
 * (two laptops + prod share one DB) both reading the same job as due at
 * roughly the same tick and both running it -- a vendor stock sync
 * double-applying its delta, a low-stock digest landing twice. `claimJob`
 * below adds a real DB-level claim (migration 0097's `scheduledJobRuns.
 * claimedAt`) on top of the in-process guard, which stays as cheap
 * insurance against the same job overlapping itself within one process.
 */
/** `run` нь сонголтоор `{ affectedCount }` буцаавал job_runs-д (0102) бичигдэж /admin → Процесс дээр харагдана. */
export type JobRunResult = { affectedCount?: number | null } | void;
export type ScheduledJob = { name: string; intervalMs: number; run: () => Promise<JobRunResult> };

const jobs: ScheduledJob[] = [];
const runningJobNames = new Set<string>();
let tickHandle: ReturnType<typeof setInterval> | null = null;

export function registerJob(job: ScheduledJob) {
  jobs.push(job);
}

/** Бүртгэгдсэн job-уудын нэр/интервал — /admin → Процесс дараагийн ажиллалтыг бодоход (2026-10-05). */
export function listRegisteredJobs(): ReadonlyArray<{ name: string; intervalMs: number }> {
  return jobs.map(job => ({ name: job.name, intervalMs: job.intervalMs }));
}

const JOB_RUNNER_ID = `${hostname()}#${process.pid}`;

// A crashed/killed process can leave a job claimed forever -- reclaim once
// the claim is older than the job's own interval (an interval shorter than
// that is not a hung run, it just hasn't ticked again yet) AND at least this
// floor, so a fast job (a few minutes) still gives a genuinely slow run room
// to finish before another process steals it.
const MIN_STALE_CLAIM_MS = 30 * 60 * 1000;

/**
 * Atomically claims `jobName` for this process: true if claimed (this
 * process may run it now), false if another process already holds a fresh
 * claim. Inserts the row on a job's very first-ever claim (INSERT IGNORE --
 * a duplicate-key race from a concurrent first claim is harmless, both just
 * fall through to the guarded UPDATE below) without touching `lastRunAt` on
 * an existing row, so due-ness semantics are unaffected by claiming.
 */
/** Migration 0097 хараахан ажиллаагүй DB (`claimedAt` багана алга) — claim-гүй хуучин горим. */
let claimColumnMissing = false;

async function claimJob(jobName: string, intervalMs: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  if (claimColumnMissing) return true;
  // `new Date(0)` биш: TIMESTAMP-ийн доод хилээс гадуур (UTC процесст 0000-00-00 болж
  // job хэзээ ч due болохгүй). "Нэг интервалын өмнө" = анхны ажиллалт шууд due.
  await db.execute(sql`INSERT IGNORE INTO scheduled_job_runs (jobName, lastRunAt) VALUES (${jobName}, ${new Date(Date.now() - intervalMs)})`);
  const staleBefore = new Date(Date.now() - Math.max(intervalMs, MIN_STALE_CLAIM_MS));
  const dueBefore = new Date(Date.now() - intervalMs);
  try {
    const claimed = await db.update(scheduledJobRuns)
      .set({ claimedAt: new Date() })
      .where(and(
        eq(scheduledJobRuns.jobName, jobName),
        or(isNull(scheduledJobRuns.claimedAt), lt(scheduledJobRuns.claimedAt, staleBefore)),
        // Өөр процесс яг сая дуусгаж lastRunAt-ыг шинэчилсэн бол дахин ажиллуулахгүй.
        or(isNull(scheduledJobRuns.lastRunAt), lte(scheduledJobRuns.lastRunAt, dueBefore)),
      ));
    return Number(claimed[0]?.affectedRows ?? 0) === 1;
  } catch (error) {
    const text = String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? "");
    if (/Unknown column 'claimedAt'|ER_BAD_FIELD_ERROR/.test(text)) {
      claimColumnMissing = true;
      console.warn("[Scheduler] scheduled_job_runs.claimedAt алга — migration 0097-г ажиллуулна уу. Түр claim-гүй (өмнөх) горимоор ажиллана.");
      return true;
    }
    throw error;
  }
}

/** Releases a held claim so the job is claimable again -- called whether the
 *  run succeeded or threw (only `lastRunAt` distinguishes the two). */
async function releaseJobClaim(jobName: string): Promise<void> {
  const db = await getDb();
  if (!db || claimColumnMissing) return;
  try {
    await db.update(scheduledJobRuns).set({ claimedAt: null }).where(eq(scheduledJobRuns.jobName, jobName));
  } catch (error) {
    console.error(`[Scheduler] Failed to release claim for "${jobName}":`, error);
  }
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

    let claimed: boolean;
    try {
      claimed = await claimJob(job.name, job.intervalMs);
    } catch (error) {
      console.error(`[Scheduler] Failed to claim job "${job.name}" (another process may be running it):`, error);
      continue;
    }
    if (!claimed) continue; // another process already holds a fresh claim

    runningJobNames.add(job.name);
    // 2026-10-05: ажиллалт бүрийн түүх (job_runs, 0102). Түүх бичигдэхгүй байх нь
    // job-ийн өөрийн ажлыг хэзээ ч зогсоохгүй — startJobRun null буцаавал алгасна.
    let runId: number | null = null;
    try {
      runId = await startJobRun(job.name, JOB_RUNNER_ID);
    } catch (error) {
      console.error(`[Scheduler] Failed to open job_runs row for "${job.name}":`, error);
    }
    try {
      const result = await job.run();
      await markScheduledJobRun(job.name);
      if (runId) await finishJobRun(runId, { ok: true, affectedCount: result?.affectedCount ?? null }).catch(() => undefined);
    } catch (error) {
      console.error(`[Scheduler] Job "${job.name}" failed (will retry next tick):`, error);
      if (runId) await finishJobRun(runId, { ok: false, error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    } finally {
      runningJobNames.delete(job.name);
      await releaseJobClaim(job.name);
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
