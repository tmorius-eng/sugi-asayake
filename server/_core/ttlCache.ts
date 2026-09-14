/**
 * Admin overhaul (2026-09-08, Phase L): a plain in-memory, per-process TTL
 * cache -- no Redis, matching this project's single-process reality (same
 * tradeoff already accepted for rate-limit buckets and the SQL query log's
 * ring buffer). Applied at each call site rather than inside one query layer,
 * so the cache key can include the exact filter params a given call used --
 * the one real failure mode this needs to avoid is serving a stale result
 * for a *different* filter than what's cached.
 *
 * Deliberately dumb about eviction: no LRU. The staleness window (30s for the
 * audit/login/SQL logs and the storefront's content reads, 60s for the
 * third-party Honeybadger call) is the intended behaviour for these
 * read-heavy, rarely-urgent views, not a bug to work around.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
/**
 * When each key was last invalidated. Needed because a write and a read can
 * overlap: a reader that started its query BEFORE a writer changed the row
 * would otherwise hand back the pre-write value and store it for the full
 * TTL, so an admin's edit would appear to do nothing for 30 seconds. A result
 * computed before the most recent invalidation is returned to its caller but
 * never cached.
 */
const invalidatedAt = new Map<string, number>();

export async function getOrSetCached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const startedAt = Date.now();
  const value = await compute();
  const lastInvalidated = invalidatedAt.get(key) ?? 0;
  if (lastInvalidated >= startedAt) return value;
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Drops one entry. Added 2026-09-11 for integration settings: a staleness
 *  window is fine for a read-only log view, but not for "I just pasted a new
 *  ntfy topic and pressed Test". Only clears THIS process's copy -- the other
 *  laptop picks the change up when its own entry expires. */
export function invalidateCached(key: string): void {
  store.delete(key);
  invalidatedAt.set(key, Date.now());
}

/** Drops every entry whose key starts with `prefix` -- for keys that carry a
 *  parameter (`storefront:bestsellers:8`, `storefront:related:<id>:6`), which a
 *  writer cannot enumerate. Same invalidation mark per dropped key as above. */
export function invalidateCachedByPrefix(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) invalidateCached(key);
  // A key not currently stored may be mid-compute; mark the prefix's known
  // keys only -- an in-flight compute for an unseen key stores its result,
  // which the 30 s TTL then bounds. Acceptable for these rails.
}

/** Test seam: forget everything, including the invalidation marks. */
export function clearCacheForTests(): void {
  store.clear();
  invalidatedAt.clear();
}
