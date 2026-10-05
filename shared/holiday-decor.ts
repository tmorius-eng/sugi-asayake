/**
 * Баярын чимэглэл (Брэнд студи A4, 2026-10-05): хөдөлгөөнт эффект ба хээ. Баяр бүрт анхдагч
 * "none" — админ Баярын загвар → Тохируулах-аас сонгоно.
 *
 * Зориуд ОРУУЛААГҮЙ: дэнлүү (хятад баярын тэмдэг — Tom монгол соёлоор л гэсэн), хас/түмэн насан
 * хээ (хасын хэлбэр — худалдааны сайт дээр буруу ойлгогдох эрсдэл).
 */
export const HOLIDAY_EFFECTS = ["none", "snow", "petals", "confetti"] as const;
export type HolidayEffect = (typeof HOLIDAY_EFFECTS)[number];
export const EFFECT_LABELS: Record<HolidayEffect, string> = { none: "Байхгүй", snow: "Цас", petals: "Цэцгийн дэлбээ", confetti: "Конфетти" };

export const HOLIDAY_ORNAMENTS = ["none", "alkhan"] as const;
export type HolidayOrnament = (typeof HOLIDAY_ORNAMENTS)[number];
export const ORNAMENT_LABELS: Record<HolidayOrnament, string> = { none: "Байхгүй", alkhan: "Алхан хээ (hero-ийн доор)" };

/**
 * Алхан хээ — дунд шугам дээр дээш/доош ээлжилсэн "алх" (T) хэлбэр, давтагдах 24×20 хавтан.
 * mask-image-д хэрэглэнэ (өнгө нь CSS-ийн background-color → брэнд токен).
 */
export const ORNAMENT_SVG: Record<Exclude<HolidayOrnament, "none">, string> = {
  alkhan: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="20" viewBox="0 0 24 20"><path d="M0 10H24M6 10V4M2 4H10M18 10V16M14 16H22" fill="none" stroke="#000" stroke-width="2" stroke-linecap="square"/></svg>`,
};

export const ornamentDataUri = (key: Exclude<HolidayOrnament, "none">) => `url("data:image/svg+xml,${encodeURIComponent(ORNAMENT_SVG[key])}")`;

export const isHolidayEffect = (value: unknown): value is HolidayEffect => (HOLIDAY_EFFECTS as readonly string[]).includes(value as string);
export const isHolidayOrnament = (value: unknown): value is HolidayOrnament => (HOLIDAY_ORNAMENTS as readonly string[]).includes(value as string);
