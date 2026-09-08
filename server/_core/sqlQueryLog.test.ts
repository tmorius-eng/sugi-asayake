import { describe, expect, it, beforeEach, vi } from "vitest";

// Admin overhaul (2026-09-08, Phase K): pure in-process logic, no DB needed
// -- unlike this project's usual *.integration.test.ts convention, which
// exists specifically for behavior that DOES need a real Aiven connection.
describe("sqlQueryLogger ring buffer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps at most 200 entries, dropping the oldest first, most-recent-first on read", async () => {
    const { sqlQueryLogger, getRecentSqlQueries } = await import("./sqlQueryLog");
    for (let i = 0; i < 205; i++) sqlQueryLogger.logQuery(`select ${i}`, []);
    const entries = getRecentSqlQueries();
    expect(entries).toHaveLength(200);
    // Oldest 5 (queries 0-4) should have been evicted; the newest read first.
    expect(entries[0].query).toBe("select 204");
    expect(entries.at(-1)!.query).toBe("select 5");
  });

  it("truncates params over 300 chars and stringifies non-string params", async () => {
    const { sqlQueryLogger, getRecentSqlQueries } = await import("./sqlQueryLog");
    const longValue = "x".repeat(400);
    sqlQueryLogger.logQuery("select ?, ?, ?", [longValue, 42, { nested: true }]);
    const [entry] = getRecentSqlQueries();
    expect(entry.params[0].length).toBeLessThan(310);
    expect(entry.params[0].endsWith("…")).toBe(true);
    expect(entry.params[1]).toBe("42");
    expect(entry.params[2]).toBe(JSON.stringify({ nested: true }));
  });
});
