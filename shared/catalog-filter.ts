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
