import { describe, expect, it } from "vitest";
import { filterCatalogProducts, filterCatalogSkinType, filterCatalogStock, getCatalogCategories, getCatalogSkinTypes, sortCatalogProducts } from "../shared/catalog-filter";

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
