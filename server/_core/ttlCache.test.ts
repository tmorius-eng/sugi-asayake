import { describe, expect, it, vi } from "vitest";
import { getOrSetCached, invalidateCached } from "./ttlCache";

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

  // Ачааллын бэлтгэл (2026-09-16): thundering herd. TTL дуусах агшинд ирсэн
  // зэрэгцээ дуудагчид бүгд өөрсдийн query-г эхлүүлэх ёсгүй.
  it("нэг түлхүүрийн зэрэгцээ дуудагчид нэг тооцоололд нэгдэнэ", async () => {
    const key = `ttl-herd-${Date.now()}`;
    let release: (value: string) => void = () => {};
    const compute = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const callers = [getOrSetCached(key, 10_000, compute), getOrSetCached(key, 10_000, compute), getOrSetCached(key, 10_000, compute)];
    release("one-query");
    expect(await Promise.all(callers)).toEqual(["one-query", "one-query", "one-query"]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  // ...гэхдээ "нэгдэх" нь admin-ий засварыг залгих ёсгүй: хүчингүй болголтын
  // ДАРАА ирсэн дуудагч явж буй (хуучин) тооцоололд нэгдэхгүй.
  it("хүчингүй болголтын дараах дуудагч явж буй хуучин тооцоололд нэгдэхгүй", async () => {
    const key = `ttl-herd-invalidate-${Date.now()}`;
    let release: (value: string) => void = () => {};
    const stale = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const first = getOrSetCached(key, 10_000, stale);
    invalidateCached(key);
    // Хүчингүй болголт болон дараагийн уншилтыг ӨӨР миллисекундэд байлгана:
    // ижил ms дотор бол cache нь зориуд болгоомжтой ажиллаж үр дүнг хадгалдаггүй
    // (getOrSetCached-ийн `lastInvalidated >= startedAt`), тэр нь энд шалгаж буй
    // зүйл биш бөгөөд тестийг тогтворгүй болгоно.
    await new Promise(resolve => setTimeout(resolve, 3));
    const fresh = vi.fn(async () => "after-write");
    const second = getOrSetCached(key, 10_000, fresh);
    release("before-write");
    expect(await first).toBe("before-write");
    expect(await second).toBe("after-write");
    expect(fresh).toHaveBeenCalledTimes(1);
    // Хуучин тооцоолол дууссаны дараа ч кэшэд хуучин утга үлдэхгүй.
    expect(await getOrSetCached(key, 10_000, async () => "unused")).toBe("after-write");
  });

  it("алдаа гарсан тооцоолол кэшлэгдэхгүй, дараагийн дуудагч дахин оролдоно", async () => {
    const key = `ttl-error-${Date.now()}`;
    const failing = vi.fn(async () => { throw new Error("DB алга"); });
    await expect(getOrSetCached(key, 10_000, failing)).rejects.toThrow("DB алга");
    const ok = vi.fn(async () => "recovered");
    expect(await getOrSetCached(key, 10_000, ok)).toBe("recovered");
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
