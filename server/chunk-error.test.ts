import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "../shared/chunk-error";

describe("isChunkLoadError (stale build after a deploy)", () => {
  it("recognises every browser's wording for a missing code-split chunk", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://sugi.karkaron.com/assets/ProductDetail-BJW-G6rc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/assets/Shop-DKj_AnLz.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/index-abc.css"))).toBe(true);
  });

  it("leaves real application errors alone", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'slug')"))).toBe(false);
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError({ message: "Failed to fetch dynamically imported module" })).toBe(false);
  });
});
