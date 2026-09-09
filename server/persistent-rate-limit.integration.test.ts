import { afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { checkPersistentRateLimit } from "./_core/persistentRateLimit";

// Audit 2026-09-09 (R3): the strict rate-limit tiers now count in the shared
// database (rate_limit_buckets). Real MySQL only -- the whole point is the
// INSERT ... ON DUPLICATE KEY UPDATE + LAST_INSERT_ID(expr) idiom, which no
// mock can vouch for.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("persistent rate limit (rate_limit_buckets)", () => {
  const marker = `prl-${Date.now().toString(36)}`;
  const keys: string[] = [];
  const keyFor = (suffix: string) => { const key = `${marker}-${suffix}`; keys.push(key); return key; };

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`DELETE FROM rate_limit_buckets WHERE bucketKey LIKE ${`test:${marker}-%`}`);
  });

  it("allows up to the limit, blocks the next attempt with a Retry-After, and keeps counting", async () => {
    const key = keyFor("basic");
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await checkPersistentRateLimit("test", key, 3, 60_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }
    const blocked = await checkPersistentRateLimit("test", key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect((await checkPersistentRateLimit("test", key, 3, 60_000)).allowed).toBe(false);
  });

  it("keeps separate counters per key, so one caller cannot exhaust another's budget", async () => {
    const busy = keyFor("busy");
    const quiet = keyFor("quiet");
    for (let attempt = 0; attempt < 4; attempt++) await checkPersistentRateLimit("test", busy, 3, 60_000);
    expect((await checkPersistentRateLimit("test", busy, 3, 60_000)).allowed).toBe(false);
    expect((await checkPersistentRateLimit("test", quiet, 3, 60_000)).allowed).toBe(true);
  });

  // resetAt is a second-precision TIMESTAMP, so a window can expire up to
  // ~1s early -- irrelevant at the real 15-minute windows, but a 1s window
  // here would be flaky. 3s is comfortably longer than three Aiven round
  // trips, and the wait clears it with margin.
  it("starts a fresh window once the old one has expired", async () => {
    const key = keyFor("window");
    for (let attempt = 0; attempt < 2; attempt++) await checkPersistentRateLimit("test", key, 2, 3_000);
    expect((await checkPersistentRateLimit("test", key, 2, 3_000)).allowed).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 4_200));
    expect(await checkPersistentRateLimit("test", key, 2, 3_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("counts concurrent attempts atomically (no lost increments)", async () => {
    const key = keyFor("concurrent");
    const results = await Promise.all(Array.from({ length: 12 }, () => checkPersistentRateLimit("test", key, 5, 60_000)));
    expect(results.filter(result => result.allowed)).toHaveLength(5);
    expect(results.filter(result => !result.allowed)).toHaveLength(7);
  });

  it("fails OPEN (and reports) if the bucket table is unusable, rather than locking everyone out", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const executeSpy = vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("simulated outage"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await checkPersistentRateLimit("test", keyFor("outage"), 1, 60_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      executeSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
