/**
 * Тухайн өдөр storefront ямар загвартай байхыг шийднэ (2026-10-05). ЦЭВЭР функцүүд —
 * `Date.now()` дуудахгүй, огноо нь УБ-ийн "YYYY-MM-DD" (`ubDateKey()`); тиймээс scheduler-ийн
 * 15 минутын тикээс үл хамааран шөнө дундын шилжилт уншилт дээр яг болно, unit тестэд шууд.
 *
 * Дараалал: (1) admin-ий гараар тавьсан override цонх → (2) асаалттай баярын цонх (priority их
 * нь) → (3) суурь загвар. Баяр зөвхөн өөрийн заасан токен/тохиргоог дарна (`mergeLook`).
 */
import { HOLIDAYS, LUNAR_DATES, type HolidayDefinition } from "./holidays";

const DAY_MS = 86_400_000;
const toUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key: string, days: number) => fromUtc(toUtc(key) + days * DAY_MS);
export const isDateKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;

/** Баярын өөрийнх нь өдрүүд (асах цонх БИШ) тухайн жилд; сарны хүснэгтэд байхгүй бол null. */
export function holidayOccurrence(def: HolidayDefinition, year: number): { start: string; end: string } | null {
  const duration = Math.max(1, def.rule.durationDays ?? 1);
  let start: string | undefined;
  if (def.rule.type === "fixed") {
    start = `${year}-${String(def.rule.month).padStart(2, "0")}-${String(def.rule.day).padStart(2, "0")}`;
  } else {
    start = LUNAR_DATES[def.rule.table][year];
    // Цагаан сарын Битүүн (өмнөх өдөр) баярын өдрүүдэд багтана
    if (start && def.rule.table === "tsagaan-sar") start = addDays(start, -1);
  }
  if (!start) return null;
  const extra = def.rule.type === "lunar" && def.rule.table === "tsagaan-sar" ? 1 : 0;
  return { start, end: addDays(start, duration - 1 + extra) };
}

/** Админы DB-д хадгалсан баярын тохиргоо (site_themes мөрийн holiday хэсэг). */
export interface HolidaySettings {
  enabled: boolean;
  startOffsetDays?: number;
  endOffsetDays?: number;
  /** Гараар тавьсан цонх — байвал дүрмийг үл тоомсорлоно (сарны хүснэгтэд байхгүй жилд ч) */
  overrideStart?: string | null;
  overrideEnd?: string | null;
}

/** Тухайн жилд загвар асах цонх (offset-той); олдохгүй бол null. */
export function holidayWindow(def: HolidayDefinition, year: number, settings?: HolidaySettings): { start: string; end: string } | null {
  if (settings && isDateKey(settings.overrideStart) && isDateKey(settings.overrideEnd)) {
    // Гараар оруулсан огноо ЗӨВХӨН тэр жилд (Шинэ жил шиг жилийн заагтай бол хоёр жилийн аль алинд);
    // бусад жилд дүрэм рүүгээ буцна — эс бөгөөс нэг удаагийн засвар баярыг бүрмөсөн унтраана.
    if (settings.overrideStart.slice(0, 4) === String(year) || settings.overrideEnd.slice(0, 4) === String(year)) {
      return { start: settings.overrideStart, end: settings.overrideEnd };
    }
  }
  const occurrence = holidayOccurrence(def, year);
  if (!occurrence) return null;
  const startOffset = clampOffset(settings?.startOffsetDays ?? def.startOffsetDays, -60, 0);
  const endOffset = clampOffset(settings?.endOffsetDays ?? def.endOffsetDays, 0, 14);
  return { start: addDays(occurrence.start, startOffset), end: addDays(occurrence.end, endOffset) };
}

const clampOffset = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : 0);

export interface ActiveHoliday {
  key: string;
  start: string;
  end: string;
  priority: number;
}

/**
 * Тухайн өдөр идэвхтэй баяр (цонх нь жилийн заагийг давж болно — Шинэ жил 12/18-аас).
 * `settingsByKey`-д `enabled: true` гэсэн баяр л тооцогдоно (анхдагчаар бүгд унтраалттай —
 * admin Брэнд студиэс асаана).
 */
export function activeHoliday(dateKey: string, settingsByKey: Record<string, HolidaySettings | undefined>, defs: readonly HolidayDefinition[] = HOLIDAYS): ActiveHoliday | null {
  if (!isDateKey(dateKey)) return null;
  const year = Number(dateKey.slice(0, 4));
  let best: ActiveHoliday | null = null;
  for (const def of defs) {
    const settings = settingsByKey[def.key];
    if (!settings?.enabled) continue;
    for (const y of [year - 1, year, year + 1]) {
      const window = holidayWindow(def, y, settings);
      if (!window || dateKey < window.start || dateKey > window.end) continue;
      if (!best || def.priority > best.priority || (def.priority === best.priority && window.start > best.start)) {
        best = { key: def.key, start: window.start, end: window.end, priority: def.priority };
      }
    }
  }
  return best;
}

/** Дараагийн асах баяр (admin-д "дараагийнх нь: Цагаан сар, 2027-01-24-нөөс"). 400 хоногийн дотор. */
export function nextHoliday(dateKey: string, settingsByKey: Record<string, HolidaySettings | undefined>, defs: readonly HolidayDefinition[] = HOLIDAYS): ActiveHoliday | null {
  if (!isDateKey(dateKey)) return null;
  const year = Number(dateKey.slice(0, 4));
  let best: ActiveHoliday | null = null;
  for (const def of defs) {
    const settings = settingsByKey[def.key];
    if (!settings?.enabled) continue;
    for (const y of [year, year + 1]) {
      const window = holidayWindow(def, y, settings);
      if (!window || window.start <= dateKey) continue;
      if (!best || window.start < best.start) best = { key: def.key, start: window.start, end: window.end, priority: def.priority };
    }
  }
  return best;
}
