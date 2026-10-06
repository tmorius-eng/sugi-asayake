// Брэнд студи — storefront-ийн загварууд (2026-10-05, migration 0103–0105). docs/CODEBASE.md §3.1.
//
// Уншилт: `getActiveThemeBundle(dateKey)` — суурь загвар + тухайн өдрийн асаалттай баяр
// (shared/theme-resolver.ts). indexHtml.ts үүнээс `<style id="brand-tokens">` зурна.
// Бичилт: `saveTheme` хадгалах бүртээ өмнөх хувилбарыг `site_theme_versions`-д үлдээнэ
// ("Түүх → Буцаах"). Кэш цэвэрлэлт: энд `storefront:themes`; HTML-ийн кэшийг (indexHtml)
// роутер цэвэрлэнэ — server/db нь _core/indexHtml-ийг импортлохгүй (тойрог import).
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { siteThemeVersions, siteThemes, type SiteThemeRow } from "../../drizzle/schema";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { BASE_THEME, mergeLook, sanitizeLookPatch, type ThemeLook } from "../../shared/theme-tokens";
import { HOLIDAY_KEYS, getHoliday } from "../../shared/holidays";
import { activeHoliday, isDateKey, nextHoliday, type ActiveHoliday, type HolidaySettings } from "../../shared/theme-resolver";
import { getDb } from "./connection";
import { isHolidayEffect, isHolidayOrnament, type HolidayEffect, type HolidayOrnament } from "../../shared/holiday-decor";
import { HOLIDAY_SKIN_LOOKS } from "../../shared/holiday-skin-looks";

const THEMES_CACHE_KEY = "storefront:themes";
const THEMES_CACHE_TTL_MS = 30_000;
const VERSIONS_KEPT = 30;

const isMissingTableError = (error: unknown) => /doesn't exist|ER_NO_SUCH_TABLE/.test(String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? ""));
const parseJson = (json: string | null | undefined): unknown => { if (!json) return null; try { return JSON.parse(json); } catch { return null; } };

/** Бүх загварын мөр (30 с кэш). Migration 0103 ороогүй DB-д хоосон — сайт кодын суурь загвараар ажиллана. */
export async function getThemeRows(): Promise<SiteThemeRow[]> {
  return getOrSetCached(THEMES_CACHE_KEY, THEMES_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(siteThemes).orderBy(siteThemes.id);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  });
}

export function invalidateThemeCache() {
  invalidateCached(THEMES_CACHE_KEY);
}

export interface ThemeExtra {
  /** Баярын мэндчилгээ (hero-ийн дээр). undefined = анхдагч (баярынх), "" = мэндчилгээгүй. */
  greeting?: string | null;
  /** Hero-ийн эхний зургийг солих постер — хоосон бол баярын анхдагч постер (shared/holidays.ts) */
  posterUrl?: string | null;
  /** false = баярын үед hero-ийн зургийг солихгүй */
  showPoster?: boolean;
  /** Хөдөлгөөнт чимэглэл ба хээ (A4, shared/holiday-decor.ts) — анхдагч "none" */
  effect?: HolidayEffect;
  ornament?: HolidayOrnament;
  /** Баярын бүтэн-сайтын загвар (skin, 2026-10-06). false = унтраасан (зөвхөн өнгө/постер); undefined = асаалттай. */
  skin?: boolean;
}

