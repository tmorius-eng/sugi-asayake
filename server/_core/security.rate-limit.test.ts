import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./security";

const BUCKET = "test-bucket";
const MAX = 8;
const WINDOW_MS = 15 * 60 * 1000;

describe("checkRateLimit", () => {
  it("allows requests under the limit and blocks once the threshold is exceeded", () => {
    const key = `test-key-${Math.random()}`;

    for (let attempt = 0; attempt < MAX; attempt++) {
      expect(checkRateLimit(BUCKET, key, MAX, WINDOW_MS)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }

    const blocked = checkRateLimit(BUCKET, key, MAX, WINDOW_MS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key so one caller cannot exhaust another's budget", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;

    for (let attempt = 0; attempt < MAX + 1; attempt++) checkRateLimit(BUCKET, keyA, MAX, WINDOW_MS);
    expect(checkRateLimit(BUCKET, keyA, MAX, WINDOW_MS).allowed).toBe(false);
    expect(checkRateLimit(BUCKET, keyB, MAX, WINDOW_MS).allowed).toBe(true);
  });

  it("keeps separate buckets per *bucket name* so a generous limit and a strict limit never share state", () => {
    const key = `test-key-shared-${Math.random()}`;
    for (let attempt = 0; attempt < MAX + 1; attempt++) checkRateLimit("strict-bucket", key, MAX, WINDOW_MS);
    expect(checkRateLimit("strict-bucket", key, MAX, WINDOW_MS).allowed).toBe(false);
    // Same key, different named bucket — must not be blocked by the other bucket's count.
    expect(checkRateLimit("moderate-bucket", key, 30, WINDOW_MS).allowed).toBe(true);
  });

  it("resets the bucket once the window has elapsed", () => {
    vi.useFakeTimers();
    try {
      const key = `test-key-window-${Math.random()}`;
      for (let attempt = 0; attempt < MAX + 1; attempt++) checkRateLimit(BUCKET, key, MAX, WINDOW_MS);
      expect(checkRateLimit(BUCKET, key, MAX, WINDOW_MS).allowed).toBe(false);

      vi.advanceTimersByTime(WINDOW_MS + 1);
      expect(checkRateLimit(BUCKET, key, MAX, WINDOW_MS)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reset an unrelated, still-active bucket just because the map is being swept", () => {
    // Regression test: the old implementation wiped the *entire* bucket map
    // once it grew past a size threshold, which reset every in-progress
    // block along with it. The fix sweeps only individually-expired entries.
    const blockedKey = `test-key-blocked-${Math.random()}`;
    for (let attempt = 0; attempt < MAX + 1; attempt++) checkRateLimit("sweep-bucket", blockedKey, MAX, WINDOW_MS);
    expect(checkRateLimit("sweep-bucket", blockedKey, MAX, WINDOW_MS).allowed).toBe(false);

    // Flood the same bucket with enough distinct keys to cross the sweep threshold.
    for (let i = 0; i < 5_001; i++) checkRateLimit("sweep-bucket", `flood-${i}-${Math.random()}`, MAX, WINDOW_MS);

    // The still-active block must survive the sweep.
    expect(checkRateLimit("sweep-bucket", blockedKey, MAX, WINDOW_MS).allowed).toBe(false);
  });
});
