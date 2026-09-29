import { describe, expect, it } from "vitest";
import { isPublicStorageKey } from "./_core/storageProxy";

/**
 * 2026-09-27: `/cdn/*` redirected ANY key straight to R2's public URL,
 * including `applications/<random>/<name>.pdf` (careers page CV upload,
 * server/routers.ts) -- not meant to be public. The admin download flow
 * uses its own signed URL (storageGetSignedUrl), never this route.
 */
describe("isPublicStorageKey", () => {
  it("denies a job application CV key", () => {
    expect(isPublicStorageKey("applications/deadbeef0123/cv.pdf")).toBe(false);
  });

  it("allows ordinary public catalogue/site content", () => {
    expect(isPublicStorageKey("products/abc123.webp")).toBe(true);
    expect(isPublicStorageKey("site-media/home-hero.webp")).toBe(true);
    expect(isPublicStorageKey("avatars/1.webp")).toBe(true);
  });
});
