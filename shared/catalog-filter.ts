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

// 2026-09-20: skinTypeOptions (профайл) ба энэ (admin, /shop pill) хоёр
// зөрүүтэй байсан ("Энгийн"/"Хэвийн", "Эмзэг"/"Мэдрэмтгий") — одоо нэг л эх.
export const skinTypeLabels: Record<SkinType, string> = {
  dry: "Хуурай",
  oily: "Тослог",
  combination: "Хосолмол",
  sensitive: "Мэдрэмтгий",
  normal: "Хэвийн",
};

/** Барааны олон утгат `skinTypes` ("dry,normal" | "all") → массив. */
export function parseSkinTypes(value: string | null | undefined): Array<SkinType | "all"> {
  if (!value) return [];
  return value.split(",").map(item => item.trim()).filter((item): item is SkinType | "all" => item === "all" || item in skinTypeLabels);
}

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
  { value: "normal", label: skinTypeLabels.normal },
  { value: "dry", label: skinTypeLabels.dry },
  { value: "oily", label: skinTypeLabels.oily },
  { value: "combination", label: skinTypeLabels.combination },
  { value: "sensitive", label: skinTypeLabels.sensitive },
];

// Биеийн арчилгаа (2026-09-20, санал болголт v3): асуулгын шинэ алхам ба
// барааны ижил нэртэй толь (users/products.bodySkinType, bodyConcerns).
export type BodySkinType = "dry" | "normal" | "sensitive";
export const bodySkinTypeLabels: Record<BodySkinType, string> = { dry: "Хуурай", normal: "Хэвийн", sensitive: "Мэдрэмтгий" };
export const bodySkinTypeOptions: Array<{ value: BodySkinType; label: string }> = [
  { value: "normal", label: bodySkinTypeLabels.normal },
  { value: "dry", label: bodySkinTypeLabels.dry },
  { value: "sensitive", label: bodySkinTypeLabels.sensitive },
];
export const bodyConcernOptions: Array<{ value: string; label: string }> = [
  { value: "dryness", label: "Хуурайшилт, хагарал" },
  { value: "roughness", label: "Барзгар, өсгий" },
  { value: "odor_sweat", label: "Хөлрөлт, үнэр" },
  { value: "sun_damage", label: "Наранаас хамгаалах" },
  { value: "relaxation", label: "Амралт, ванн" },
  { value: "kids_safe", label: "Хүүхдэд ч зориулсан" },
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
  /** Биеийн арчилгаа (2026-09-20). */
  bodySkinType?: string | null;
  bodyConcerns?: string | null;
};

/** Product row shape the scorer needs — a subset of the catalog select. */
export type ScorableProduct = {
  id: number;
  brand?: string | null;
  categorySlug?: string | null;
  skinType?: string | null;
  /** Олон утга ("dry,normal" | "all"), 2026-09-20; байхгүй бол skinType-ийг уншина. */
  skinTypes?: string | null;
  skinConcerns?: string | null;
  hairType?: string | null;
  hairConcerns?: string | null;
  fragrancePreference?: string | null;
  wellnessInterests?: string | null;
  interiorStyle?: string | null;
  bodySkinType?: string | null;
  bodyConcerns?: string | null;
  productType?: string | null;
  kind?: string | null;
};

/**
 * Санал болголтын жин (2026-09-20) — store settings "Санал болголт" бүлгийн
 * анхдагч утгууд (shared/store-settings.ts reco-*). Сервер бодит утгыг DB-ээс
 * уншиж дамжуулна; энд байгаа нь 2026-09-01-ээс хойшхи бодит зан төлөв.
 */
export type RecoWeights = {
  skinType: number;
  hairType: number;
  bodyType: number;
  concern: number;
  allMatch: number;
  maxPerBrand: number;
  maxPerCategory: number;
  maxPerProductType: number;
};
export const DEFAULT_RECO_WEIGHTS: RecoWeights = { skinType: 3, hairType: 3, bodyType: 3, concern: 1.5, allMatch: 1, maxPerBrand: 3, maxPerCategory: 3, maxPerProductType: 2 };

