import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import sharp from "sharp";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BASE_THEME, mergeLook, sanitizeLookPatch } from "../shared/theme-tokens";
import { checkLookContrast } from "../shared/color/contrast";
import { derivePalettes, pickBrandColor, quantize, type Rgb } from "../shared/color/palette";
import { getSiteMediaSlot } from "../shared/site-media";
import { HOLIDAYS, getHoliday } from "../shared/holidays";
import { holidayOccurrence, holidayWindow, isDateKey, type HolidaySettings } from "../shared/theme-resolver";
import { ubDateKey } from "../shared/notification-events";
import { getActiveThemeBundle, getHomeLayout, saveHomeLayout, getSiteMedia, getThemeRows, listThemeVersions, logAdminAction, rollbackTheme, saveTheme } from "./db";
import { storageGetSignedUrl } from "./storage";
import { storageKeyOf } from "./_core/publicUrl";
import { invalidateIndexHtmlCache } from "./_core/indexHtml";
import { marketingProcedure, router } from "./_core/trpc";

/**
 * /admin → Брэнд студи (2026-10-05, A1). `admin.brandStudio.*` — `admin.` угтвартай тул
 * trpcBatchGuard-ийн PRIVILEGED_PREFIXES ба клиентийн splitLink хэвээр хамгаална.
 *
 * Хадгалах бүрт: (1) AA хамгаалалт — унших боломжгүй өнгөний хослолыг серверт ч татгалзана
 * (клиент товчийг хаадаг ч API-г шууд дуудаж болно), (2) хувилбар үлдээнэ (`saveTheme`),
 * (3) HTML-ийн кэшийг цэвэрлэнэ — `<style id="brand-tokens">` дараагийн хүсэлтэд шинэ утгатай.
 */
const themeKeySchema = z.string().regex(/^[a-z0-9-]{2,64}$/, "Загварын түлхүүр буруу байна.");
const holidaySchema = z.object({
  enabled: z.boolean().optional(),
  startOffsetDays: z.number().int().min(-60).max(0).optional(),
  endOffsetDays: z.number().int().min(0).max(14).optional(),
  overrideStart: z.string().refine(isDateKey, "Огноо буруу").nullable().optional(),
  overrideEnd: z.string().refine(isDateKey, "Огноо буруу").nullable().optional(),
});

const readJson = (json: string | null | undefined): unknown => { if (!json) return null; try { return JSON.parse(json); } catch { return null; } };

