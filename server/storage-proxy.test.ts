import { describe, expect, it } from "vitest";
import { isPublicStorageKey, isSafeStorageKey } from "./_core/storageProxy";

/**
 * 2026-09-27: `/cdn/*` redirected ANY key straight to R2's public URL,
 * including `applications/<random>/<name>.pdf` (careers page CV upload,
 * server/routers.ts) -- not meant to be public. The admin download flow
 * uses its own signed URL (storageGetSignedUrlPrivate), never this route.
 */
describe("isPublicStorageKey", () => {
  it("denies a job application CV key", () => {
    expect(isPublicStorageKey("applications/deadbeef0123/cv.pdf")).toBe(false);
  });

  it("denies inventory receipt photo keys", () => {
    expect(isPublicStorageKey("inventory/receipts/12/abcdef.jpg")).toBe(false);
  });

  it("allows ordinary public catalogue/site content", () => {
    expect(isPublicStorageKey("products/abc123.webp")).toBe(true);
    expect(isPublicStorageKey("site-media/home-hero.webp")).toBe(true);
    expect(isPublicStorageKey("avatars/1.webp")).toBe(true);
  });
});

describe("isSafeStorageKey", () => {
  it("accepts normal keys", () => {
    expect(isSafeStorageKey("products/abc_123.webp")).toBe(true);
    expect(isSafeStorageKey("site-media/1/home-hero.v2.webp")).toBe(true);
  });

  it("rejects traversal, dot and empty segments", () => {
    expect(isSafeStorageKey("../applications/x.pdf")).toBe(false);
    expect(isSafeStorageKey("products/../applications/x.pdf")).toBe(false);
    expect(isSafeStorageKey("products/./a.webp")).toBe(false);
    expect(isSafeStorageKey("products//a.webp")).toBe(false);
    expect(isSafeStorageKey("products/a.webp/")).toBe(false);
  });

  it("rejects backslash, leading slash, control characters and empty key", () => {
    expect(isSafeStorageKey(String.raw`products\..\x`)).toBe(false);
    expect(isSafeStorageKey("/products/a.webp")).toBe(false);
    expect(isSafeStorageKey(`products/a${String.fromCharCode(0)}.webp`)).toBe(false);
    expect(isSafeStorageKey(`products/a${String.fromCharCode(10)}b.webp`)).toBe(false);
    expect(isSafeStorageKey("")).toBe(false);
  });
});
