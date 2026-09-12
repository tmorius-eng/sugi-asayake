import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCacheForTests, getOrSetCached, invalidateCached } from "./_core/ttlCache";

/**
 * The cache that sits in front of the storefront's content reads
 * (2026-09-12 performance pass). Small, but it now decides what every visitor
 * sees, so the two rules that matter are pinned here:
 *
 *   - a value is served from memory until its TTL runs out;
 *   - an admin's edit is never hidden behind it, INCLUDING when the edit lands
 *     while a read is already in flight. That last case is the subtle one: a
 *     reader that queried before the write, and returned after it, used to
 *     store the pre-write answer for the full TTL.
 */
describe("ttlCache", () => {
  afterEach(() => { clearCacheForTests(); vi.useRealTimers(); });

  it("computes once and serves the rest from memory", async () => {
    const compute = vi.fn(async () => "first");
    expect(await getOrSetCached("k", 30_000, compute)).toBe("first");
    expect(await getOrSetCached("k", 30_000, compute)).toBe("first");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes once the TTL has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-12T10:00:00Z") });
    let answer = "before";
    const compute = vi.fn(async () => answer);
    expect(await getOrSetCached("k", 30_000, compute)).toBe("before");
    answer = "after";
    vi.advanceTimersByTime(29_000);
    expect(await getOrSetCached("k", 30_000, compute)).toBe("before");
    vi.advanceTimersByTime(2_000);
    expect(await getOrSetCached("k", 30_000, compute)).toBe("after");
  });

  it("serves an admin's edit immediately after invalidation", async () => {
    let answer = "old";
    const compute = async () => answer;
    expect(await getOrSetCached("k", 30_000, compute)).toBe("old");
    answer = "new";
    invalidateCached("k");
    expect(await getOrSetCached("k", 30_000, compute)).toBe("new");
  });

  it("does not cache a result that was already stale when it arrived", async () => {
    // A visitor's read starts, an admin saves mid-flight, the read returns
    // the pre-save value. That value may be handed to this one visitor, but
    // storing it would hide the edit from everybody for the whole TTL.
    let answer = "old";
    let releaseRead: (() => void) | null = null;
    const slowRead = getOrSetCached("k", 30_000, async () => {
      const rowAsQueried = answer; // what the database handed back...
      await new Promise<void>(resolve => { releaseRead = resolve; });
      return rowAsQueried; // ...returned to us only after the admin's save
    });
    await vi.waitFor(() => expect(releaseRead).not.toBeNull());

    answer = "new";
    invalidateCached("k"); // the admin's save
    releaseRead!();
    expect(await slowRead).toBe("old"); // this reader was already past the point of no return

    // but the next reader must see the edit, not a 30-second-old copy
    expect(await getOrSetCached("k", 30_000, async () => answer)).toBe("new");
  });

  it("keeps keys apart, so one section's edit cannot blank another's", async () => {
    await getOrSetCached("a", 30_000, async () => "A");
    await getOrSetCached("b", 30_000, async () => "B");
    invalidateCached("a");
    expect(await getOrSetCached("b", 30_000, async () => "B2")).toBe("B");
  });
});
