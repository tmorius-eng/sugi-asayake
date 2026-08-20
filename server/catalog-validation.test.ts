import { describe, expect, it } from "vitest";
import { getCategoryWriteViolation, getProductWriteViolation } from "./catalog-validation";

describe("catalog write validation", () => {
  it("rejects an unknown product category", () => {
    expect(getProductWriteViolation({ categoryId: 99, slug: "hada-labo", sku: "HADA-01" }, false, [])).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects duplicate product URL slugs and SKUs", () => {
    const conflicts = [{ slug: "hada-labo", sku: "HADA-01" }];
    expect(getProductWriteViolation({ slug: "hada-labo" }, null, conflicts)).toMatchObject({ code: "CONFLICT", message: "This product URL slug is already in use." });
    expect(getProductWriteViolation({ sku: "HADA-01" }, null, conflicts)).toMatchObject({ code: "CONFLICT", message: "This product SKU is already in use." });
  });

  it("rejects duplicate category URL slugs", () => {
    expect(getCategoryWriteViolation("skin-care", [{ slug: "skin-care" }])).toMatchObject({ code: "CONFLICT" });
  });
});
