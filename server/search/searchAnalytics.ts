import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { searchQueries } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { sqlInt } from "../_core/sqlSafe";
import type { SearchMode } from "./catalogSearchIndex";

/**
 * Хайлтын лог (2026-09-20). catalog.search/suggest бүр `search_queries`-д нэг
 * мөр — fire-and-forget, хайлтын хариуг хэзээ ч удаашруулахгүй, унавал зөвхөн
 * лог. Нэг зочны ижил query 60 секундэд нэг л удаа (HeaderSearch 300 мс
 * debounce-тай тул үсэг бүр тусдаа мөр болохгүй).
 *
 * ⚠️ PII байхгүй: `visitorHash` = sha256(visitor cookie + серверийн нууц) — IP,
 * түүхий token, нэр, утас хэзээ ч биш. Admin → Хайлт → Статистик уншина;
 * 90 хоногийн дараа data-retention job (server/automation.ts) устгана.
 */
const DEDUPE_WINDOW_MS = 60_000;
const DEDUPE_MAX_ENTRIES = 5_000;
const MIN_LOGGED_LENGTH = 3;
const recentlyLogged = new Map<string, number>();

export function hashVisitorToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return createHash("sha256").update(`${token}:${ENV.cookieSecret}`).digest("hex").slice(0, 32);
}

function shouldLog(key: string): boolean {
  const now = Date.now();
  const last = recentlyLogged.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  if (recentlyLogged.size >= DEDUPE_MAX_ENTRIES) {
    for (const [entryKey, at] of recentlyLogged) if (now - at >= DEDUPE_WINDOW_MS) recentlyLogged.delete(entryKey);
    if (recentlyLogged.size >= DEDUPE_MAX_ENTRIES) recentlyLogged.clear();
  }
  recentlyLogged.set(key, now);
  return true;
}

export type SearchLogInput = {
  raw: string;
  normalised: string;
  resultCount: number;
  mode: SearchMode;
  source: "shop" | "header";
  userId: number | null;
  visitorToken: string | null;
};

export function recordSearchQuery(input: SearchLogInput): void {
  if (input.normalised.length < MIN_LOGGED_LENGTH) return;
  const visitorHash = hashVisitorToken(input.visitorToken);
  const dedupeKey = `${visitorHash ?? input.userId ?? "anon"}|${input.normalised}`;
  if (!shouldLog(dedupeKey)) return;
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(searchQueries).values({
        query: input.raw.slice(0, 120),
        normalised: input.normalised.slice(0, 120),
        resultCount: input.resultCount,
        mode: input.mode,
        source: input.source,
        userId: input.userId,
        visitorHash,
      });
    } catch (error) {
      console.warn("[search] query log failed:", error instanceof Error ? error.message : error);
    }
  })();
}

/** Тестийн seam — dedupe цонхыг мартана. */
export function resetSearchLogDedupeForTests(): void {
  recentlyLogged.clear();
}

export type SearchInsights = {
  days: number;
  totals: { searches: number; zeroResult: number; visitors: number };
  topQueries: Array<{ normalised: string; count: number; avgResults: number }>;
  zeroResultQueries: Array<{ normalised: string; count: number; lastSeenAt: Date }>;
  daily: Array<{ day: string; searches: number; zeroResult: number }>;
};

export async function getSearchInsights(days: number): Promise<SearchInsights> {
  const db = await getDb();
  const empty: SearchInsights = { days, totals: { searches: 0, zeroResult: 0, visitors: 0 }, topQueries: [], zeroResultQueries: [], daily: [] };
  if (!db) return empty;
  const since = sql`${searchQueries.createdAt} > NOW() - INTERVAL ${sqlInt(days)} DAY`;
  const [[totals], topQueries, zeroResultQueries, daily] = await Promise.all([
    db.select({
      searches: sql<number>`COUNT(*)`.mapWith(Number),
      zeroResult: sql<number>`SUM(CASE WHEN ${searchQueries.resultCount} = 0 THEN 1 ELSE 0 END)`.mapWith(Number),
      visitors: sql<number>`COUNT(DISTINCT COALESCE(${searchQueries.visitorHash}, CAST(${searchQueries.userId} AS CHAR)))`.mapWith(Number),
    }).from(searchQueries).where(since),
    db.select({
      normalised: searchQueries.normalised,
      count: sql<number>`COUNT(*)`.mapWith(Number),
      avgResults: sql<number>`AVG(${searchQueries.resultCount})`.mapWith(Number),
    }).from(searchQueries).where(since).groupBy(searchQueries.normalised).orderBy(desc(sql`COUNT(*)`)).limit(50),
    db.select({
      normalised: searchQueries.normalised,
      count: sql<number>`COUNT(*)`.mapWith(Number),
      lastSeenAt: sql<Date>`MAX(${searchQueries.createdAt})`.mapWith(value => new Date(value as string)),
    }).from(searchQueries).where(and(since, eq(searchQueries.resultCount, 0))).groupBy(searchQueries.normalised).orderBy(desc(sql`COUNT(*)`)).limit(50),
    db.select({
      day: sql<string>`DATE(${searchQueries.createdAt})`.mapWith(String),
      searches: sql<number>`COUNT(*)`.mapWith(Number),
      zeroResult: sql<number>`SUM(CASE WHEN ${searchQueries.resultCount} = 0 THEN 1 ELSE 0 END)`.mapWith(Number),
    }).from(searchQueries).where(since).groupBy(sql`DATE(${searchQueries.createdAt})`).orderBy(sql`DATE(${searchQueries.createdAt})`),
  ]);
  return {
    days,
    totals: { searches: totals?.searches ?? 0, zeroResult: totals?.zeroResult ?? 0, visitors: totals?.visitors ?? 0 },
    topQueries,
    zeroResultQueries,
    daily,
  };
}

export async function purgeSearchQueries(olderThanDays = 90): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(searchQueries).where(sql`${searchQueries.createdAt} < NOW() - INTERVAL ${sqlInt(olderThanDays)} DAY`);
  return Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
}
