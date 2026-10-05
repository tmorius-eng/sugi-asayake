/**
 * Баярын постер hero-д (2026-10-05, Брэнд студи A4). Баяр идэвхтэй үед `home-hero` слотын зургийг
 * постероор НЭГ газар сольж, бүх хэрэглэгч ижил URL авна: indexHtml (preload, hero shell,
 * bootstrap) болон `content.siteMedia` (React-ийн refetch). Хоёр газар өөр URL өгвөл React ирэх
 * мөчид hero солигдож үсэрнэ — heroShell-ийн дүрэм.
 */
export const HOLIDAY_HERO_SLOT = "home-hero";

export function withHolidayPoster<T extends { slotKey: string; imageUrl: string }>(media: T[], poster: string | null): T[] {
  if (!poster) return media;
  if (media.some(row => row.slotKey === HOLIDAY_HERO_SLOT)) {
    return media.map(row => (row.slotKey === HOLIDAY_HERO_SLOT ? { ...row, imageUrl: poster } : row));
  }
  // Админ hero upload хийгээгүй (кодын анхдагч зураг) — постерийг слотын мөр болгож нэмнэ.
  const epoch = new Date(0);
  return [...media, { id: 0, slotKey: HOLIDAY_HERO_SLOT, imageUrl: poster, altText: null, updatedByUserId: 0, createdAt: epoch, updatedAt: epoch } as unknown as T];
}
