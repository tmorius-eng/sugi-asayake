import { describe, expect, it } from "vitest";
import { suggestTagsForProduct } from "../shared/product-tagging";

describe("suggestTagsForProduct", () => {
  it("never guesses on truly generic boilerplate copy (the common case in this catalog)", () => {
    // A real read of the live catalog found 767/937 products carry exactly
    // this kind of templated shortDescription -- this must stay untagged
    // rather than falsely matching on category alone.
    const suggestion = suggestTagsForProduct({
      name: "S SELECT White Clay Foam cleanser",
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

  it("leaves a field undefined when no rule fires, rather than defaulting to a guess", () => {
    const suggestion = suggestTagsForProduct({ name: "Bath Towel Set", categorySlug: "eruul-akhui", shortDescription: null, description: null });
    expect(suggestion.skinType).toBeUndefined();
    expect(suggestion.fragrancePreference).toBeUndefined();
    expect(suggestion.wellnessInterests).toBeUndefined();
  });
});
