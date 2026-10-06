// Брэнд студи A3 — нүүрний хэсгүүдийн дараалал (2026-10-05, migration 0105). docs/CODEBASE.md §3.1.
// 2026-10-06 (migration 0107): баяр тус бүрийн бүтэц — `themeKey` ('' = глобал, баярын түлхүүр =
// тэр баяр идэвхтэй үед). Баярын мөр байхгүй бол глобал бүтэц (fallback), тиймээс шинэ баяр бүр
// бүтцээ тусад нь тохируулах ШААРДЛАГАГҮЙ.
// Уншилт 30 с кэштэй (indexHtml bootstrap + admin); бичилт кэшийг цэвэрлэнэ, HTML-ийн кэшийг
// роутер цэвэрлэнэ (server/db → _core/indexHtml тойрог import болохгүйн тулд).
import { and, eq } from "drizzle-orm";
import { siteLayouts } from "../../drizzle/schema";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { holidayHomePreset, sanitizeHomeLayout, type HomeSectionEntry } from "../../shared/home-sections";
import { getDb } from "./connection";

const GLOBAL = "";
const cacheKey = (pageKey: string, themeKey: string) => `storefront:layout:${pageKey}:${themeKey}`;
const isMissingTableError = (error: unknown) => /doesn't exist|ER_NO_SUCH_TABLE/.test(String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? ""));
/** Баярын түлхүүр: жижиг латин, тоо, зураас л (DB-д орох түлхүүр хэзээ ч чөлөөт текст биш). */
const themeKeyOf = (themeKey: string | null | undefined) => (themeKey && /^[a-z0-9-]{2,64}$/.test(themeKey) ? themeKey : GLOBAL);

/**
 * Энэ түлхүүрийн ӨӨРИЙН мөр (fallback-гүй). Мөр байхгүй/эвдэрхий/хүснэгтгүй бол null.
 * Хүснэгтэнд `themeKey` багана байхгүй (0107 ороогүй) DB-д глобал мөрийг л уншина.
 */
async function readOwnLayout(themeKey: string): Promise<HomeSectionEntry[] | null> {
  return getOrSetCached(cacheKey("home", themeKey), 30_000, async () => {
    const db = await getDb();
    if (!db) return null;
    try {
      const [row] = await db.select({ sectionsJson: siteLayouts.sectionsJson }).from(siteLayouts).where(and(eq(siteLayouts.pageKey, "home"), eq(siteLayouts.themeKey, themeKey))).limit(1);
      if (!row) return null;
      try { return sanitizeHomeLayout(JSON.parse(row.sectionsJson)); } catch { return null; }
    } catch (error) {
      if (isMissingTableError(error) || /Unknown column 'themeKey'|ER_BAD_FIELD_ERROR/.test(String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? ""))) return null;
      throw error;
    }
  });
}

/**
 * Нүүрний layout. `themeKey` өгвөл: тэр баярын өөрийн бүтэц → баярын бэлэн бүтэц (shared/
 * home-sections.ts) → глобал → кодын анхдагч дараалал.
 */
export async function getHomeLayout(themeKey?: string | null): Promise<HomeSectionEntry[]> {
  const key = themeKeyOf(themeKey);
  if (key !== GLOBAL) {
    const own = await readOwnLayout(key);
    if (own) return own;
    const preset = holidayHomePreset(key);
    if (preset) return preset;
  }
  return (await readOwnLayout(GLOBAL)) ?? sanitizeHomeLayout(null);
}

/** Админд: тэр баярын өөрийн бүтэц байгаа эсэх (глобал руу fallback хийж буй эсэхийг харуулахад). */
export async function hasOwnHomeLayout(themeKey: string | null | undefined): Promise<boolean> {
  const key = themeKeyOf(themeKey);
  if (key === GLOBAL) return true;
  return (await readOwnLayout(key)) !== null;
}

export async function saveHomeLayout(layout: unknown, actorUserId: number | null, themeKey?: string | null): Promise<HomeSectionEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const key = themeKeyOf(themeKey);
  const clean = sanitizeHomeLayout(layout);
  const sectionsJson = JSON.stringify(clean);
  await db.insert(siteLayouts).values({ pageKey: "home", themeKey: key, sectionsJson, updatedByUserId: actorUserId })
    .onDuplicateKeyUpdate({ set: { sectionsJson, updatedByUserId: actorUserId } });
  invalidateCached(cacheKey("home", key));
  return clean;
}

/** Баярын өөрийн бүтцийг устгаж глобал руу буцаана. Глобалыг устгахгүй (тэр нь үргэлж байна). */
export async function resetHolidayHomeLayout(themeKey: string): Promise<void> {
  const key = themeKeyOf(themeKey);
  if (key === GLOBAL) throw new Error("Глобал бүтцийг устгах боломжгүй — «Анхны дараалал» ашиглана уу.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteLayouts).where(and(eq(siteLayouts.pageKey, "home"), eq(siteLayouts.themeKey, key)));
  invalidateCached(cacheKey("home", key));
}

/** Бүх баярын өөрийн бүтэц — exportPack-д. */
export async function listHolidayHomeLayouts(): Promise<{ themeKey: string; sections: HomeSectionEntry[] }[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select({ themeKey: siteLayouts.themeKey, sectionsJson: siteLayouts.sectionsJson }).from(siteLayouts).where(eq(siteLayouts.pageKey, "home"));
    return rows.filter(row => row.themeKey !== GLOBAL).flatMap(row => {
      try { return [{ themeKey: row.themeKey, sections: sanitizeHomeLayout(JSON.parse(row.sectionsJson)) }]; } catch { return []; }
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}