// Постер нь сайтын дотоод зам эсвэл https хаяг л (CSP-ийн img-src-д багтах, `javascript:` биш).
const safeImageUrl = (value: unknown): string | null =>
  typeof value === "string" && (/^\/(?![/\\])[\w./-]+$/.test(value.trim()) || /^https:\/\/[^\s"'<>]+$/i.test(value.trim())) ? value.trim().slice(0, 500) : null;

const readExtra = (row: SiteThemeRow | undefined): ThemeExtra => {
  const raw = parseJson(row?.extraJson) as Record<string, unknown> | null;
  const greeting = typeof raw?.greeting === "string" ? raw.greeting.trim().slice(0, 200) : raw?.greeting === null ? null : undefined;
  return {
    greeting,
    posterUrl: safeImageUrl(raw?.posterUrl),
    showPoster: raw?.showPoster === false ? false : undefined,
    effect: isHolidayEffect(raw?.effect) ? raw.effect : undefined,
    ornament: isHolidayOrnament(raw?.ornament) ? raw.ornament : undefined,
    skin: raw?.skin === false ? false : undefined,
  };
};

const readHolidaySettings = (row: SiteThemeRow): HolidaySettings => {
  const raw = (parseJson(row.holidayJson) ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    enabled: raw.enabled === true,
    startOffsetDays: num(raw.startOffsetDays),
    endOffsetDays: num(raw.endOffsetDays),
    overrideStart: isDateKey(raw.overrideStart) ? raw.overrideStart : null,
    overrideEnd: isDateKey(raw.overrideEnd) ? raw.overrideEnd : null,
  };
};

export interface ActiveThemeBundle {
  dateKey: string;
  /** Идэвхтэй загварын түлхүүр: 'base', баярын түлхүүр, эсвэл урьдчилан харж буй загвар */
  activeKey: string;
  reason: "base" | "holiday" | "preview";
  look: ThemeLook;
  greeting: string | null;
  /** Баярын постер — hero-ийн эхний зургийг солино (indexHtml + content.siteMedia ижил газраас) */
  poster: string | null;
  /** Баярын чимэглэл (A4) — үндсэн загварт үргэлж "none" */
  effect: HolidayEffect;
  ornament: HolidayOrnament;
  /** Бүтэн-сайтын загвар (skin) асаалттай эсэх — файл байгаа эсэхийг indexHtml шалгана. */
  skin: boolean;
  holiday: ActiveHoliday | null;
  next: ActiveHoliday | null;
}

/**
 * Тухайн УБ өдрийн загвар. `previewKey` (admin-ий урьдчилан харах) нь баярын дүрмийг
 * алгасаж тэр загварыг суурь дээр давхарлана. Мөр байхгүй/эвдэрхий бол кодын BASE_THEME.
 */
export async function getActiveThemeBundle(dateKey: string, previewKey?: string | null): Promise<ActiveThemeBundle> {
  const rows = await getThemeRows();
  const baseRow = rows.find(row => row.themeKey === "base");
  const baseLook = mergeLook(BASE_THEME, parseJson(baseRow?.lookJson));
  const settingsByKey: Record<string, HolidaySettings> = {};
  for (const row of rows) if (row.kind === "holiday" && HOLIDAY_KEYS.includes(row.themeKey)) settingsByKey[row.themeKey] = readHolidaySettings(row);
  const holiday = activeHoliday(dateKey, settingsByKey);
  const next = nextHoliday(dateKey, settingsByKey);

  const decorate = (themeKey: string, row: SiteThemeRow | undefined) => {
    const extra = readExtra(row);
    const def = getHoliday(themeKey);
    // Мэндчилгээ: хадгалаагүй бол баярын анхдагч, "" хадгалсан бол байхгүй.
    const greeting = extra.greeting === undefined ? def?.greeting ?? null : extra.greeting || null;
    const poster = def && extra.showPoster !== false ? extra.posterUrl ?? def.poster : null;
    return { greeting, poster, effect: extra.effect ?? "none", ornament: extra.ornament ?? "none", skin: extra.skin !== false };
  };

  // Баярын look = суурь → skin-ийн анхдагч өнгө (skin асаалттай бол) → админы хадгалсан өөрчлөлт.
  const holidayLook = (themeKey: string, row: SiteThemeRow | undefined) => {
    const skinLook = readExtra(row).skin !== false ? HOLIDAY_SKIN_LOOKS[themeKey] : undefined;
    return mergeLook(skinLook ? mergeLook(baseLook, skinLook) : baseLook, parseJson(row?.lookJson));
  };
  const previewRow = previewKey ? rows.find(row => row.themeKey === previewKey) : undefined;
  if (previewKey && previewKey !== "base" && (previewRow || getHoliday(previewKey))) {
    return { dateKey, activeKey: previewKey, reason: "preview", look: holidayLook(previewKey, previewRow), ...decorate(previewKey, previewRow), holiday, next };
  }
  if (holiday) {
    const row = rows.find(r => r.themeKey === holiday.key);
    return { dateKey, activeKey: holiday.key, reason: "holiday", look: holidayLook(holiday.key, row), ...decorate(holiday.key, row), holiday, next };
  }
  const baseExtra = readExtra(baseRow);
  return { dateKey, activeKey: "base", reason: "base", look: baseLook, greeting: baseExtra.greeting || null, poster: null, effect: "none", ornament: "none", skin: false, holiday: null, next };
}

export interface SaveThemeInput {
  themeKey: string;
  name?: string;
  look?: unknown;
  extra?: ThemeExtra;
  holiday?: Partial<HolidaySettings>;
  note?: string | null;
}

const kindFor = (themeKey: string): SiteThemeRow["kind"] => (themeKey === "base" ? "base" : HOLIDAY_KEYS.includes(themeKey) ? "holiday" : "custom");
const defaultName = (themeKey: string) => (themeKey === "base" ? "Үндсэн загвар" : getHoliday(themeKey)?.name ?? themeKey);

/**
 * Загварыг үүсгэнэ/шинэчилнэ. Байгаа мөрийг дарахаас ӨМНӨ snapshot-ийг хувилбар болгоно;
 * нэг транзакц тул хоёр admin зэрэг хадгалбал хувилбарын дугаар давхардахгүй (UNIQUE).
 */
export async function saveTheme(input: SaveThemeInput, actorUserId: number | null): Promise<SiteThemeRow> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!/^[a-z0-9-]{2,64}$/.test(input.themeKey)) throw new Error("Загварын түлхүүр буруу байна.");
  const saved = await db.transaction(async tx => {
    const [existing] = await tx.select().from(siteThemes).where(eq(siteThemes.themeKey, input.themeKey)).for("update").limit(1);
    const look = input.look !== undefined ? sanitizeLookPatch(input.look) : (parseJson(existing?.lookJson) ?? {});
    const extra = input.extra !== undefined ? { ...readExtra(existing), ...input.extra, posterUrl: input.extra.posterUrl !== undefined ? safeImageUrl(input.extra.posterUrl) : readExtra(existing).posterUrl } : readExtra(existing);
    const holiday = input.holiday !== undefined ? { ...(existing ? readHolidaySettings(existing) : { enabled: false }), ...input.holiday } : existing ? readHolidaySettings(existing) : null;
    const values = {
      name: (input.name ?? existing?.name ?? defaultName(input.themeKey)).trim().slice(0, 120) || defaultName(input.themeKey),
      kind: kindFor(input.themeKey),
      lookJson: JSON.stringify(look),
      extraJson: JSON.stringify(extra),
      holidayJson: holiday && kindFor(input.themeKey) === "holiday" ? JSON.stringify(holiday) : null,
      updatedByUserId: actorUserId,
    };
    if (existing) {
      const [{ maxVersion }] = await tx.select({ maxVersion: sql<number>`COALESCE(MAX(${siteThemeVersions.version}), 0)` }).from(siteThemeVersions).where(eq(siteThemeVersions.themeId, existing.id));
      const version = Number(maxVersion) + 1;
      await tx.insert(siteThemeVersions).values({ themeId: existing.id, version, snapshotJson: JSON.stringify(existing), note: input.note?.slice(0, 200) ?? null, createdByUserId: actorUserId });
      if (version > VERSIONS_KEPT) await tx.delete(siteThemeVersions).where(and(eq(siteThemeVersions.themeId, existing.id), lt(siteThemeVersions.version, version - VERSIONS_KEPT + 1)));
      await tx.update(siteThemes).set(values).where(eq(siteThemes.id, existing.id));
    } else {
      await tx.insert(siteThemes).values({ themeKey: input.themeKey, ...values });
    }
    const [row] = await tx.select().from(siteThemes).where(eq(siteThemes.themeKey, input.themeKey)).limit(1);
    return row;
  });
  invalidateThemeCache();
  return saved;
}

