import { describe, expect, it } from "vitest";
import { isCyrillicText, toCyrillicVariants, toCyrillicWords } from "@shared/transliterate";

// 2026-09-20 хайлт v3: барааны латин нэр/брэндийг кириллээр олох. Tom-ийн
// жишээ брэндүүд (prieclat, asmy, cocochi, sokamocka) заавал хамрагдана.
describe("toCyrillicVariants", () => {
  it("transliterates the shop's own brand names close enough for fuzzy matching", () => {
    expect(toCyrillicVariants("Cocochi")).toContain("кокочи");
    expect(toCyrillicVariants("SokaMocka")).toContain("сокамока");
    expect(toCyrillicVariants("Asmy")).toContain("асми");
    expect(toCyrillicVariants("PRIECLAT")[0]).toMatch(/^при[еэ]клат$/);
    expect(toCyrillicVariants("Diane")).toContain("диане");
    expect(toCyrillicVariants("Rohto")).toContain("рохто");
  });

  it("handles the common English product words shoppers type in Cyrillic", () => {
    expect(toCyrillicVariants("shampoo")).toEqual(expect.arrayContaining(["шампу", "шампоо"]));
    expect(toCyrillicVariants("cream")).toContain("крим");
    expect(toCyrillicVariants("mask")).toEqual(["маск"]);
    expect(toCyrillicVariants("lotion")).toEqual(["лотион"]);
    expect(toCyrillicVariants("cica")).toContain("сика");
    expect(toCyrillicVariants("collagen")).toContain("коллаген");
  });

  it("returns at most two variants and never duplicates", () => {
    for (const word of ["essence", "cleansing", "sunscreen", "toothpaste", "yuzu"]) {
      const variants = toCyrillicVariants(word);
      expect(variants.length).toBeGreaterThanOrEqual(1);
      expect(variants.length).toBeLessThanOrEqual(2);
      expect(new Set(variants).size).toBe(variants.length);
    }
  });

  it("returns nothing for Cyrillic or numeric input", () => {
    expect(toCyrillicVariants("шампунь")).toEqual([]);
    expect(toCyrillicVariants("4901655440509")).toEqual([]);
    expect(toCyrillicVariants("")).toEqual([]);
  });

  it("drops one-letter results", () => {
    expect(toCyrillicVariants("a")).toEqual([]);
  });
});

describe("toCyrillicWords", () => {
  it("transliterates every Latin word of a product name and skips digits", () => {
    const words = toCyrillicWords("BA-YU Horse Oil Shampoo 600ml");
    expect(words).toEqual(expect.arrayContaining(["ба", "хорсе", "ойл", "шампу"]));
    // "600ml" галиглагдахгүй, "ml" ганцаараа "мл" болно
    expect(words.some(word => /\d/.test(word))).toBe(false);
  });
});

describe("isCyrillicText", () => {
  it("detects Mongolian letters including ө and ү", () => {
    expect(isCyrillicText("өдөр")).toBe(true);
    expect(isCyrillicText("үс")).toBe(true);
    expect(isCyrillicText("hair")).toBe(false);
  });
});
