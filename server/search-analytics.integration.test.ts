import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { searchQueries } from "../drizzle/schema";
import { getDb } from "./db";
import { getSearchInsights, hashVisitorToken, purgeSearchQueries, recordSearchQuery, resetSearchLogDedupeForTests } from "./search/searchAnalytics";

// Хайлтын лог (2026-09-20). Opt-in, бодит DB. Мөрүүд marker-тэй, afterAll устгана.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const waitForLog = async (normalised: string, expected: number) => {
  const db = await getDb();
  for (let attempt = 0; attempt < 40; attempt++) {
    const rows = await db!.select({ id: searchQueries.id }).from(searchQueries).where(like(searchQueries.normalised, `${normalised}%`));
    if (rows.length >= expected) return rows.length;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const rows = await db!.select({ id: searchQueries.id }).from(searchQueries).where(like(searchQueries.normalised, `${normalised}%`));
  return rows.length;
};

describeWithDatabase("search analytics integration", () => {
  const marker = `srchlog${Date.now()}`;

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(searchQueries).where(like(searchQueries.normalised, `${marker}%`));
  });

  it("hashes the visitor token and never stores the raw value", () => {
    const hash = hashVisitorToken("visitor-token-abc");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("visitor-token");
    expect(hashVisitorToken(null)).toBeNull();
  });

  it("logs a query once per visitor within the dedupe window and skips very short queries", async () => {
    resetSearchLogDedupeForTests();
    const base = { raw: `${marker} крем`, normalised: `${marker} крем`, resultCount: 3, mode: "strict" as const, source: "shop" as const, userId: null, visitorToken: "tok-1" };
    recordSearchQuery(base);
    recordSearchQuery(base); // same visitor, same query, inside 60 s -> dropped
    recordSearchQuery({ ...base, visitorToken: "tok-2" }); // другой зочин -> logged
    recordSearchQuery({ raw: "ab", normalised: "ab", resultCount: 0, mode: "none", source: "header", userId: null, visitorToken: "tok-1" }); // < 3 chars -> never
    expect(await waitForLog(`${marker} крем`, 2)).toBe(2);
  });

  it("insights aggregate zero-result queries so an admin can turn them into synonyms", async () => {
    resetSearchLogDedupeForTests();
    recordSearchQuery({ raw: `${marker} олдохгүй`, normalised: `${marker} олдохгүй`, resultCount: 0, mode: "none", source: "header", userId: null, visitorToken: "tok-3" });
    await waitForLog(`${marker} олдохгүй`, 1);
    const insights = await getSearchInsights(7);
    expect(insights.totals.searches).toBeGreaterThanOrEqual(3);
    expect(insights.zeroResultQueries.some(row => row.normalised === `${marker} олдохгүй`)).toBe(true);
    expect(insights.topQueries.some(row => row.normalised === `${marker} крем`)).toBe(true);
  });

  it("a staff member's own test searches never enter the shopper statistics", async () => {
    // Admin → Хайлт → "Туршиж үзэх" нь catalog.suggest-ийг дууддаг; тэр нь
    // худалдан авагчийн дохио БИШ (server/routers.ts's isAdminPanelRole gate).
    const { appRouter } = await import("./routers");
    const { testSessionUser } = await import("./_test-helpers");
    const caller = appRouter.createCaller({
      user: testSessionUser({ id: 1, role: "admin" }),
      req: { protocol: "https", headers: {}, ip: "203.0.113.77", socket: { remoteAddress: "203.0.113.77" } } as never,
      res: { cookie: () => undefined, clearCookie: () => undefined } as never,
    });
    await caller.catalog.suggest({ query: `${marker} ажилтан` });
    await new Promise(resolve => setTimeout(resolve, 800));
    const db = await getDb();
    const rows = await db!.select({ id: searchQueries.id }).from(searchQueries).where(like(searchQueries.normalised, `${marker} ажилтан%`));
    expect(rows).toEqual([]);
  });

  it("purge keeps recent rows", async () => {
    const removed = await purgeSearchQueries(90);
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(await waitForLog(`${marker} крем`, 2)).toBe(2);
  });
});
