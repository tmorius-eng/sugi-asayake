import { describe, expect, it } from "vitest";
import { translateProductText } from "@shared/product-i18n";

/**
 * 2026-09-27: brand was masked before name, so a product name that starts
 * with its own brand ("Diane" / "Diane Botanical Shampoo") had the brand's
 * "Diane" masked first -- the name's own mask then searched the source text
 * for the now-gone "Diane Botanical Shampoo" substring and never matched, so
 * {NAME} was never masked and the raw Mongolian product name leaked into the
 * translated English/Japanese sentence untouched.
 */
describe("translateProductText — brand/name masking order", () => {
  const mn = "Diane Botanical Shampoo нь Японы жижиглэнгийн худалдаанд өргөн танигдсан шампунь бөгөөд өдөр тутмын хэрэглээнд зориулагдсан.";
  const product = { brand: "Diane", name: "Diane Botanical Shampoo" };

  it("masks the full name, not just the brand prefix, in English", () => {
    const result = translateProductText(mn, "en", product);
    expect(result).toContain("Diane Botanical Shampoo is a shampoo");
    expect(result).not.toContain("Diane нь");
  });

  it("masks the full name, not just the brand prefix, in Japanese", () => {
    const result = translateProductText(mn, "ja", product);
    expect(result).toContain("Diane Botanical Shampooは");
    expect(result).not.toContain("Diane нь");
  });

  it("still masks a brand that is not a prefix of the name", () => {
    const otherProduct = { brand: "Diane", name: "Botanical Shampoo" };
    const text = "Botanical Shampoo нь Японы жижиглэнгийн худалдаанд өргөн танигдсан шампунь бөгөөд өдөр тутмын хэрэглээнд зориулагдсан.";
    const result = translateProductText(text, "en", otherProduct);
    expect(result).toContain("Botanical Shampoo is a shampoo");
  });
});
