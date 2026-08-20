import { describe, expect, it } from "vitest";
import { countUnavailableRecentlyViewed, rememberRecentlyViewed, resolveRecentlyViewed } from "@shared/recently-viewed";

describe("recently viewed product helpers", () => {
  it("moves a revisited product to the front and caps its local history", () => {
    expect(rememberRecentlyViewed([4, 3, 2, 1], 3, 4)).toEqual([3, 4, 2, 1]);
  });

  it("preserves visit order while omitting products that are no longer available", () => {
    const products = [{ id: 2, name: "Two" }, { id: 3, name: "Three" }];
    expect(resolveRecentlyViewed(products, [3, 99, 2]).map(product => product.name)).toEqual(["Three", "Two"]);
    expect(countUnavailableRecentlyViewed(products, [3, 99, 2])).toBe(1);
  });
});
