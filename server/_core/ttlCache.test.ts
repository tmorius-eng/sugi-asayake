import { describe, expect, it, vi } from "vitest";
import { getOrSetCached } from "./ttlCache";

// Admin overhaul (2026-09-08, Phase L). Pure in-process logic, no DB needed.
describe("getOrSetCached", () => {
  it("returns the cached value for the same key within the TTL, without recomputing", async () => {
    const compute = vi.fn(async () => "first");
    const key = `ttl-same-${Date.now()}`;
    expect(await getOrSetCached(key, 10_000, compute)).toBe("first");
    compute.mockResolvedValueOnce("second");
    expect(await getOrSetCached(key, 10_000, compute)).toBe("first");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes once the TTL has elapsed", async () => {
    const compute = vi.fn(async () => "first");
    const key = `ttl-expiry-${Date.now()}`;
    expect(await getOrSetCached(key, 1, compute)).toBe("first");
    await new Promise(resolve => setTimeout(resolve, 15));
    compute.mockResolvedValueOnce("second");
    expect(await getOrSetCached(key, 10_000, compute)).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("never serves one key's cached value for a different key -- the real failure mode this guards against (e.g. switching a filter)", async () => {
    const base = `ttl-filters-${Date.now()}`;
    const computeAll = vi.fn(async () => "all-rows");
    const computeFiltered = vi.fn(async () => "filtered-rows");
    expect(await getOrSetCached(`${base}:all`, 10_000, computeAll)).toBe("all-rows");
    // A caller that forgot to fold its filter into the key would collide
    // here and wrongly get "all-rows" back for the filtered query.
    expect(await getOrSetCached(`${base}:filtered`, 10_000, computeFiltered)).toBe("filtered-rows");
    expect(computeFiltered).toHaveBeenCalledTimes(1);
  });
});
