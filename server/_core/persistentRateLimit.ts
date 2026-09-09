import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { notifyError } from "./honeybadger";
import { checkRateLimit } from "./security";

/**
 * Audit 2026-09-09 (R3): a rate limiter whose counters live in the shared
 * database instead of this process's memory.
 *
 * Used ONLY by the strict tiers (login / register / password reset /
 * checkout / phone verification -- see server/_core/trpc.ts). Those are
 * low-volume, security-sensitive endpoints where the limit must hold across
 * every server instance; the in-memory checkRateLimit stays in place for the
 * high-volume general/cart/telemetry tiers, where a database round trip on
 * every call would cost far more than it protects.
 *
 * One statement per attempt: INSERT ... ON DUPLICATE KEY UPDATE increments
 * the bucket atomically, restarting it when its window has expired. The
 * LAST_INSERT_ID(expr) idiom makes MySQL hand the post-increment count back
 * in the OK packet, so the allowed path costs exactly one round trip; only a
 * blocked caller pays for a second SELECT to learn its Retry-After.
 * Assignments in ON DUPLICATE KEY UPDATE are evaluated left to right, so
 * `count` is decided against the OLD resetAt before resetAt itself moves.
 *
 * Fails OPEN, deliberately: if the database is unreachable the endpoint
 * behind this limiter cannot do its job anyway (every strict-tier procedure
 * needs the database within its first few lines), so refusing here would
 * only change which error the caller sees. The failure is logged and
 * reported so it is never silent. With no DATABASE_URL at all (unit tests,
 * local tooling) it falls back to the in-memory limiter so behaviour is
 * unchanged rather than absent.
 */
export async function checkPersistentRateLimit(bucketName: string, key: string, maxAttempts: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = await getDb();
  if (!db) return checkRateLimit(bucketName, key, maxAttempts, windowMs);
  const bucketKey = `${bucketName}:${key}`.slice(0, 200);
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const [result] = await db.execute(sql`
      INSERT INTO rate_limit_buckets (bucketKey, count, resetAt)
      VALUES (${bucketKey}, LAST_INSERT_ID(1), DATE_ADD(NOW(), INTERVAL ${windowSeconds} SECOND))
      ON DUPLICATE KEY UPDATE
        count = LAST_INSERT_ID(IF(resetAt <= NOW(), 1, count + 1)),
        resetAt = IF(resetAt <= NOW(), DATE_ADD(NOW(), INTERVAL ${windowSeconds} SECOND), resetAt)
    `);
    const count = Number((result as { insertId?: number | bigint }).insertId ?? 0);
    maybeSweepExpired(db);
    if (count <= maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
    const [rows] = await db.execute(sql`SELECT GREATEST(1, TIMESTAMPDIFF(SECOND, NOW(), resetAt)) AS retryAfter FROM rate_limit_buckets WHERE bucketKey = ${bucketKey}`);
    const retryAfter = Number((rows as unknown as { retryAfter?: number | string }[])[0]?.retryAfter ?? windowSeconds);
    return { allowed: false, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : windowSeconds };
  } catch (error) {
    console.error("[rateLimit] persistent bucket unavailable, allowing request", error);
    notifyError(error, { bucketName, where: "checkPersistentRateLimit" });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// Roughly one call in a hundred deletes buckets whose window ended more than
// a day ago -- the table can only ever hold "distinct keys seen in the last
// day", never grow without bound. Fire-and-forget: a failed sweep is
// harmless and must never delay the caller.
let sweepCounter = 0;
function maybeSweepExpired(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  sweepCounter = (sweepCounter + 1) % 100;
  if (sweepCounter !== 0) return;
  db.execute(sql`DELETE FROM rate_limit_buckets WHERE resetAt < DATE_SUB(NOW(), INTERVAL 1 DAY)`).catch(() => undefined);
}
