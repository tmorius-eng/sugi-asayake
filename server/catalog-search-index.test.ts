import { describe, expect, it } from "vitest";
import { buildCatalogIndex, runCatalogSearch, tokenizeSearchText, type IndexableProduct } from "./search/catalogSearchIndex";
import { defaultSynonymDictionary } from "@shared/search-synonyms";
import { DEFAULT_BRAND_ALIASES, buildBrandAliasMap } from "@shared/brand-aliases";

/**
 * Хайлт v3 (2026-09-20) — цэвэр индекс, DB-гүй. Tom-ийн бодит гомдол бүр нэг
 * тест: "хэдхэн үг л ажилладаг", "латин/кириллээр буруу бичсэн ч олдох ёстой",
 * "prieclat asmy cocochi sokamocka хайхад амар". Мөн 2026-09-12-ний хэмжсэн
 * сургамжууд (гарын тос ≠ тослог арчигч цаас, маск ≠ маскара) хэвээр.
 */
const rows: IndexableProduct[] = [
  { id: 1, name: "BA-YU Horse Oil Non-Silicone Shampoo (600ml)", brand: "BA-YU", shortDescription: "BA-YU брэндийн Японы жинхэнэ шампунь.", categoryName: "Үс ба бие", categorySlug: "us-ba-bie", sku: "4901234567890", stockQuantity: 12 },
  { id: 2, name: "COCOCHI ESSENCE CREAM & MASK", brand: "Cocochi", shortDescription: "Cocochi брэндийн Японы жинхэнэ тос (крем).", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000001", stockQuantity: 5 },
  { id: 3, name: "PRIECLAT Emulsion", brand: "PRIECLAT", shortDescription: "PRIECLAT брэндийн Японы жинхэнэ бүтээгдэхүүн.", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000002", stockQuantity: 3 },
  { id: 4, name: "SokaMocka Organic Facial Soap 100g", brand: "SokaMocka", shortDescription: "SokaMocka брэндийн Японы жинхэнэ саван.", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000003", stockQuantity: 8 },
  { id: 5, name: "Asmy Acne Care Wash", brand: "Asmy", shortDescription: "Asmy брэндийн Японы жинхэнэ нүүр угаагч.", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000004", stockQuantity: 0 },
  { id: 6, name: "S-Select Oil Blotting Paper 100 sheets", brand: "SSELECT", shortDescription: "S-Select брэндийн Японы жинхэнэ тослог арчигч цаас.", categoryName: "Гоо сайхан", categorySlug: "goo-saikhan", sku: "4902000000005", stockQuantity: 20 },
  { id: 7, name: "S-Select Hand Cream Shea 50g", brand: "S-Select", shortDescription: "S-Select брэндийн Японы жинхэнэ гарын тос.", categoryName: "Үс ба бие", categorySlug: "us-ba-bie", sku: "4902000000006", stockQuantity: 20 },
  { id: 8, name: "Love Liner Liquid Mascara Black", brand: "LoveLiner", shortDescription: "Love Liner брэндийн Японы жинхэнэ маскара.", categoryName: "Гоо сайхан", categorySlug: "goo-saikhan", sku: "4902000000007", stockQuantity: 20 },
  { id: 9, name: "S-LABO Rice Face Mask (10 pieces)", brand: "S-LABO", shortDescription: "S-LABO брэндийн Японы жинхэнэ нүүрний маск.", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000008", stockQuantity: 20 },
  { id: 10, name: "Daisy Doll UV Sunscreen SPF50", brand: "Daisy Doll", shortDescription: "Daisy Doll брэндийн Японы жинхэнэ нарнаас хамгаалагч.", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000009", stockQuantity: 20 },
  { id: 11, name: "Zettoc Smile Honey Toothpaste", brand: "Zettoc", shortDescription: "Zettoc брэндийн Японы жинхэнэ шүдний оо.", categoryName: "Эрүүл ахуй", categorySlug: "eruul-akhui", sku: "4902000000010", stockQuantity: 20 },
  { id: 12, name: "S-Select Toothbrush Soft", brand: "S-Select", shortDescription: "S-Select брэндийн Японы жинхэнэ шүдний сойз.", categoryName: "Эрүүл ахуй", categorySlug: "eruul-akhui", sku: "4902000000011", stockQuantity: 20 },
  { id: 13, name: "Hada Labo Gokujyun Lotion", brand: "Hada Labo", shortDescription: "Гиалурон хүчил чийгшүүлэгч лосьон", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000012", stockQuantity: 20, nameMn: "Хада Лабо чийгшүүлэгч лосьон" },
  { id: 14, name: "Melano CC Vitamin C Essence", brand: "Rohto", shortDescription: "Витамин C агуулсан тос", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000013", stockQuantity: 20, searchKeywords: "толбо, хар толбо" },
];

const index = buildCatalogIndex({ rows, dictionary: defaultSynonymDictionary, aliases: buildBrandAliasMap(DEFAULT_BRAND_ALIASES) });
const ids = (query: string) => runCatalogSearch(index, query).hits.map(hit => hit.id);

describe("tokenizeSearchText", () => {
  it("emits hyphen parts and the joined form", () => {
    expect(tokenizeSearchText("BA-YU Shampoo")).toEqual(["ba", "yu", "bayu", "shampoo"]);
  });
});

describe("catalog search index", () => {
  it("indexes every published row", () => {
    expect(index.documentCount).toBe(rows.length);
  });

  it("finds a product by a Mongolian concept word that only appears in English in its name", () => {
    expect(ids("батга")).toContain(5);          // "Acne" via concept token
    expect(ids("нарны цагаан")).toContain(10);   // "UV"/"Sunscreen"
    expect(ids("шампунь")[0]).toBe(1);
    expect(ids("морины тос")[0]).toBe(1);       // BA-YU horse oil
  });

  it("finds brands typed in Cyrillic, romanised, or misspelled", () => {
    expect(ids("кокочи")[0]).toBe(2);
    expect(ids("cocohi")[0]).toBe(2);
    expect(ids("kokochi")[0]).toBe(2);
    expect(ids("приеклат")[0]).toBe(3);
    expect(ids("priecla")[0]).toBe(3);
    expect(ids("сокамока")[0]).toBe(4);
    expect(ids("sokamoka")[0]).toBe(4);
    expect(ids("асми")[0]).toBe(5);
  });

  it("reports brand matches for a brand-like query", () => {
    const outcome = runCatalogSearch(index, "prieclat");
    expect(outcome.brandMatches.map(match => match.brand)).toContain("PRIECLAT");
    expect(outcome.brandMatches.find(match => match.brand === "PRIECLAT")?.count).toBe(1);
  });

  it("canonicalises spelling variants of a brand into one facet", () => {
    expect(index.brandCounts.get("S-Select")).toBe(3); // includes the SSELECT row
    expect(index.brandCounts.has("SSELECT")).toBe(false);
    expect(ids("sselect")).toEqual(expect.arrayContaining([6, 7, 12]));
  });

  it("accepts romanised Mongolian with doubled vowels", () => {
    expect(ids("shampuun")[0]).toBe(1);
    expect(ids("morinii tos")[0]).toBe(1);
  });

  it("requires one word from every concept (strict), so hand cream beats blotting paper for 'гарын тос'", () => {
    const result = runCatalogSearch(index, "гарын тос");
    expect(result.mode).toBe("strict");
    expect(result.hits[0].id).toBe(7);
    expect(result.hits.map(hit => hit.id)).not.toContain(6);
  });

  it("does not let 'маск' prefix-match mascara ahead of face masks", () => {
    // 2026-09-12: prefix on the dictionary's "маск" made mascara LEAD this
    // query. Mascara may still trail via the low-weight romanised description
    // ("maskara"), but never within a tenth of the face mask's score.
    const result = runCatalogSearch(index, "нүүрний маск");
    expect(result.hits[0].id).toBe(9);
    const mascara = result.hits.find(hit => hit.id === 8);
    if (mascara) expect(mascara.score).toBeLessThan(result.hits[0].score * 0.1);
  });

  it("resolves the two-letter phrase 'шүдний оо' to toothpaste, not toothbrush", () => {
    const result = ids("шүдний оо");
    expect(result[0]).toBe(11);
  });

  it("searches Mongolian names and admin keywords", () => {
    expect(ids("хада лабо")[0]).toBe(13);
    expect(ids("хар толбо")[0]).toBe(14);
  });

  it("matches a barcode exactly and reports the mode", () => {
    const result = runCatalogSearch(index, "4902000000009");
    expect(result.mode).toBe("barcode");
    expect(result.hits.map(hit => hit.id)).toEqual([10]);
  });

  it("falls back to broad matching before giving up, and reports none for nonsense", () => {
    expect(runCatalogSearch(index, "zzzqqqxxx").mode).toBe("none");
    expect(runCatalogSearch(index, "zzzqqqxxx").hits).toEqual([]);
  });

  it("offers a did-you-mean for a near miss with no result", () => {
    const result = runCatalogSearch(index, "gokujun");
    expect(result.hits.map(hit => hit.id)).toContain(13);
  });

  it("ranks in-stock products above out-of-stock ones at equal relevance", () => {
    // "арьс" reaches these seven only through their identical category name,
    // so the only difference between them is stock -- the sold-out Asmy wash
    // (id 5) must sit last among them.
    const result = runCatalogSearch(index, "арьс");
    const position = (id: number) => result.hits.findIndex(hit => hit.id === id);
    const categoryOnly = [2, 3, 4, 5, 9, 10, 14];
    for (const id of categoryOnly) expect(position(id)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...categoryOnly.map(position))).toBe(position(5));
  });

  it("rebuilds cleanly when a row changes", () => {
    const rebuilt = buildCatalogIndex({ rows: [...rows, { id: 99, name: "Rohto Melano CC Lotion NEW", brand: "Rohto", categoryName: "Арьс арчилгаа", categorySlug: "arhis-archilgaa", sku: "4902000000099", stockQuantity: 1 }], dictionary: defaultSynonymDictionary, aliases: buildBrandAliasMap(DEFAULT_BRAND_ALIASES) });
    expect(runCatalogSearch(rebuilt, "rohto").hits.map(hit => hit.id)).toEqual(expect.arrayContaining([14, 99]));
  });
});
