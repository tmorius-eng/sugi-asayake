export type CatalogSearchItem = {
  categoryName?: string | null;
  name: string;
  brand?: string | null;
  shortDescription?: string | null;
};

export type CatalogDiscoveryItem = CatalogSearchItem & {
  priceMnt: number;
  stockQuantity: number;
};

// A product is "low stock" once it's this close to selling out entirely —
// shared by the Shop grid and ProductDetail so the threshold can't drift
// between the two places it's rendered.
export const LOW_STOCK_THRESHOLD = 5;

// 2026-09-07 (bsb.mn mobile-UX pass): ProductDetail previously showed nothing
// at all once stock was healthy (only ever rendered a warning line below
// LOW_STOCK_THRESHOLD) -- this gives every stock level an honest label
// without ever inventing a number. Deliberately NOT the same convention as
// Shop.tsx's grid cards (which already show the exact raw count on every
// tile unconditionally, a different, already-working pattern for a
// different, denser context) -- a precise "237 ширхэг үлдсэн" reads as
// oddly fussy on a product's own page, so the healthy tier states
// availability without a number at all.
export function getStockStatusLabel(stockQuantity: number): { label: string; tone: "out" | "low" | "in" } {
  if (stockQuantity <= 0) return { label: "Нөөц дууссан", tone: "out" };
  if (stockQuantity <= LOW_STOCK_THRESHOLD) return { label: `Зөвхөн ${stockQuantity} ширхэг үлдсэн — удахгүй дуусна!`, tone: "low" };
  return { label: "Нөөцөд бэлэн", tone: "in" };
}

// Sale badge (asahi.mn-style strikethrough price + "-X%"): compareAtPriceMnt
// is the admin-entered "was" price. Only a real markdown counts — an equal
// or lower compareAtPriceMnt is just bad data entry, not a sale.
export function getSalePercent(priceMnt: number, compareAtPriceMnt?: number | null): number | null {
  if (!compareAtPriceMnt || compareAtPriceMnt <= priceMnt) return null;
  return Math.round((1 - priceMnt / compareAtPriceMnt) * 100);
}