// Priority-decayed token-overlap score: the 1st concern a shopper picked
// (list position, not a separate rank field — no schema change needed)
// counts more than the 2nd, which counts more than the rest.
function scoreTokenListMatch(productList: string | null | undefined, userListInPriorityOrder: string | null | undefined, firstWeight = 1.5): { score: number; matched: string[] } {
  if (!productList || !userListInPriorityOrder) return { score: 0, matched: [] };
  const productTokens = new Set(productList.split(",").map(value => value.trim()).filter(Boolean));
  const userTokens = userListInPriorityOrder.split(",").map(value => value.trim()).filter(Boolean);
  // 1-р сонголт бүрэн, 2 дахь 80%, бусад 67% (хуучин 1.5 / 1.2 / 1.0 харьцаа).
  // toFixed: 1.5 × 0.8 нь IEEE-д 1.2000000000000002 — оноо харьцуулах тестэд цэвэр байг.
  const weightByPosition = [firstWeight, Number((firstWeight * 0.8).toFixed(3)), Number((firstWeight / 1.5).toFixed(3))];
  let score = 0;
  const matched: string[] = [];
  userTokens.forEach((token, index) => {
    if (productTokens.has(token)) { score += weightByPosition[Math.min(index, weightByPosition.length - 1)]; matched.push(token); }
  });
  return { score, matched };
}

const labelOf = (options: Array<{ value: string; label: string }>, value: string) => options.find(option => option.value === value)?.label ?? value;

/**
 * Хуучин ганц `skinType` баганыг ашиглах эсэх (2026-09-20).
 *
 * 2026-09-01-ний bulk auto-tag нь tag-гүй үлдсэн БҮХ арьс арчилгааны бараанд
 * ангиллын анхдагчаар `skinType="normal"` бичсэн — 561 мөр. Тэр скрипт өөрөө
 * "ангиллын анхдагч нь бодит дохио БИШ" гэж бичсэн боловч оноолт үүнийг бодит
 * тааралт мэт бүрэн жингээр уншсаар байв: "хэвийн арьс" сонгосон худалдан авагч
 * санамсаргүй 561 бараатай таарч, "тослог" сонгосон нь ердөө 5-тай таарна —
 * яг Tom-ийн мэдээлсэн "санал болгож байгаа бараа буруу" гэдэг нь энэ.
 *
 * Тиймээс тэр ялгуургүй хэлбэрийг (normal + зорилгогүй + шинэ олон утгагүй)
 * нотолгоо гэж үзэхгүй. Өгөгдлийг УСТГАХГҮЙ — /shop-ийн шүүлтүүр, admin-ий
 * багана хэвээр; зөвхөн оноолт үүнийг алгасна. Бодит дохиотой `normal`
 * (жишээ нь зорилго нь тэмдэглэгдсэн) хэвээр тоологдоно.
 */
function legacySkinType(product: ScorableProduct): string | null {
  const value = product.skinType ?? null;
  if (value === "normal" && !product.skinConcerns) return null;
  return value;
}

/**
 * Санал болголт v3 (2026-09-20): оноо + ЯАГААД (reasons) + жин тохиргооноос.
 * server/db.ts's getRecommendedProducts adds behavioral signals — category
 * affinity, price-band affinity, wishlist-adjacency — on top of this, since
 * those need DB-fetched context this function deliberately doesn't take.
 *
 * Арьсны төрөл: барааны `skinTypes` (олон) → хэрэглэгчийнх багтвал бүрэн жин;
 * `all` бол бага жин (allMatch); `skinTypes` байхгүй хуучин мөрөнд ганц
 * `skinType`-ийг уншина. Үс/биеийн бараа зөвхөн тухайн профайл байгаа үед л
 * оноо авна (өөрөөр хэлбэл 0 — хуучин ч ийм байсан, "all" нэмэгдсэн тул явцуу).
 */
