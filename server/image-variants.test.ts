import { describe, expect, it } from "vitest";
import { gridVariantKey, gridVariantUrl, imageSrcSet } from "../shared/image-variants";

describe("gridVariantKey", () => {
  it("inserts the -600w suffix before the extension", () => {
    expect(gridVariantKey("catalog/products/12/name_a1b2c3d4.webp")).toBe("catalog/products/12/name_a1b2c3d4-600w.webp");
  });
});

describe("gridVariantUrl", () => {
  it("derives the grid URL for a .webp image", () => {
    expect(gridVariantUrl("/cdn/catalog/products/12/name_a1b2c3d4.webp")).toBe("/cdn/catalog/products/12/name_a1b2c3d4-600w.webp");
  });

  it("returns null for a pre-derivative-pipeline image (not .webp) rather than a broken candidate", () => {
    // Real bug this guards: 393 real product photos uploaded before this
    // shipped are .jpg/.png with no grid sibling. A srcset candidate for
    // one of those would 404 with no fallback (a listed candidate that
    // fails just renders broken -- the browser doesn't fall back to `src`).
    expect(gridVariantUrl("/cdn/catalog/products/12/name.jpg")).toBeNull();
    expect(gridVariantUrl("/cdn/catalog/products/12/name.png")).toBeNull();
  });

  it("returns null/undefined input as null", () => {
    expect(gridVariantUrl(null)).toBeNull();
    expect(gridVariantUrl(undefined)).toBeNull();
    expect(gridVariantUrl("")).toBeNull();
  });

  it("is idempotent -- passing an already-grid URL returns it unchanged", () => {
    expect(gridVariantUrl("/cdn/catalog/products/12/name-600w.webp")).toBe("/cdn/catalog/products/12/name-600w.webp");
  });
});

describe("imageSrcSet", () => {
  it("builds a two-candidate srcset for a .webp image", () => {
    const srcSet = imageSrcSet("/cdn/catalog/products/12/name.webp", 1600);
    expect(srcSet).toBe("/cdn/catalog/products/12/name-600w.webp 600w, /cdn/catalog/products/12/name.webp 1600w");
  });

  it("returns null for a pre-derivative image, so callers render a plain single-source <img>", () => {
    expect(imageSrcSet("/cdn/catalog/products/12/name.jpg", 1600)).toBeNull();
  });

  it("returns null for no image at all", () => {
    expect(imageSrcSet(null, 1600)).toBeNull();
    expect(imageSrcSet(undefined, 1600)).toBeNull();
  });
});
