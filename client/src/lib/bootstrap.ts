/**
 * Серверийн бөглөж өгсөн `#storefront-bootstrap` JSON блок (2026-09-21).
 *
 * indexHtml.ts нь HTML-ийг 60 с кэштэй үүсгэхдээ storefront-ийн эхний render-д
 * хэрэгтэй гурван жижиг хүснэгтийг (site media, site text, идэвхтэй promo)
 * хамт өгдөг. Хэрэглэгч тал тэднийг react-query-ийн `initialData` болгож
 * (`initialDataUpdatedAt` = хуудас ирсэн мөч) ашиглана: hero, лого, гарчиг,
 * зарын зурвас бүгд ЭХНИЙ render-дээ бодит утгатай, tRPC-г хүлээхгүй, дараа нь
 * "солигдож анивчих" зүйл байхгүй. Query нь арын горимд дахин татсаар байдаг
 * тул admin-ий шинэ upload хэвийн ирнэ.
 *
 * Блок алга/эвдэрхий (жишээ нь `pnpm dev`-ийн Vite HTML placeholder-ыг
 * бөглөдөггүй) бол `null` — hook бүр ердийн query руу буцна.
 *
 * `<` тэмдэгтийг сервер `<` болгодог тул `</script>` тасрахгүй; superjson-
 * оор Date ирдэг талбаруудыг (`…At`) энд буцааж Date болгоно.
 */
type Bootstrap = Record<string, unknown>;

const parsed: { data: Bootstrap; at: number } | null = (() => {
  if (typeof document === "undefined") return null;
  try {
    const block = document.getElementById("storefront-bootstrap");
    if (!block?.textContent) return null;
    const data = JSON.parse(block.textContent) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return { data: data as Bootstrap, at: Date.now() };
  } catch {
    return null;
  }
})();

const reviveDates = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" && key.endsWith("At") ? new Date(entry) : reviveDates(entry),
    ]));
  }
  return value;
};

/** Нэг хэсгийг (`siteMedia` гэх мэт) `initialData`-д бэлэн хэлбэрээр; байхгүй бол null. */
export function bootstrapSlice<T>(key: string): { data: T; at: number } | null {
  if (!parsed || !(key in parsed.data)) return null;
  return { data: reviveDates(parsed.data[key]) as T, at: parsed.at };
}
