/**
 * Admin overhaul (2026-09-08, Phase L): a plain in-memory, per-process TTL
 * cache -- no Redis, matching this project's single-process reality (same
 * tradeoff already accepted for rate-limit buckets and the SQL query log's
 * ring buffer). Applied at each router call site rather than inside db.ts,
 * so the cache key can include the exact filter params a given call used --
 * the one real failure mode this needs to avoid is serving a stale result
 * for a *different* filter than what's cached.
 *
 * Deliberately dumb: no LRU eviction, no invalidation hooks wired into
 * logAdminAction/recordLoginAttempt. The staleness window (30s for the
 * audit/login/SQL logs, 60s for the third-party Honeybadger call) is the
 * intended behavior for these read-heavy, rarely-urgent admin views, not a
 * bug to work around.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export async function getOrSetCached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
