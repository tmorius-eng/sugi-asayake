import { describe, expect, it } from "vitest";
import { filterCatalogProducts, filterCatalogSkinType, filterCatalogStock, getCatalogCategories, getCatalogSkinTypes, sortCatalogProducts, scorePreferenceMatch, scorePriceBandAffinity, applyDiversityCap, computeCategoryAffinity } from "../shared/catalog-filter";

const catalog = [
  { name: "Gokujyun Lotion", brand: "Hada Labo", categoryName: "Арьс арчилгаа", shortDescription: "Hyaluronic moisture", priceMnt: 29000, stockQuantity: 4, skinType: "dry" as const },
  { name: "Vitamin C", brand: "DHC", categoryName: "Эрүүл мэнд", shortDescription: "Daily supplement", priceMnt: 17000, stockQuantity: 0, skinType: null },
  { name: "Aqua Gel", brand: "SUGI", categoryName: "Арьс арчилгаа", shortDescription: "Daily hydration", priceMnt: 22000, stockQuantity: 8, skinType: "oily" as const },
];

describe("catalog discovery", () => {
  it("derives original category controls from published catalog data", () => {
    expect(getCatalogCategories(catalog)).toEqual(["Арьс арчилгаа", "Эрүүл мэнд"]);
  });

  it("filters catalog products by category and Mongolian or brand search text", () => {
    expect(filterCatalogProducts(catalog, "hada", "all")).toHaveLength(1);
    expect(filterCatalogProducts(catalog, "", "Эрүүл мэнд")).toEqual([catalog[1]]);
    expect(filterCatalogProducts(catalog, "өөр", "all")).toEqual([]);
  });

  it("can hide out-of-stock items without changing the current catalog order", () => {
    expect(filterCatalogStock(catalog, true)).toEqual([catalog[0], catalog[2]]);
    expect(filterCatalogStock(catalog, false)).toEqual(catalog);
  });

  it("sorts a copy of catalog items by price or display name", () => {
    expect(sortCatalogProducts(catalog, "price-low").map(item => item.name)).toEqual(["Vitamin C", "Aqua Gel", "Gokujyun Lotion"]);
    expect(sortCatalogProducts(catalog, "price-high").map(item => item.name)).toEqual(["Gokujyun Lotion", "Aqua Gel", "Vitamin C"]);
    expect(sortCatalogProducts(catalog, "name-asc").map(item => item.name)).toEqual(["Aqua Gel", "Gokujyun Lotion", "Vitamin C"]);
    expect(sortCatalogProducts(catalog, "featured")).toEqual(catalog);
  });

  it("derives the skin-type pills that actually appear in the catalog, in a fixed order", () => {
    expect(getCatalogSkinTypes(catalog)).toEqual(["dry", "oily"]);
    expect(getCatalogSkinTypes([{ skinType: null }])).toEqual([]);
  });

  it("filters catalog products by skin type, leaving untagged products out once a filter is picked", () => {
    expect(filterCatalogSkinType(catalog, "all")).toEqual(catalog);
    expect(filterCatalogSkinType(catalog, "dry")).toEqual([catalog[0]]);
    expect(filterCatalogSkinType(catalog, "sensitive")).toEqual([]);
  });
});

