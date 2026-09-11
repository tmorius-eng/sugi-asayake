import { describe, expect, it } from "vitest";
import { emptyScanState, MAX_LINE_QUANTITY, scanReducer, sortedLines, toSaveLines, totalPieces } from "@shared/scan-session";

// The barcode scan session behind receiving goods and stocktakes
// (2026-09-11): each scan = +1 on that code's line.
describe("scan session reducer", () => {
  it("counts repeated scans of the same code on one line, newest first", () => {
    let state = emptyScanState();
    state = scanReducer(state, { type: "scan", code: "4901234567890", variantId: 7, at: 1 });
    state = scanReducer(state, { type: "scan", code: "4909999999999", variantId: null, at: 2 });
    state = scanReducer(state, { type: "scan", code: "4901234567890", variantId: 7, at: 3 });
    expect(state.lines).toHaveLength(2);
    expect(sortedLines(state).map(line => [line.code, line.quantity])).toEqual([["4901234567890", 2], ["4909999999999", 1]]);
    expect(state.lastCode).toBe("4901234567890");
    expect(totalPieces(state)).toBe(3);
  });

  it("normalises what the scanner sends (spaces, hyphens, trailing tab)", () => {
    let state = scanReducer(emptyScanState(), { type: "scan", code: "4901 2345-67890\t", variantId: 7, at: 1 });
    state = scanReducer(state, { type: "scan", code: "4901234567890", variantId: 7, at: 2 });
    expect(state.lines).toEqual([expect.objectContaining({ code: "4901234567890", quantity: 2 })]);
  });

  it("keeps an unknown code countable, and learns its product if it is created later", () => {
    let state = scanReducer(emptyScanState(), { type: "scan", code: "123456789012", variantId: null, at: 1 });
    state = scanReducer(state, { type: "scan", code: "123456789012", variantId: 42, at: 2 });
    expect(state.lines[0]).toMatchObject({ variantId: 42, quantity: 2 });
  });

  it("sets, clamps and removes quantities", () => {
    let state = scanReducer(emptyScanState(), { type: "scan", code: "4901234567890", variantId: 7, at: 1 });
    state = scanReducer(state, { type: "set", code: "4901234567890", quantity: 12.7, at: 2 });
    expect(state.lines[0].quantity).toBe(12);
    state = scanReducer(state, { type: "set", code: "4901234567890", quantity: 1_000_000, at: 3 });
    expect(state.lines[0].quantity).toBe(MAX_LINE_QUANTITY);
    state = scanReducer(state, { type: "set", code: "4901234567890", quantity: 0, at: 4 });
    expect(state.lines).toEqual([]);
    expect(state.lastCode).toBeNull();
  });

  it("saves absolute quantities, so a repeated save can never double-count", () => {
    let state = scanReducer(emptyScanState(), { type: "scan", code: "4901234567890", variantId: 7, at: 1 });
    state = scanReducer(state, { type: "scan", code: "4901234567890", variantId: 7, at: 2 });
    expect(toSaveLines(state)).toEqual([{ code: "4901234567890", quantity: 2 }]);
    expect(toSaveLines(state)).toEqual(toSaveLines(state));
  });

  it("loads saved lines, dropping empty ones", () => {
    const state = scanReducer(emptyScanState(), { type: "load", lines: [{ code: "1", variantId: null, quantity: 0, touchedAt: 1 }, { code: "4901234567890", variantId: 7, quantity: 3, touchedAt: 2 }] });
    expect(state.lines).toHaveLength(1);
  });
});