/** Логоны байт: R2-д байвал signed URL-аар, кодын анхдагч бол public хавтаснаас (production: dist/public). */
async function readLogoBytes(url: string): Promise<Buffer> {
  const key = storageKeyOf(url);
  if (key) {
    const response = await fetch(await storageGetSignedUrl(key), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`logo fetch ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (!url.startsWith("/") || url.includes("..")) throw new Error("unsupported logo url");
  for (const dir of [join(process.cwd(), "dist", "public"), join(process.cwd(), "client", "public")]) {
    const file = normalize(join(dir, url));
    if (file.startsWith(dir) && existsSync(file)) return readFile(file);
  }
  throw new Error("logo file not found");
}

export const brandStudioRouter = router({
  /** Бүх загвар + 13 баярын энэ/дараа жилийн цонх, одоо идэвхтэй загвар. */
  overview: marketingProcedure.query(async () => {
    const today = ubDateKey();
    const year = Number(today.slice(0, 4));
    const [rows, active] = await Promise.all([getThemeRows(), getActiveThemeBundle(today)]);
    const byKey = new Map(rows.map(row => [row.themeKey, row]));
    const base = byKey.get("base");
    const baseLook = mergeLook(BASE_THEME, readJson(base?.lookJson));
    const holidays = HOLIDAYS.map(def => {
      const row = byKey.get(def.key);
      const settings = (readJson(row?.holidayJson) ?? { enabled: false }) as HolidaySettings;
      // Энэ жилийн цонх дууссан бол дараа жилийнхийг харуулна (Шинэ жилийн цонх өмнөх жилийн 12-р сард эхэлдэг тул жил бүрт өөрийн цонх).
      const upcoming = [year, year + 1]
        .map(y => ({ window: holidayWindow(def, y, settings), occurrence: holidayOccurrence(def, y) }))
        .find(entry => entry.window && entry.window.end >= today) ?? { window: null, occurrence: null };
      const { window, occurrence } = upcoming;
      return {
        key: def.key,
        name: def.name,
        official: def.official,
        priority: def.priority,
        lunar: def.rule.type === "lunar",
        defaultGreeting: def.greeting,
        defaultPoster: def.poster,
        posterUrl: ((readJson(row?.extraJson) as { posterUrl?: string } | null)?.posterUrl) ?? null,
        showPoster: ((readJson(row?.extraJson) as { showPoster?: boolean } | null)?.showPoster) !== false,
        settings: { enabled: settings.enabled === true, startOffsetDays: settings.startOffsetDays ?? null, endOffsetDays: settings.endOffsetDays ?? null, overrideStart: settings.overrideStart ?? null, overrideEnd: settings.overrideEnd ?? null },
        defaultOffsets: { start: def.startOffsetDays, end: def.endOffsetDays },
        window,
        occurrence,
        look: readJson(row?.lookJson) ?? {},
        greeting: ((readJson(row?.extraJson) as { greeting?: string } | null)?.greeting) ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
    return {
      today,
      codeBase: BASE_THEME,
      base: { look: baseLook, patch: readJson(base?.lookJson) ?? {}, greeting: ((readJson(base?.extraJson) as { greeting?: string } | null)?.greeting) ?? null, updatedAt: base?.updatedAt ?? null },
      holidays,
      active: { key: active.activeKey, reason: active.reason, holiday: active.holiday, next: active.next },
    };
  }),

  save: marketingProcedure.input(z.object({
    themeKey: themeKeySchema,
    look: z.unknown().optional(),
    // null = баярын анхдагч мэндчилгээ руу буцаах, "" = мэндчилгээгүй
    greeting: z.string().max(200).nullable().optional(),
    // Постер: дотоод зам (/cdn/…, /images/…) эсвэл https; null = анхдагч постер
    posterUrl: z.string().max(500).nullable().optional(),
    showPoster: z.boolean().optional(),
    holiday: holidaySchema.optional(),
    note: z.string().max(200).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    if (input.themeKey !== "base" && !getHoliday(input.themeKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "Ийм загвар байхгүй." });
    if (input.look !== undefined) {
      // Баярын загвар суурийн ДЭЭР давхарлагдана — шалгалт ч тэр нийлбэр дээр.
      const rows = await getThemeRows();
      const baseLook = mergeLook(BASE_THEME, readJson(rows.find(row => row.themeKey === "base")?.lookJson));
      const merged = input.themeKey === "base" ? mergeLook(BASE_THEME, input.look) : mergeLook(baseLook, input.look);
      const failing = checkLookContrast(merged).filter(result => !result.ok);
      if (failing.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Унших боломжгүй өнгө: ${failing.slice(0, 3).map(f => `${f.label} (${f.ratio}:1)`).join(", ")}. "Засах" товчоор AA (4.5:1) болгоно уу.` });
      }
      // Суурь солигдоход хадгалсан баярын patch шинэ суурь дээр давхарлагдана — тэднийг ч шалгана.
      if (input.themeKey === "base") {
        const broken = rows
          .filter(row => row.kind === "holiday" && row.lookJson && row.lookJson !== "{}")
          .filter(row => checkLookContrast(mergeLook(merged, readJson(row.lookJson))).some(result => !result.ok))
          .map(row => getHoliday(row.themeKey)?.name ?? row.themeKey);
        if (broken.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Энэ суурь дээр дараах баярын өнгө уншигдахгүй болно: ${broken.slice(0, 3).join(", ")}. Эхлээд тэдгээрийн өнгийг засна уу.` });
        }
      }
    }
    const holiday = input.holiday;
    if (holiday?.overrideStart && holiday.overrideEnd && holiday.overrideStart > holiday.overrideEnd) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Эхлэх огноо дуусах огнооноос хойш байна." });
    }
    const row = await saveTheme({
      themeKey: input.themeKey,
      look: input.look,
      extra: input.greeting !== undefined || input.posterUrl !== undefined || input.showPoster !== undefined ? {
        ...(input.greeting !== undefined ? { greeting: input.greeting === null ? undefined : input.greeting } : {}),
        ...(input.posterUrl !== undefined ? { posterUrl: input.posterUrl } : {}),
        ...(input.showPoster !== undefined ? { showPoster: input.showPoster } : {}),
      } : undefined,
      holiday,
      note: input.note ?? null,
    }, ctx.user.id);
    invalidateIndexHtmlCache();
    await logAdminAction({ actorUserId: ctx.user.id, action: "theme.saved", entityType: "site_theme", entityId: row.id, metadata: { themeKey: input.themeKey, look: input.look !== undefined ? sanitizeLookPatch(input.look) : undefined, holiday } });
    return { ok: true, updatedAt: row.updatedAt };
  }),

  /**
   * Лого → 3 палитр (A2). Брэндийн лого слотыг (/admin → Content & Media) уншиж, тунгалаг пикселийг
   * алгасаад median-cut. Логон дээр ханасан өнгө байхгүй бол `brand: null` — админд тайлбарлана.
   */
  derivePalette: marketingProcedure.mutation(async () => {
    const media = await getSiteMedia();
    const url = media.find(row => row.slotKey === "brand-logo")?.imageUrl || getSiteMediaSlot("brand-logo").fallbackUrl;
    if (!url) throw new TRPCError({ code: "BAD_REQUEST", message: "Лого байршуулаагүй байна (Content & Media → Сайтын лого)." });
    let raw: { data: Buffer; info: { channels: number } };
    try {
      raw = await sharp(await readLogoBytes(url)).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Логог уншиж чадсангүй. PNG/WEBP логогоо дахин байршуулна уу." });
    }
    const pixels: Rgb[] = [];
    for (let i = 0; i < raw.data.length; i += raw.info.channels) {
      if (raw.data[i + 3] < 128) continue; // тунгалаг дэвсгэр
      pixels.push([raw.data[i], raw.data[i + 1], raw.data[i + 2]]);
    }
    const swatches = quantize(pixels, 8);
    const brand = pickBrandColor(swatches);
    return { logoUrl: url, brand, swatches: swatches.slice(0, 6), palettes: brand ? derivePalettes(brand) : [] };
  }),

  /** Нүүрний бүтэц (A3): hero тогтмол эхэнд, бусад хэсгийн дараалал/нуулт/хувилбар. */
  homeLayout: marketingProcedure.query(() => getHomeLayout()),
  saveHomeLayout: marketingProcedure.input(z.object({
    sections: z.array(z.object({ key: z.string().max(40), visible: z.boolean(), variant: z.string().max(40) })).max(40),
  })).mutation(async ({ ctx, input }) => {
    const saved = await saveHomeLayout(input.sections, ctx.user.id);
    invalidateIndexHtmlCache();
    await logAdminAction({ actorUserId: ctx.user.id, action: "layout.saved", entityType: "site_layout", entityId: null, metadata: { page: "home", sections: saved.map(s => `${s.visible ? "" : "-"}${s.key}:${s.variant}`) } });
    return saved;
  }),

  versions: marketingProcedure.input(z.object({ themeKey: themeKeySchema })).query(({ input }) => listThemeVersions(input.themeKey)),

  rollback: marketingProcedure.input(z.object({ themeKey: themeKeySchema, version: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const row = await rollbackTheme(input.themeKey, input.version, ctx.user.id).catch((error: Error) => {
      // Зөвхөн өөрийн мэдэгдэх хоёр мессеж — driver/DB алдааг клиент рүү дамжуулахгүй (PROJECT-GUIDE).
      if (/олдсонгүй|эвдэрсэн/.test(error.message)) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      throw error;
    });
    invalidateIndexHtmlCache();
    await logAdminAction({ actorUserId: ctx.user.id, action: "theme.rolledBack", entityType: "site_theme", entityId: row.id, metadata: { themeKey: input.themeKey, version: input.version } });
    return { ok: true };
  }),
});