export function explainPreferenceMatch(product: ScorableProduct, preferences: PreferenceProfile, weights: RecoWeights = DEFAULT_RECO_WEIGHTS): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (preferences.skinType) {
    const types = parseSkinTypes(product.skinTypes ?? legacySkinType(product));
    if (types.includes(preferences.skinType as SkinType)) { score += weights.skinType; reasons.push(`${skinTypeLabels[preferences.skinType as SkinType] ?? preferences.skinType} арьсанд`); }
    else if (types.includes("all")) { score += weights.allMatch; }
  }
  const skin = scoreTokenListMatch(product.skinConcerns, preferences.skinConcerns, weights.concern);
  score += skin.score; for (const token of skin.matched) reasons.push(labelOf(skinConcernOptions, token));
  if (preferences.hairType && product.hairType === preferences.hairType) { score += weights.hairType; reasons.push(`${hairTypeLabels[preferences.hairType as HairType] ?? preferences.hairType} үсэнд`); }
  const hair = scoreTokenListMatch(product.hairConcerns, preferences.hairConcerns, weights.concern);
  score += hair.score; for (const token of hair.matched) reasons.push(labelOf(hairConcernOptions, token));
  if (preferences.bodySkinType && product.bodySkinType === preferences.bodySkinType) { score += weights.bodyType; reasons.push(`${bodySkinTypeLabels[preferences.bodySkinType as BodySkinType] ?? preferences.bodySkinType} биеийн арьсанд`); }
  const body = scoreTokenListMatch(product.bodyConcerns, preferences.bodyConcerns, weights.concern);
  score += body.score; for (const token of body.matched) reasons.push(labelOf(bodyConcernOptions, token));
  if (preferences.fragrancePreference && product.fragrancePreference === preferences.fragrancePreference) { score += 1; reasons.push(`${fragrancePreferenceLabels[preferences.fragrancePreference as FragrancePreference] ?? preferences.fragrancePreference} үнэр`); }
  // The quiz's step 5 ("Эрүүл мэнд & амьдрал") collects this and the admin
  // product form mirrors it onto products, but until 2026-09-01 nothing
  // ever scored it -- a shopper's wellness answers moved their
  // recommendations by exactly zero. Same priority-decayed list match as
  // skinConcerns/hairConcerns, since it is the same comma-separated shape.
  const wellness = scoreTokenListMatch(product.wellnessInterests, preferences.wellnessInterests, weights.concern);
  score += wellness.score; for (const token of wellness.matched) reasons.push(labelOf(wellnessInterestOptions, token));
  if (preferences.interiorStyle && product.interiorStyle && product.interiorStyle === preferences.interiorStyle) { score += 2; reasons.push(labelOf(interiorStyleOptions, preferences.interiorStyle)); }
  // Deliberately a SOFT signal (same weight as fragrancePreference), not a
  // strong one -- a real QA run found +3 here let this one coarse
  // category-level checkbox dominate a shopper's entire recommendation
  // list (5/5 baby products for a shopper who also picked skinType/
  // hairType/concerns) whenever tag coverage elsewhere was thin, which it
  // still mostly is. This should nudge, not override, everything else.
  if (preferences.hasYoungChildren && product.categorySlug === "eej-ba-khuukhed") { score += 1; reasons.push("Хүүхэдтэй гэр бүлд"); }
  return { score, reasons: Array.from(new Set(reasons)) };
}

/** Хуучин гэрээ — оноо л. Тест, related rail үүгээр. */
export function scorePreferenceMatch(product: ScorableProduct, preferences: PreferenceProfile, weights: RecoWeights = DEFAULT_RECO_WEIGHTS): number {
  return explainPreferenceMatch(product, preferences, weights).score;
}

/**
 * Профайл-суурьт саналд орох ёсгүй бараа (2026-09-20): бэлгийн карт, хүнс,
 * гэр ахуй, эрүүл ахуйн хэрэгсэл, ам шүдний бүтээгдэхүүн — "арьсны төрөл"-өөр
 * санал болгох утгагүй. Хоол тэжээлийн нэмэлт/цай зөвхөн эрүүл мэндийн
 * сонирхол сонгосон бол (тэднийг wellness л оноодог тул байгалиараа).
 */
export function isEligibleForPreferenceRecommendation(product: ScorableProduct): boolean {
  if (product.kind === "gift_card") return false;
  if (product.categorySlug === "gift-card" || product.categorySlug === "khuns") return false;
  return !["food", "household", "hygiene", "oral_care", "gift_card", "device"].includes(product.productType ?? "");
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
export function applyDiversityCap<T extends { product: { brand?: string | null; categorySlug?: string | null; productType?: string | null } }>(
  scoredEntries: T[],
  options: { maxPerBrand?: number; maxPerCategory?: number; maxPerProductType?: number } = {},
): T[] {
  const maxPerBrand = options.maxPerBrand ?? 3;
  const maxPerCategory = options.maxPerCategory ?? 4;
  // 2026-09-20: төрлийн хязгаар — 8 санал = routine (цэвэрлэгч, тонер, серум,
  // крем, нарны…) байг, 8 маск биш. Төрөлгүй бараа энэ хязгаарт орохгүй.
  const maxPerProductType = options.maxPerProductType ?? Infinity;
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const kept: T[] = [];
  for (const entry of scoredEntries) {
    const brandKey = entry.product.brand ?? "__no-brand__";
    const categoryKey = entry.product.categorySlug ?? "__no-category__";
    const typeKey = entry.product.productType ?? null;
    const brandCount = brandCounts.get(brandKey) ?? 0;
    const categoryCount = categoryCounts.get(categoryKey) ?? 0;
    const typeCount = typeKey ? typeCounts.get(typeKey) ?? 0 : 0;
    if (brandCount >= maxPerBrand || categoryCount >= maxPerCategory || (typeKey && typeCount >= maxPerProductType)) continue;
    brandCounts.set(brandKey, brandCount + 1);
    categoryCounts.set(categoryKey, categoryCount + 1);
    if (typeKey) typeCounts.set(typeKey, typeCount + 1);
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