/** Загварын хувилбарууд (шинэ нь эхэнд). */
export async function listThemeVersions(themeKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: siteThemeVersions.id, version: siteThemeVersions.version, note: siteThemeVersions.note, createdAt: siteThemeVersions.createdAt, createdByUserId: siteThemeVersions.createdByUserId })
    .from(siteThemeVersions).innerJoin(siteThemes, eq(siteThemes.id, siteThemeVersions.themeId))
    .where(eq(siteThemes.themeKey, themeKey)).orderBy(desc(siteThemeVersions.version)).limit(VERSIONS_KEPT);
}

/** Хуучин хувилбарыг сэргээнэ — өөрөө ШИНЭ хувилбар болж хадгалагдана (буцаалтыг ч буцааж болно). */
export async function rollbackTheme(themeKey: string, version: number, actorUserId: number | null): Promise<SiteThemeRow> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [snap] = await db.select({ snapshotJson: siteThemeVersions.snapshotJson })
    .from(siteThemeVersions).innerJoin(siteThemes, eq(siteThemes.id, siteThemeVersions.themeId))
    .where(and(eq(siteThemes.themeKey, themeKey), eq(siteThemeVersions.version, version))).limit(1);
  if (!snap) throw new Error("Энэ хувилбар олдсонгүй.");
  const old = parseJson(snap.snapshotJson) as Partial<SiteThemeRow> | null;
  if (!old) throw new Error("Хувилбар эвдэрсэн байна.");
  return saveTheme({
    themeKey,
    name: old.name,
    look: parseJson(old.lookJson),
    extra: readExtra(old as SiteThemeRow),
    // Баярын мөрийн snapshot-д holidayJson null = тэр үед хэзээ ч асаагаагүй → унтраалттай болгож сэргээнэ.
    holiday: (parseJson(old.holidayJson) as Partial<HolidaySettings> | null) ?? (kindFor(themeKey) === "holiday" ? { enabled: false } : undefined),
    note: `Буцаав: хувилбар ${version}`,
  }, actorUserId);
}
