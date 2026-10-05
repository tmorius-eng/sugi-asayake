/**
 * Монголын баярын өдрүүд — Брэнд студийн "Баярын хуанли"-ийн тодорхойлолт (2026-10-05).
 *
 * Эх сурвалж: "Нийтээр тэмдэглэх баярын болон тэмдэглэлт өдрүүдийн тухай" хууль
 * (legalinfo.mn/mn/detail/399) — бүх нийтээр амрах 9 баяр; дээр нь дэлгүүрт түгээмэл 4 өдөр.
 *
 * Цагаан сар, Бурхан багшийн Их дүйчин, Чингис хааны мэндэлсэн өдөр нь САРНЫ тооллоор жил бүр
 * өөр огноонд тохиодог. Тэдгээрийг томьёогоор таамаглахгүй — доорх хүснэгтэд баталгаатай
 * огноо л бичнэ; хүснэгтэд байхгүй жилд тэр баяр автоматаар асахгүй (admin огноогоо гараар
 * оруулна, `override`). Цагаан сарын огноо: qppstudio.net / timeanddate (2026–2036 шалгасан).
 */

export type HolidayRule =
  | { type: "fixed"; month: number; day: number; durationDays?: number }
  | { type: "lunar"; table: "tsagaan-sar" | "duichin" | "chinggis"; durationDays?: number };

export interface HolidayDefinition {
  key: string;
  /** Админд харагдах нэр */
  name: string;
  /** Хуулиар бүх нийтээр амрах өдөр эсэх */
  official: boolean;
  rule: HolidayRule;
  /** Баярын эхний өдрөөс хэд хоногийн ӨМНӨ загвар асах (сөрөг тоо) */
  startOffsetDays: number;
  /** Баярын СҮҮЛИЙН өдрөөс хэд хоногийн дараа унтрах (0 = тэр өдрийн төгсгөлд) */
  endOffsetDays: number;
  /** Хоёр баярын цонх давхцвал их нь ялна (жишээ нь 12/29 Шинэ жилийн цонх дотор) */
  priority: number;
  /** Анхдагч мэндчилгээ (hero-ийн дээр) — админ Брэнд студиэс солино/хоосолно */
  greeting: string;
  /** Анхдагч постер (R2: themes/holidays/<хувилбар>/, scripts/upload-theme-assets.ts) — hero-ийн эхний зургийг солино */
  poster: string;
}

/** Сарны тооллын баяруудын ЭХНИЙ өдөр (УБ, YYYY-MM-DD). Баталгаагүй жилийг бичихгүй. */
export const LUNAR_DATES: Record<"tsagaan-sar" | "duichin" | "chinggis", Record<number, string>> = {
  // Цагаан сарын шинийн нэгэн (Битүүн нь өмнөх өдөр)
  "tsagaan-sar": {
    2026: "2026-02-18", 2027: "2027-02-07", 2028: "2028-02-26", 2029: "2029-02-14", 2030: "2030-02-03",
    2031: "2031-02-22", 2032: "2032-02-12", 2033: "2033-01-31", 2034: "2034-02-19", 2035: "2035-02-09", 2036: "2036-02-28",
  },
  // Бурхан багшийн Их дүйчин — зуны тэргүүн сарын 15
  duichin: { 2026: "2026-05-31" },
  // Их Эзэн Чингис хааны мэндэлсэн өдөр — өвлийн тэргүүн сарын шинийн 1
  chinggis: { 2026: "2026-11-10", 2027: "2027-11-29" },
};

/**
 * Постерийн R2 хавтасны хувилбар. R2 объектууд 1 жилийн immutable кэштэй тул постер солих бол
 * шинэ зургийг шинэ хувилбарын хавтсанд upload хийгээд (scripts/upload-theme-assets.ts) энийг ахиулна.
 */
export const HOLIDAY_POSTER_VERSION = "v1";

