import { describe, expect, it } from "vitest";
import { suggestTagsForProduct } from "../shared/product-tagging";

describe("suggestTagsForProduct", () => {
  it("never guesses on truly generic boilerplate copy (the common case in this catalog)", () => {
    // A real read of the live catalog found 767/937 products carry exactly
    // this kind of templated shortDescription -- this must stay untagged
    // rather than falsely matching on category alone.
    const suggestion = suggestTagsForProduct({
      name: "S SELECT whipping net 1P",
      brand: "S-Select",
      categorySlug: "arhis-archilgaa",
      shortDescription: "S-Select брэндийн Японы жинхэнэ бүтээгдэхүүн.",
      description: null,
    });
    expect(suggestion).toEqual({});
  });

  it("does NOT tag generic 'moisturizing' boilerplate as a dryness concern (regression: this over-fired against ~99% of the real skincare catalog before the fix)", () => {
    const suggestion = suggestTagsForProduct({
      name: "S SELECT Cleansing Oil 300ml",
      brand: "S-Select",
      categorySlug: "arhis-archilgaa",
      shortDescription: "S-Select брэндийн Японы жинхэнэ цэвэрлэгч.",
      description: "S-Select нь Японы жижиглэнгийн худалдаанд өргөн танигдсан цэвэрлэгч бөгөөд өдөр тутмын хэрэглээнд зориулагдсан. Арьсыг чийгшүүлж, зөөлөн, тод харагдуулахад тусална. Японоос албан ёсоор нийлүүлсэн бодит бүтээгдэхүүн.",
    });
    expect(suggestion.skinConcerns ?? []).not.toContain("dryness");
  });

  it("tags an explicit dry-skin claim as skinType, gated to skincare/beauty categories", () => {
    const dry = suggestTagsForProduct({ name: "Organic Sugar Squalane Oil 80ml", categorySlug: "arhis-archilgaa", shortDescription: "100% скваланы тос, хуурай арьсыг зөөлрүүлж, чийгийг барих Японы гоо сайхны тос." });
    expect(dry.skinType).toBe("dry");

    // Same phrase in an unrelated category (e.g. a hygiene product) must not
    // leak into skinType.
    const gated = suggestTagsForProduct({ name: "Хуурай арьст зориулсан бэлэг", categorySlug: "eruul-akhui", shortDescription: "" });
    expect(gated.skinType).toBeUndefined();
  });

  it("tags a real ingredient mention (hyaluronic acid) as a dryness concern", () => {
    const suggestion = suggestTagsForProduct({ name: "Gokujyun Lotion", categorySlug: "arhis-archilgaa", shortDescription: "Hyaluronic acid агуулсан чийгшүүлэгч тонер." });
    expect(suggestion.skinConcerns).toContain("dryness");
  });

  it("tags hair-specific concerns only within the hair & body category", () => {
    const hair = suggestTagsForProduct({ name: "Anti Hair Loss Tonic", categorySlug: "us-ba-bie", shortDescription: "Үс унахаас сэргийлэх, толгойн арьсыг тэжээх тоник." });
    expect(hair.hairConcerns).toContain("hairloss");

    const outsideCategory = suggestTagsForProduct({ name: "Anti Hair Loss Tonic", categorySlug: "eruul-mend", shortDescription: "Үс унахаас сэргийлэх тоник." });
    expect(outsideCategory.hairConcerns).toBeUndefined();
  });

  // --- 2026-09-01 rule pass: ingredient-driven tags, and the false
  // positives found by reading the real output rather than the counts.

  it("reads CICA/Centella as sensitive skin -- the only signal in this catalog that reaches 'sensitivity' at all", () => {
    const suggestion = suggestTagsForProduct({
      name: "Spicule CICA Premium Facial Mask", categorySlug: "arhis-archilgaa",
      shortDescription: "CICA (Centella Asiatica) агуулсан Японы маск.",
    });
    expect(suggestion.skinType).toBe("sensitive");
    expect(suggestion.skinConcerns).toContain("sensitivity");
  });

  it("does NOT read 'sebum' in explanatory copy as oily skin (regression: it tagged a dry-skin squalane oil 'oily')", () => {
    // The real description explains the oil RESEMBLES skin's own sebum, on a
    // product that says outright it is for хуурай, мэдрэг skin.
    const suggestion = suggestTagsForProduct({
      name: "Organic Sugar Squalane Oil 80ml", categorySlug: "arhis-archilgaa",
      description: "Сахарын нишингээс гаргаж авсан 100% скваланы тос нь хүний арьсны байгалийн тостой (sebum) маш ойролцоо бүтэцтэй тул амархан шингэнэ.",
    });
    expect(suggestion.skinType).not.toBe("oily");
  });

  it("does not let 'rice' match inside 'price' (same substring class as 'epa' inside 'rEPAir')", () => {
    const suggestion = suggestTagsForProduct({
      name: "Best Price Facial Foam", categorySlug: "arhis-archilgaa",
      shortDescription: "Хямд үнэтэй бүтээгдэхүүн.",
    });
    expect(suggestion.skinConcerns ?? []).not.toContain("dullness");
  });

  it("does not put hair tags on a BODY product that shares the 'Үс ба бие' category", () => {
    // 36 of that category's 118 products are body milk / body wash / hand
    // soap. A moisturizing body milk is not a dry-HAIR product.
    const body = suggestTagsForProduct({
      name: "S-Select High Moisturizing Body Milk 400ml", categorySlug: "us-ba-bie",
      shortDescription: "S-Select брэндийн Японы жинхэнэ бие тос.",
    });
    expect(body.hairType).toBeUndefined();
    expect(body.hairConcerns).toBeUndefined();

    const hair = suggestTagsForProduct({
      name: "Botanical Moist Shampoo", categorySlug: "us-ba-bie",
      shortDescription: "Botanical брэндийн Японы жинхэнэ шампунь.",
    });
    expect(hair.hairType).toBe("dry");
  });

  it("keeps a repair product 'damaged' even when its brand name contains 'Moist'", () => {
    const suggestion = suggestTagsForProduct({
      name: "Moist Diane Perfect Beauty Extra Night Repair Shampoo 450ml", categorySlug: "us-ba-bie",
      shortDescription: "Diane брэндийн Японы жинхэнэ шампунь.",
    });
    expect(suggestion.hairType).toBe("damaged");
  });

  it("reads a scalp-care shampoo as scalp_sensitivity -- the other option no rule could produce before", () => {
    const suggestion = suggestTagsForProduct({
      name: "Scalp Care medicated shampoo, silicone-free (600ml)", categorySlug: "us-ba-bie",
      shortDescription: "Японы жинхэнэ шампунь.",
    });
    expect(suggestion.hairConcerns).toContain("scalp_sensitivity");
  });

  it("leaves a field undefined when no rule fires, rather than defaulting to a guess", () => {
    const suggestion = suggestTagsForProduct({ name: "Bath Towel Set", categorySlug: "eruul-akhui", shortDescription: null, description: null });
    expect(suggestion.skinType).toBeUndefined();
    expect(suggestion.fragrancePreference).toBeUndefined();
    expect(suggestion.wellnessInterests).toBeUndefined();
  });
});