// Preference Profile v2 (2026-09-01) recommendation engine v2 scoring.
describe("scorePreferenceMatch", () => {
  it("scores an exact skinType match", () => {
    expect(scorePreferenceMatch({ id: 1, skinType: "dry" }, { skinType: "dry" })).toBe(3);
    expect(scorePreferenceMatch({ id: 1, skinType: "oily" }, { skinType: "dry" })).toBe(0);
  });

  it("weights skinConcerns by the shopper's click order (priority), not just set membership", () => {
    // Shopper picked "acne" first, "aging" second -- a product matching
    // only the 2nd-priority concern should score less than one matching
    // the 1st.
    const matchesFirst = scorePreferenceMatch({ id: 1, skinConcerns: "acne" }, { skinConcerns: "acne,aging" });
    const matchesSecond = scorePreferenceMatch({ id: 2, skinConcerns: "aging" }, { skinConcerns: "acne,aging" });
    expect(matchesFirst).toBeGreaterThan(matchesSecond);
    expect(matchesFirst).toBe(1.5);
    expect(matchesSecond).toBe(1.2);
  });

  it("combines multiple independent signals additively", () => {
    const score = scorePreferenceMatch(
      { id: 1, skinType: "dry", hairType: "damaged" },
      { skinType: "dry", hairType: "damaged" },
    );
    expect(score).toBe(6); // 3 (skinType) + 3 (hairType)
  });

  it("scores 0 when nothing matches, including when both sides are empty", () => {
    expect(scorePreferenceMatch({ id: 1 }, {})).toBe(0);
    expect(scorePreferenceMatch({ id: 1, skinType: "dry" }, {})).toBe(0);
  });

  it("credits hasYoungChildren only against the mom-and-child category, as a soft (not dominant) signal", () => {
    // Deliberately soft (+1, same as fragrancePreference) -- a real QA run
    // found a stronger weight here let this one coarse checkbox dominate a
    // shopper's whole recommendation list whenever other tag coverage was
    // thin (still mostly true for this catalog).
    expect(scorePreferenceMatch({ id: 1, categorySlug: "eej-ba-khuukhed" }, { hasYoungChildren: true })).toBe(1);
    expect(scorePreferenceMatch({ id: 1, categorySlug: "arhis-archilgaa" }, { hasYoungChildren: true })).toBe(0);
  });
});

describe("scorePriceBandAffinity", () => {
  it("credits a candidate within +/-30% of historical average price", () => {
    expect(scorePriceBandAffinity(10_000, 10_000)).toBe(1);
    expect(scorePriceBandAffinity(12_500, 10_000)).toBe(1); // +25%
    expect(scorePriceBandAffinity(15_000, 10_000)).toBe(0); // +50%, out of band
  });

  it("scores 0 with no historical price to compare against", () => {
    expect(scorePriceBandAffinity(10_000, null)).toBe(0);
    expect(scorePriceBandAffinity(10_000, undefined)).toBe(0);
  });
});

describe("applyDiversityCap", () => {
  const entry = (id: number, brand: string, categorySlug: string) => ({ product: { id, brand, categorySlug } });

  it("caps how many results from the same brand survive, preserving score order", () => {
    const scored = [entry(1, "S-Select", "arhis-archilgaa"), entry(2, "S-Select", "arhis-archilgaa"), entry(3, "S-Select", "arhis-archilgaa"), entry(4, "S-Select", "arhis-archilgaa"), entry(5, "Other", "arhis-archilgaa")];
    const capped = applyDiversityCap(scored, { maxPerBrand: 3, maxPerCategory: 10 });
    expect(capped.map(e => e.product.id)).toEqual([1, 2, 3, 5]);
  });

  it("caps how many results from the same category survive", () => {
    const scored = [entry(1, "A", "skin"), entry(2, "B", "skin"), entry(3, "C", "skin"), entry(4, "D", "hair")];
    const capped = applyDiversityCap(scored, { maxPerBrand: 10, maxPerCategory: 2 });
    expect(capped.map(e => e.product.id)).toEqual([1, 2, 4]);
  });
});

describe("computeCategoryAffinity", () => {
  it("returns each category's share of total purchased quantity", () => {
    const shares = computeCategoryAffinity([{ categoryId: 1, quantity: 3 }, { categoryId: 2, quantity: 1 }, { categoryId: 1, quantity: 1 }]);
    expect(shares.get(1)).toBeCloseTo(0.8);
    expect(shares.get(2)).toBeCloseTo(0.2);
  });

  it("ignores rows with no category and returns an empty map for no purchases", () => {
    expect(computeCategoryAffinity([{ categoryId: null, quantity: 5 }]).size).toBe(0);
    expect(computeCategoryAffinity([]).size).toBe(0);
  });
});