export const HOLIDAYS: readonly HolidayDefinition[] = [
  { key: "new-year", name: "Шинэ жил", official: true, rule: { type: "fixed", month: 1, day: 1 }, startOffsetDays: -14, endOffsetDays: 1, priority: 50, greeting: "Шинэ оны мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/new-year.webp` },
  { key: "tsagaan-sar", name: "Цагаан сар", official: true, rule: { type: "lunar", table: "tsagaan-sar", durationDays: 3 }, startOffsetDays: -14, endOffsetDays: 1, priority: 90, greeting: "Сар шинэдээ сайхан шинэлээрэй!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/tsagaan-sar.webp` },
  { key: "valentine", name: "Гэгээн Валентины өдөр", official: false, rule: { type: "fixed", month: 2, day: 14 }, startOffsetDays: -7, endOffsetDays: 0, priority: 70, greeting: "Гэгээн Валентины өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/valentine.webp` },
  { key: "womens-day", name: "Олон улсын эмэгтэйчүүдийн өдөр (3/8)", official: true, rule: { type: "fixed", month: 3, day: 8 }, startOffsetDays: -7, endOffsetDays: 0, priority: 70, greeting: "Олон улсын эмэгтэйчүүдийн өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/womens-day.webp` },
  { key: "soldiers-day", name: "Цэргийн баяр (3/18)", official: false, rule: { type: "fixed", month: 3, day: 18 }, startOffsetDays: -4, endOffsetDays: 0, priority: 70, greeting: "Монгол цэргийн баярын мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/soldiers-day.webp` },
  { key: "duichin", name: "Бурхан багшийн Их дүйчин", official: true, rule: { type: "lunar", table: "duichin" }, startOffsetDays: -3, endOffsetDays: 0, priority: 70, greeting: "Бурхан багшийн Их дүйчин өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/duichin.webp` },
  { key: "childrens-day", name: "Эх үрсийн баяр (6/1)", official: true, rule: { type: "fixed", month: 6, day: 1 }, startOffsetDays: -10, endOffsetDays: 0, priority: 70, greeting: "Эх үрсийн баярын мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/childrens-day.webp` },
  { key: "naadam", name: "Үндэсний их баяр наадам", official: true, rule: { type: "fixed", month: 7, day: 10, durationDays: 6 }, startOffsetDays: -14, endOffsetDays: 0, priority: 80, greeting: "Үндэсний их баяр наадмын мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/naadam.webp` },
  { key: "knowledge-day", name: "Мэдлэгийн баяр (9/1)", official: false, rule: { type: "fixed", month: 9, day: 1 }, startOffsetDays: -10, endOffsetDays: 0, priority: 70, greeting: "Мэдлэгийн баярын мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/knowledge-day.webp` },
  { key: "capital-day", name: "Нийслэлийн өдөр (10/29)", official: false, rule: { type: "fixed", month: 10, day: 29 }, startOffsetDays: -3, endOffsetDays: 0, priority: 70, greeting: "Нийслэлийн өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/capital-day.webp` },
  { key: "chinggis", name: "Чингис хааны мэндэлсэн өдөр", official: true, rule: { type: "lunar", table: "chinggis" }, startOffsetDays: -7, endOffsetDays: 0, priority: 75, greeting: "Их Эзэн Чингис хааны мэндэлсэн өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/chinggis.webp` },
  { key: "republic-day", name: "Бүгд Найрамдах Улс тунхагласан өдөр (11/26)", official: true, rule: { type: "fixed", month: 11, day: 26 }, startOffsetDays: -3, endOffsetDays: 0, priority: 70, greeting: "Бүгд Найрамдах Улс тунхагласан өдрийн мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/republic-day.webp` },
  { key: "independence-day", name: "Үндэсний эрх чөлөө, тусгаар тогтнолоо сэргээсний баяр (12/29)", official: true, rule: { type: "fixed", month: 12, day: 29 }, startOffsetDays: -2, endOffsetDays: 0, priority: 60, greeting: "Үндэсний эрх чөлөө, тусгаар тогтнолоо сэргээсний баярын мэнд хүргэе!", poster: `/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/independence-day.webp` },
];

export const HOLIDAY_KEYS = HOLIDAYS.map(h => h.key);
export const getHoliday = (key: string) => HOLIDAYS.find(h => h.key === key) ?? null;