// PHASE 2 of product variants: "Хэмжээ: 400мл" / "Өнгө: Хар · Хэмжээ: M" for
// a cart/order line's chosen option — null (renders nothing) rather than a
// sku fallback, since most lines are still the single-variant common case
// with no attributesJson at all, and a bare barcode string wouldn't mean
// anything to a shopper the way it does as a picker's own label.
export function formatVariantAttributes(attributesJson?: string | null): string | null {
  if (!attributesJson) return null;
  try {
    const attributes = JSON.parse(attributesJson) as Record<string, string>;
    const parts = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`);
    return parts.length ? parts.join(" · ") : null;
  } catch {
    return null;
  }
}

// Real photos are still missing for most of the 937-product POS import (see
// PRODUCT-IMPORT.md) — rather than one generic bottle icon for every
// category, each of the 6 real categories gets its own on-brand line-art
// placeholder (client/public/category-placeholder-*.svg), so a shampoo at
// least looks like a shampoo instead of a random skincare dropper bottle.
// Unrecognized/missing category slugs fall back to the original generic one.
const categoryPlaceholders: Record<string, string> = {
  "arhis-archilgaa": "/category-placeholder-skincare.svg", // Арьс арчилгаа
  "goo-saikhan": "/category-placeholder-beauty.svg", // Гоо сайхан
  "eruul-mend": "/category-placeholder-health.svg", // Эрүүл мэнд
  "eruul-akhui": "/category-placeholder-hygiene.svg", // Эрүүл ахуй
  "us-ba-bie": "/category-placeholder-hairbody.svg", // Үс ба бие
  "eej-ba-khuukhed": "/category-placeholder-motherchild.svg", // Ээж ба хүүхэд
};

export function getCategoryPlaceholderImage(categorySlug?: string | null): string {
  return (categorySlug && categoryPlaceholders[categorySlug]) || "/product-placeholder.svg";
}

export type CatalogSortOption = "featured" | "price-low" | "price-high" | "name-asc";

export function getCatalogCategories<T extends CatalogSearchItem>(products: T[]) {
  return Array.from(new Set(products.map(product => product.categoryName).filter((category): category is string => Boolean(category))));
}

export function filterCatalogProducts<T extends CatalogSearchItem>(products: T[], search: string, category: string) {
  const needle = search.trim().toLocaleLowerCase();
  return products.filter(product => {
    const matchesCategory = category === "all" || product.categoryName === category;
    const searchable = [product.name, product.brand, product.shortDescription, product.categoryName].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesCategory && (!needle || searchable.includes(needle));
  });
}

export function filterCatalogStock<T extends CatalogDiscoveryItem>(products: T[], inStockOnly: boolean) {
  return inStockOnly ? products.filter(product => product.stockQuantity > 0) : products;
}

export function sortCatalogProducts<T extends CatalogDiscoveryItem>(products: T[], sort: CatalogSortOption) {
  const copy = [...products];
  if (sort === "price-low") return copy.sort((a, b) => a.priceMnt - b.priceMnt);
  if (sort === "price-high") return copy.sort((a, b) => b.priceMnt - a.priceMnt);
  if (sort === "name-asc") return copy.sort((a, b) => a.name.localeCompare(b.name, "mn"));
  return copy;
}

// PREMIUM-FEATURES.md TIER 1: skin-type filter pill, alongside the existing
// category pills — mirrors the admin panel's skinTypeLabels.
export type SkinType = "dry" | "oily" | "combination" | "sensitive" | "normal";

export const skinTypeLabels: Record<SkinType, string> = {
  dry: "Хуурай",
  oily: "Тослог",
  combination: "Холимог",
  sensitive: "Мэдрэмтгий",
  normal: "Хэвийн",
};

export type CatalogSkinTypeItem = {
  skinType?: SkinType | null;
};

export function getCatalogSkinTypes<T extends CatalogSkinTypeItem>(products: T[]) {
  const order: SkinType[] = ["dry", "oily", "combination", "sensitive", "normal"];
  const present = new Set(products.map(product => product.skinType).filter((value): value is SkinType => Boolean(value)));
  return order.filter(type => present.has(type));
}

export function filterCatalogSkinType<T extends CatalogSkinTypeItem>(products: T[], skinType: SkinType | "all") {
  return skinType === "all" ? products : products.filter(product => product.skinType === skinType);
}

// NEWVISION.md §5: the homepage's "Топ брэндүүд" tiles link to /shop?brand=X
// -- without this, they'd be links that filter nothing (Shop.tsx had no
// brand facet at all before this). Exact match against the real
// products.brand string, same convention as category (also an exact match,
// not a substring search).
export function filterCatalogBrand<T extends CatalogSearchItem>(products: T[], brand: string) {
  return !brand || brand === "all" ? products : products.filter(product => product.brand === brand);
}

// NEWVISION.md §14 (Phase 2): Isetan's deep faceted filter, starting with a
// price range -- alongside category/brand/skinType, all exact-facet filters
// composed the same way in getPublishedCatalogPage/Shop.tsx's searchFiltered
// pipeline. Either bound is optional (a shopper who only sets a floor or
// only a ceiling shouldn't need to know/guess the other), and both are
// inclusive so a bound typed as exactly a product's price still matches.
export function filterCatalogPriceRange<T extends CatalogDiscoveryItem>(products: T[], minPriceMnt?: number | null, maxPriceMnt?: number | null): T[] {
  if (minPriceMnt == null && maxPriceMnt == null) return products;
  return products.filter(product => {
    if (minPriceMnt != null && product.priceMnt < minPriceMnt) return false;
    if (maxPriceMnt != null && product.priceMnt > maxPriceMnt) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Preference Profile v2 (2026-09-01) — recommendation engine v2 vocabulary
// and pure scoring. Label maps here are the single source of truth for the
// NEW fields (the older skinType/skinConcerns/interiorStyle vocabularies
// stay defined where they already were, in client/src/pages/Profile.tsx
// and client/src/components/AdminWorkspace.tsx — a known small drift risk
// documented there, not introduced here) so the profile quiz wizard and
// the admin "PERSONALIZATION TAGS" panel render the exact same labels.
// ---------------------------------------------------------------------

export type HairType = "dry" | "oily" | "normal" | "damaged" | "color_treated";
export const hairTypeLabels: Record<HairType, string> = {
  dry: "Хуурай",
  oily: "Тослог",
  normal: "Хэвийн",
  damaged: "Гэмтсэн",
  color_treated: "Будаг/хими хийсэн",
};

export type FragrancePreference = "unscented" | "light" | "floral" | "citrus";
export const fragrancePreferenceLabels: Record<FragrancePreference, string> = {
  unscented: "Үнэргүй",
  light: "Хөнгөн үнэртэй",
  floral: "Цэцгийн үнэртэй",
  citrus: "Цитрус/шинэлэг үнэртэй",
};

export type SkinRoutineComplexity = "minimal" | "moderate" | "extensive";
export const skinRoutineComplexityLabels: Record<SkinRoutineComplexity, string> = {
  minimal: "Энгийн (цэвэрлэгч+тос)",
  moderate: "Дунд зэрэг (+тонер/серум)",
  extensive: "Иж бүрэн (5+ алхам)",
};

export type Gender = "male" | "female" | "other";
export const genderLabels: Record<Gender, string> = {
  male: "Эрэгтэй",
  female: "Эмэгтэй",
  other: "Бусад",
};

// New skin-concern option added on top of Profile.tsx's existing 6 (acne/
// aging/dullness/dryness/sensitivity/pigmentation) — kept here so the
// scoring vocabulary and the auto-tag script agree on the key.
export const NEW_SKIN_CONCERN = { value: "sun_damage", label: "Наранаас хамгаалах / UV" } as const;

// Canonical option lists for the pill-select fields — single source of
// truth for both client/src/pages/Profile.tsx (contact card + quiz wizard)
// and client/src/components/AdminWorkspace.tsx's tag-suggestion labels, so
// the two never drift out of sync the way skinTypeLabels above already has
// with AdminWorkspace's own separate copy (a known, pre-existing, small
// drift left as-is — see PREMIUM-FEATURES.md history).
export const skinTypeOptions: Array<{ value: SkinType; label: string }> = [
  { value: "normal", label: "Энгийн" },
  { value: "dry", label: "Хуурай" },
  { value: "oily", label: "Тослог" },
  { value: "combination", label: "Хосолмол" },
  { value: "sensitive", label: "Эмзэг" },
];

export const skinConcernOptions: Array<{ value: string; label: string }> = [
  { value: "acne", label: "Батга, бацлуур" },
  { value: "aging", label: "Үрчлээ, хөгшрөлт" },
  { value: "dullness", label: "Уйтгар өнгө" },
  { value: "dryness", label: "Хуурайшилт" },
  { value: "sensitivity", label: "Мэдрэг байдал" },
  { value: "pigmentation", label: "Толбо, пигмент" },
  NEW_SKIN_CONCERN,
];

export const interiorStyleOptions: Array<{ value: string; label: string }> = [
  { value: "minimal", label: "Минимал" },
  { value: "wabi-sabi", label: "Ваби-саби" },
  { value: "modern", label: "Модерн" },
  { value: "scandinavian", label: "Скандинав" },
  { value: "warm-japandi", label: "Жапанди" },
];

export const genderOptions: Array<{ value: Gender; label: string }> = [
  { value: "female", label: genderLabels.female },
  { value: "male", label: genderLabels.male },
  { value: "other", label: genderLabels.other },
];

export const hairTypeOptions: Array<{ value: HairType; label: string }> = [
  { value: "normal", label: hairTypeLabels.normal },
  { value: "dry", label: hairTypeLabels.dry },
  { value: "oily", label: hairTypeLabels.oily },
  { value: "damaged", label: hairTypeLabels.damaged },
  { value: "color_treated", label: hairTypeLabels.color_treated },
];

export const fragrancePreferenceOptions: Array<{ value: FragrancePreference; label: string }> = [
  { value: "unscented", label: fragrancePreferenceLabels.unscented },
  { value: "light", label: fragrancePreferenceLabels.light },
  { value: "floral", label: fragrancePreferenceLabels.floral },
  { value: "citrus", label: fragrancePreferenceLabels.citrus },
];

export const skinRoutineComplexityOptions: Array<{ value: SkinRoutineComplexity; label: string }> = [
  { value: "minimal", label: skinRoutineComplexityLabels.minimal },
  { value: "moderate", label: skinRoutineComplexityLabels.moderate },
  { value: "extensive", label: skinRoutineComplexityLabels.extensive },
];

export const hairConcernOptions: Array<{ value: string; label: string }> = [
  { value: "hairloss", label: "Үс унах" },
  { value: "dandruff", label: "Хусам" },
  { value: "frizz", label: "Ширхэгжилт" },
  { value: "scalp_sensitivity", label: "Толгойн арьс мэдрэмтгий" },
];

export const wellnessInterestOptions: Array<{ value: string; label: string }> = [
  { value: "energy", label: "Эрч хүч" },
  { value: "digestion", label: "Хоол боловсруулалт" },
  { value: "sleep", label: "Нойр" },
  { value: "immune", label: "Дархлаа" },
  { value: "weight", label: "Жин хянах" },
];

/** Shopper-saved preference profile (users.*) — the subset the scorer needs. */
export type PreferenceProfile = {
  skinType?: string | null;
  /** Comma-separated, order = priority (the order the shopper clicked them). */
  skinConcerns?: string | null;
  hairType?: string | null;
  hairConcerns?: string | null;
  fragrancePreference?: string | null;
  /** Comma-separated multi-select, same shape as skinConcerns. */
  wellnessInterests?: string | null;
  interiorStyle?: string | null;
  hasYoungChildren?: boolean | null;
};

/** Product row shape the scorer needs — a subset of the catalog select. */
export type ScorableProduct = {
  id: number;
  brand?: string | null;
  categorySlug?: string | null;
  skinType?: string | null;
  skinConcerns?: string | null;
  hairType?: string | null;
  hairConcerns?: string | null;
  fragrancePreference?: string | null;
  wellnessInterests?: string | null;
  interiorStyle?: string | null;
};

// Priority-decayed token-overlap score: the 1st concern a shopper picked
// (list position, not a separate rank field — no schema change needed)
// counts more than the 2nd, which counts more than the rest.
function scoreTokenListMatch(productList: string | null | undefined, userListInPriorityOrder: string | null | undefined): number {
  if (!productList || !userListInPriorityOrder) return 0;
  const productTokens = new Set(productList.split(",").map(value => value.trim()).filter(Boolean));
  const userTokens = userListInPriorityOrder.split(",").map(value => value.trim()).filter(Boolean);
  const weightByPosition = [1.5, 1.2, 1.0];
  let score = 0;
  userTokens.forEach((token, index) => {
    if (productTokens.has(token)) score += weightByPosition[Math.min(index, weightByPosition.length - 1)];
  });
  return score;
}

/**
 * Recommendation engine v2's pure preference-match score (server/db.ts's
 * getRecommendedProducts adds behavioral signals — category affinity,
 * price-band affinity, wishlist-adjacency — on top of this, since those
 * need DB-fetched context this function deliberately doesn't take).
 */
export function scorePreferenceMatch(product: ScorableProduct, preferences: PreferenceProfile): number {
  let score = 0;
  if (preferences.skinType && product.skinType === preferences.skinType) score += 3;
  score += scoreTokenListMatch(product.skinConcerns, preferences.skinConcerns);
  if (preferences.hairType && product.hairType === preferences.hairType) score += 3;
  score += scoreTokenListMatch(product.hairConcerns, preferences.hairConcerns);
  if (preferences.fragrancePreference && product.fragrancePreference === preferences.fragrancePreference) score += 1;
  // The quiz's step 5 ("Эрүүл мэнд & амьдрал") collects this and the admin
  // product form mirrors it onto products, but until 2026-09-01 nothing
  // ever scored it -- a shopper's wellness answers moved their
  // recommendations by exactly zero. Same priority-decayed list match as
  // skinConcerns/hairConcerns, since it is the same comma-separated shape.
  score += scoreTokenListMatch(product.wellnessInterests, preferences.wellnessInterests);
  if (preferences.interiorStyle && product.interiorStyle && product.interiorStyle === preferences.interiorStyle) score += 2;
  // Deliberately a SOFT signal (same weight as fragrancePreference), not a
  // strong one -- a real QA run found +3 here let this one coarse
  // category-level checkbox dominate a shopper's entire recommendation
  // list (5/5 baby products for a shopper who also picked skinType/
  // hairType/concerns) whenever tag coverage elsewhere was thin, which it
  // still mostly is. This should nudge, not override, everything else.
  if (preferences.hasYoungChildren && product.categorySlug === "eej-ba-khuukhed") score += 1;
  return score;
}

// A candidate within +/-30% of the shopper's average historical unit price
// counts as "in their usual price band" — a soft nudge, not a hard filter.
export function scorePriceBandAffinity(candidatePriceMnt: number, avgHistoricalUnitPriceMnt: number | null | undefined): number {
  if (!avgHistoricalUnitPriceMnt || avgHistoricalUnitPriceMnt <= 0) return 0;
  const ratio = candidatePriceMnt / avgHistoricalUnitPriceMnt;
  return ratio >= 0.7 && ratio <= 1.3 ? 1 : 0;
}

// Caps how many results from the same brand/category can appear together,
// applied AFTER sorting by score (so it thins out an already-ranked list
// rather than re-ranking it) — avoids a top-8 that's 8 near-duplicate SKUs
// from one generic-description brand (see PRODUCT-IMPORT.md's "S-Select"
// naming pattern).
export function applyDiversityCap<T extends { product: { brand?: string | null; categorySlug?: string | null } }>(
  scoredEntries: T[],
  options: { maxPerBrand?: number; maxPerCategory?: number } = {},
): T[] {
  const maxPerBrand = options.maxPerBrand ?? 3;
  const maxPerCategory = options.maxPerCategory ?? 4;
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const kept: T[] = [];
  for (const entry of scoredEntries) {
    const brandKey = entry.product.brand ?? "__no-brand__";
    const categoryKey = entry.product.categorySlug ?? "__no-category__";
    const brandCount = brandCounts.get(brandKey) ?? 0;
    const categoryCount = categoryCounts.get(categoryKey) ?? 0;
    if (brandCount >= maxPerBrand || categoryCount >= maxPerCategory) continue;
    brandCounts.set(brandKey, brandCount + 1);
    categoryCounts.set(categoryKey, categoryCount + 1);
    kept.push(entry);
  }
  return kept;
}

/** Share of a shopper's past paid order_items quantity that went to each
 *  product category — e.g. { 3: 0.6, 7: 0.4 } means 60% of what they've
 *  bought (by quantity) was category 3. Pure aggregation; server/db.ts
 *  fetches the rows via the same paid-orders join getBestsellingProducts
 *  already uses. */
export function computeCategoryAffinity(orderItemRows: Array<{ categoryId: number | null; quantity: number }>): Map<number, number> {
  const totalsByCategory = new Map<number, number>();
  let grandTotal = 0;
  for (const row of orderItemRows) {
    if (row.categoryId == null) continue;
    totalsByCategory.set(row.categoryId, (totalsByCategory.get(row.categoryId) ?? 0) + row.quantity);
    grandTotal += row.quantity;
  }
  if (grandTotal === 0) return new Map();
  const shareByCategory = new Map<number, number>();
  totalsByCategory.forEach((quantity, categoryId) => shareByCategory.set(categoryId, quantity / grandTotal));
  return shareByCategory;
}
