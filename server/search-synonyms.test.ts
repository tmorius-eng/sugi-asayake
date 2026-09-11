import { describe, expect, it } from "vitest";
import {
  SYNONYM_GROUPS,
  expandQuery,
  expandQueryGroups,
  latinVariants,
  normaliseSearchText,
} from "@shared/search-synonyms";

/**
 * 2026-09-12. The measured failures this dictionary exists to fix, kept as
 * tests so a future edit to the groups cannot quietly undo them:
 *
 *   "крэм"        → 0 results (крем returned 53)
 *   "шампуунь"    → 0 results (шампунь returned 46)
 *   "гарын тос"   → 0 results (тос alone returned 70)
 *   "шүдний оо"   → 0 results, with 12 products literally described so
 *   "нүүр угаах"  → 0 results
 *   "морины тос"  → 10 loose results, none of them the BA-YU horse-oil line
 */
describe("normaliseSearchText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseSearchText("  Морины   ТОС ")).toBe("морины тос");
  });

  it("folds ё to е, which shoppers use interchangeably", () => {
    expect(normaliseSearchText("лосьён")).toBe("лосьен");
  });

  it("keeps Latin letters carrying Mongolian diacritics as plain letters", () => {
    // A phone keyboard producing "ü" used to have it stripped as
    // punctuation, shredding "hüühdiin" into unmatchable fragments.
    expect(normaliseSearchText("hüühdiin savan")).toBe("huuhdiin savan");
    expect(normaliseSearchText("nöhön")).toBe("nohon");
  });

  it("drops punctuation without gluing the surrounding words together", () => {
    expect(normaliseSearchText("тос, крем!")).toBe("тос крем");
  });
});

describe("latinVariants", () => {
  it("romanises a Cyrillic word the way people actually type it", () => {
    expect(latinVariants("тос")).toContain("tos");
    expect(latinVariants("саван")).toContain("savan");
  });

  it("offers both spellings of an ambiguous letter", () => {
    // "х" is typed as either h or kh.
    const variants = latinVariants("хүүхэд");
    expect(variants.some(variant => variant.startsWith("h"))).toBe(true);
    expect(variants.some(variant => variant.startsWith("kh"))).toBe(true);
  });

  it("returns nothing for a word that is already Latin", () => {
    expect(latinVariants("shampoo")).toEqual([]);
  });

  it("stays bounded rather than exploding on a long word", () => {
    expect(latinVariants("халдваргүйжүүлэгч").length).toBeLessThanOrEqual(4);
  });
});

describe("expandQuery", () => {
  const reaches = (query: string, target: string) => expandQuery(query).includes(target);

  it("reaches the English word that is actually in the product name", () => {
    expect(reaches("шампунь", "shampoo")).toBe(true);
    expect(reaches("морины", "horse")).toBe(true);
    expect(reaches("саван", "soap")).toBe(true);
    expect(reaches("торго", "silk")).toBe(true);
    expect(reaches("батга", "acne")).toBe(true);
    expect(reaches("нүх сүв", "pore")).toBe(true);
  });

  it("works from English back to Mongolian, so the groups are truly two-way", () => {
    expect(reaches("shampoo", "шампунь")).toBe(true);
    expect(reaches("cream", "крем")).toBe(true);
  });

  it("absorbs the misspellings that used to return nothing at all", () => {
    expect(reaches("крэм", "cream")).toBe(true);
    expect(reaches("шампуунь", "shampoo")).toBe(true);
  });

  it("accepts romanised Mongolian typed on a Latin keyboard", () => {
    expect(reaches("krem", "cream")).toBe(true);
    expect(reaches("shampun", "shampoo")).toBe(true);
    expect(reaches("torgo", "silk")).toBe(true);
    expect(reaches("batga", "acne")).toBe(true);
  });

  it("tolerates the doubled vowels of informal romanisation", () => {
    // "морины" romanises to "morini"; people write "morinii".
    expect(reaches("morinii", "horse")).toBe(true);
  });

  it("leaves an unknown word alone instead of dropping it", () => {
    expect(expandQuery("sokamocka")).toEqual(["sokamocka"]);
  });

  it("returns nothing for an empty or punctuation-only query", () => {
    expect(expandQuery("   ")).toEqual([]);
    expect(expandQuery("!!!")).toEqual([]);
  });
});

describe("expandQueryGroups", () => {
  it("keeps each typed concept in its own group", () => {
    // This separation is what makes "гарын тос" return hand creams: searched
    // as one flat OR, an oil-blotting PAPER came back first.
    const groups = expandQueryGroups("гарын тос");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain("hand");
    expect(groups[1]).toContain("cream");
  });

  it("resolves a multi-word entry as one concept, not two words", () => {
    // "шүдний оо" must mean toothpaste. Split, "шүдний" alone also matches
    // every toothbrush, and "оо" is too short for the FULLTEXT index.
    const groups = expandQueryGroups("шүдний оо");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toContain("toothpaste");
    expect(groups[0]).not.toContain("toothbrush");
  });

  it("prefers the longer phrase when two entries overlap", () => {
    expect(expandQueryGroups("шүдний сойз")[0]).toContain("toothbrush");
  });

  it("gives an unknown word a group of its own, so it stays required", () => {
    const groups = expandQueryGroups("cocochi маск");
    expect(groups).toHaveLength(2);
    expect(groups.some(group => group.length === 1 && group[0] === "cocochi")).toBe(true);
  });
});

describe("the dictionary itself", () => {
  it("merges overlapping groups symmetrically, in both directions", () => {
    // "cream" is deliberately in both the тос and крем concepts, because
    // Mongolian uses one word for oil and cream. Before the groups were
    // merged this worked in one direction only -- whichever group was
    // declared last won -- so "cream" reached both while "крем" reached one.
    expect(expandQuery("крем")).toContain("тос");
    expect(expandQuery("тос")).toContain("крем");
    expect(expandQuery("cream")).toContain("крем");
  });

  it("keeps genuinely different concepts apart", () => {
    // "сэргээгч" used to sit in both "conditioner" and "refreshing", which
    // merged hair conditioner with every cooling product.
    expect(expandQuery("кондиционер")).not.toContain("cooling");
    // "тослог" (greasy) belongs to oily skin, not to the oil/cream product.
    expect(expandQuery("тос")).not.toContain("sebum");
  });

  it("has no group of one, which would encode no synonym at all", () => {
    expect(SYNONYM_GROUPS.filter(group => group.length < 2)).toEqual([]);
  });

  it("stores every entry lowercase and trimmed, since lookup normalises", () => {
    const bad = SYNONYM_GROUPS.flat().filter(word => word !== word.toLowerCase().trim());
    expect(bad).toEqual([]);
  });

  it("does not smuggle in generic packaging words as product types", () => {
    // "sheet"/"pack" as synonyms of "маск" made "нүүрний маск" return 165
    // rows led by "Repair Sheets Citrus Soap" -- a soap.
    const maskGroup = SYNONYM_GROUPS.find(group => group.includes("маск"))!;
    expect(maskGroup).not.toContain("sheet");
    expect(maskGroup).not.toContain("pack");
  });
});
