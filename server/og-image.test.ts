import { describe, expect, it } from "vitest";
import { isComposableImageSource } from "./_core/ogImage";

/**
 * 2026-09-27: `product.imageUrl` is CSV-importable -- composeProductCard
 * used to `fetch()` it unconditionally, a blind SSRF against the VM's own
 * network for any non-storage URL. Only our own storage / bundled assets
 * should ever be composed into a share card.
 */
describe("isComposableImageSource", () => {
  it("allows our own storage-proxied path", () => {
    expect(isComposableImageSource("/cdn/products/abc123.webp")).toBe(true);
  });

  it("allows the site's own bundled fallback assets", () => {
    expect(isComposableImageSource("/images/brand/sugi-logo.webp")).toBe(true);
  });

  it("rejects private, metadata and plain-http sources (CSV-importable field, SSRF risk)", () => {
    expect(isComposableImageSource("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isComposableImageSource("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isComposableImageSource("https://10.0.1.227/x.jpg")).toBe(false);
    expect(isComposableImageSource("http://internal-admin.local/secret")).toBe(false);
    expect(isComposableImageSource("http://vendor.example/x.jpg")).toBe(false);
  });

  // Вендор/Zochil-оос ирсэн гадаад зурагтай бараа share картгүй болохгүй (redirect-гүй татна).
  it("allows a public https image host", () => {
    expect(isComposableImageSource("https://vendor.example/x.jpg")).toBe(true);
  });

  it("rejects an unrelated site-relative path", () => {
    expect(isComposableImageSource("/admin/secret")).toBe(false);
  });
});
