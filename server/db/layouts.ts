// Брэнд студи A3 — нүүрний хэсгүүдийн дараалал (2026-10-05, migration 0105). docs/CODEBASE.md §3.1.
// Уншилт 30 с кэштэй (indexHtml bootstrap + admin); бичилт кэшийг цэвэрлэнэ, HTML-ийн кэшийг
// роутер цэвэрлэнэ (server/db → _core/indexHtml тойрог import болохгүйн тулд).
import { eq } from "drizzle-orm";
import { siteLayouts } from "../../drizzle/schema";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { sanitizeHomeLayout, type HomeSectionEntry } from "../../shared/home-sections";
import { getDb } from "./connection";

const cacheKey = (pageKey: string) => `storefront:layout:${pageKey}`;
const isMissingTableError = (error: unknown) => /doesn't exist|ER_NO_SUCH_TABLE/.test(String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? ""));

/** Нүүрний layout — мөр байхгүй/эвдэрхий/хүснэгтгүй бол кодын анхдагч дараалал. */
export async function getHomeLayout(): Promise<HomeSectionEntry[]> {
  return getOrSetCached(cacheKey("home"), 30_000, async () => {
    const db = await getDb();
    if (!db) return sanitizeHomeLayout(null);
    try {
      const [row] = await db.select({ sectionsJson: siteLayouts.sectionsJson }).from(siteLayouts).where(eq(siteLayouts.pageKey, "home")).limit(1);
      if (!row) return sanitizeHomeLayout(null);
      try { return sanitizeHomeLayout(JSON.parse(row.sectionsJson)); } catch { return sanitizeHomeLayout(null); }
    } catch (error) {
      if (isMissingTableError(error)) return sanitizeHomeLayout(null);
      throw error;
    }
  });
}

export async function saveHomeLayout(layout: unknown, actorUserId: number | null): Promise<HomeSectionEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const clean = sanitizeHomeLayout(layout);
  const sectionsJson = JSON.stringify(clean);
  await db.insert(siteLayouts).values({ pageKey: "home", sectionsJson, updatedByUserId: actorUserId })
    .onDuplicateKeyUpdate({ set: { sectionsJson, updatedByUserId: actorUserId } });
  invalidateCached(cacheKey("home"));
  return clean;
}
