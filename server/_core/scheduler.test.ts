import { afterEach, describe, expect, it, vi } from "vitest";

// "Controls everything" admin overhaul (2026-09-08, Phase D). Pure
// in-process logic, no DB needed -- server/db.ts's getScheduledJobLastRun/
// markScheduledJobRun are mocked so this tests the scheduler's own due-ness
// and retry-on-failure logic in isolation, the same style as
// server/_core/ttlCache.test.ts.
const state = new Map<string, Date>();
// 2026-09-27: claimJob/releaseJobClaim (scheduler.ts) go through getDb() too
// -- faked here so these stay unit tests (no real DB) and every claim
// trivially succeeds, matching the pre-claim behaviour this file already
// tested. The DB-level guarded-UPDATE semantics themselves need a real
// MySQL connection to verify meaningfully and are exercised there instead
// (see docs/PROJECT-GUIDE.md on integration tests staying off vitest here).
vi.mock("../db", () => ({
  getScheduledJobLastRun: vi.fn(async (jobName: string) => state.get(jobName) ?? null),
  markScheduledJobRun: vi.fn(async (jobName: string) => { state.set(jobName, new Date()); }),
  getDb: vi.fn(async () => ({
    execute: vi.fn(async () => [[]]),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => [{ affectedRows: 1 }]),
      })),
    })),
  })),
}));

describe("scheduler", () => {
  afterEach(() => {
    state.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("runs a job the first time (no prior run recorded) and records its run time", async () => {
    const { registerJob, runDueJobsOnce } = await import("./scheduler");
    const run = vi.fn(async () => undefined);
    registerJob({ name: `test-job-first-${Date.now()}`, intervalMs: 10_000, run });
    await runDueJobsOnce();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not re-run a job whose interval hasn't elapsed since its last recorded run", async () => {
    const { registerJob, runDueJobsOnce } = await import("./scheduler");
    const name = `test-job-recent-${Date.now()}`;
    state.set(name, new Date()); // just ran
    const run = vi.fn(async () => undefined);
    registerJob({ name, intervalMs: 60_000, run });
    await runDueJobsOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("re-runs a job once its interval has elapsed since its last recorded run", async () => {
    const { registerJob, runDueJobsOnce } = await import("./scheduler");
    const name = `test-job-stale-${Date.now()}`;
    state.set(name, new Date(Date.now() - 120_000)); // ran 2 minutes ago
    const run = vi.fn(async () => undefined);
    registerJob({ name, intervalMs: 60_000, run });
    await runDueJobsOnce();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not record a run time when the job throws, so the next tick retries it", async () => {
    const { registerJob, runDueJobsOnce } = await import("./scheduler");
    const { markScheduledJobRun } = await import("../db");
    const name = `test-job-failing-${Date.now()}`;
    const run = vi.fn(async () => { throw new Error("boom"); });
    registerJob({ name, intervalMs: 10_000, run });
    await runDueJobsOnce();
    expect(run).toHaveBeenCalledTimes(1);
    expect(markScheduledJobRun).not.toHaveBeenCalledWith(name);
    expect(state.has(name)).toBe(false);
  });

  it("keeps two different job names from interfering with each other", async () => {
    const { registerJob, runDueJobsOnce } = await import("./scheduler");
    const nameA = `test-job-a-${Date.now()}`;
    const nameB = `test-job-b-${Date.now()}`;
    state.set(nameA, new Date()); // A just ran, not due
    const runA = vi.fn(async () => undefined);
    const runB = vi.fn(async () => undefined);
    registerJob({ name: nameA, intervalMs: 60_000, run: runA });
    registerJob({ name: nameB, intervalMs: 60_000, run: runB }); // B has never run, due
    await runDueJobsOnce();
    expect(runA).not.toHaveBeenCalled();
    expect(runB).toHaveBeenCalledTimes(1);
  });
});
