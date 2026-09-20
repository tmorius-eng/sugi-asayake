import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND_ALIASES, brandKey, brandSearchTerms, buildBrandAliasMap, canonicalBrand, sameBrand } from "@shared/brand-aliases";

const map = buildBrandAliasMap(DEFAULT_BRAND_ALIASES);

describe("brand aliases", () => {
  it("folds the POS spelling collisions found in the live catalogue", () => {
    expect(canonicalBrand(map, "SSELECT")).toBe("S-Select");
    expect(canonicalBrand(map, "BAYU")).toBe("BA-YU");
    expect(canonicalBrand(map, "CICAmethod")).toBe("CICA method");
    expect(canonicalBrand(map, "LoveLiner")).toBe("Love Liner");
    expect(canonicalBrand(map, "Prieclair")).toBe("PRIECLAT");
  });

  it("is case, space and punctuation insensitive", () => {
    expect(brandKey("S-Select")).toBe(brandKey("s select"));
    expect(brandKey("P'S")).toBe("ps");
    expect(canonicalBrand(map, " s-select ")).toBe("S-Select");
  });

  it("maps Cyrillic spellings shoppers type to the Latin canonical brand", () => {
    expect(canonicalBrand(map, "кокочи")).toBe("Cocochi");
    expect(canonicalBrand(map, "Приеклат")).toBe("PRIECLAT");
    expect(canonicalBrand(map, "асми")).toBe("Asmy");
    expect(canonicalBrand(map, "сокамока")).toBe("SokaMocka");
  });

  it("passes an unknown brand through trimmed and returns null for empty", () => {
    expect(canonicalBrand(map, "  Rohto ")).toBe("Rohto");
    expect(canonicalBrand(map, "")).toBeNull();
    expect(canonicalBrand(map, null)).toBeNull();
  });

  it("keeps the first definition when two rows claim the same alias", () => {
    const conflicting = buildBrandAliasMap([
      { canonicalBrand: "A", alias: "shared" },
      { canonicalBrand: "B", alias: "shared" },
    ]);
    expect(canonicalBrand(conflicting, "shared")).toBe("A");
  });

  it("search terms include the canonical, every alias and transliterations both ways", () => {
    const terms = brandSearchTerms(map, "Cocochi");
    expect(terms).toEqual(expect.arrayContaining(["cocochi", "кокочи", "кококи"]));
    const bayu = brandSearchTerms(map, "BA-YU");
    expect(bayu).toEqual(expect.arrayContaining(["ba-yu", "bayu", "баю", "морины тос", "morini"]));
  });

  it("sameBrand tolerates spelling drift on the facet filter", () => {
    expect(sameBrand("S-Select", "sselect")).toBe(true);
    expect(sameBrand("S-Select", "Daisy Doll")).toBe(false);
    expect(sameBrand(null, "x")).toBe(false);
  });
});
