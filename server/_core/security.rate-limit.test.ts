import { describe, expect, it, vi } from "vitest";
import { checkAuthRateLimit } from "./security";

describe("checkAuthRateLimit", () => {
  it("allows requests under the limit and blocks once the threshold is exceeded", () => {
    const key = `test-key-${Math.random()}`;

    for (let attempt = 0; attempt < 8; attempt++) {
      expect(checkAuthRateLimit(key)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }

    const blocked = checkAuthRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key so one caller cannot exhaust another's budget", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;

    for (let attempt = 0; attempt < 9; attempt++) checkAuthRateLimit(keyA);
    expect(checkAuthRateLimit(keyA).allowed).toBe(false);
    expect(checkAuthRateLimit(keyB).allowed).toBe(true);
  });

  it("resets the bucket once the window has elapsed", () => {
    vi.useFakeTimers();
    try {
      const key = `test-key-window-${Math.random()}`;
      for (let attempt = 0; attempt < 9; attempt++) checkAuthRateLimit(key);
      expect(checkAuthRateLimit(key).allowed).toBe(false);

      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(checkAuthRateLimit(key)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});
