import { describe, expect, it } from "vitest";
import { ALERTING_MOVEMENT_TYPES, classifyStockCrossing } from "@shared/stock-alerts";

// Phase 5 (2026-09-11): when a stock change becomes a phone push.
describe("stock alert crossings", () => {
  it.each([
    [10, 5, 5, "low"],       // lands exactly on the line
    [6, 4, 5, "low"],        // crosses the line
    [5, 4, 5, null],         // already low, going lower: nothing new
    [3, 0, 5, "out"],        // out beats low
    [1, 0, 0, "out"],        // threshold 0: only "out" ever fires
    [4, 6, 5, null],         // going up never alerts
    [10, 4, null, null],     // no threshold: silent location
    [0, 0, 5, null],         // no change
    [6, 5, 5, "low"],
  ] as const)("before %i after %i threshold %s -> %s", (before, after, threshold, expected) => {
    expect(classifyStockCrossing(before, after, threshold)).toBe(expected);
  });

  it("re-arms once stock rises back above the threshold", () => {
    expect(classifyStockCrossing(10, 5, 5)).toBe("low");
    expect(classifyStockCrossing(5, 4, 5)).toBeNull();
    expect(classifyStockCrossing(4, 12, 5)).toBeNull(); // restocked
    expect(classifyStockCrossing(12, 5, 5)).toBe("low"); // alerts again
  });

  it("only counts real departures, not corrections", () => {
    expect(ALERTING_MOVEMENT_TYPES.has("sale_online")).toBe(true);
    expect(ALERTING_MOVEMENT_TYPES.has("transfer_out")).toBe(true);
    expect(ALERTING_MOVEMENT_TYPES.has("admin_set")).toBe(false);
    expect(ALERTING_MOVEMENT_TYPES.has("count_adjust")).toBe(false);
  });
});
