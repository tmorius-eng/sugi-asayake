import { describe, expect, it } from "vitest";
import { reconcileTransfer } from "@shared/transfer-reconcile";

// What the warehouse sent vs what the store scanned (2026-09-11, Phase 4).
describe("transfer reconciliation", () => {
  it("classifies every line and totals the differences", () => {
    const result = reconcileTransfer([
      { code: "A", qtySent: 10, received: 10 },
      { code: "B", qtySent: 5, received: 3 },
      { code: "C", qtySent: 2, received: 4 },
      { code: "D", qtySent: 0, received: 1 },
      { code: "E", qtySent: 6, received: 0 },
    ]);
    expect(result.lines.map(line => [line.code, line.status, line.difference])).toEqual([
      ["A", "matched", 0], ["B", "short", -2], ["C", "over", 2], ["D", "unexpected", 1], ["E", "short", -6],
    ]);
    expect(result).toMatchObject({ matched: 1, short: 2, over: 1, unexpected: 1, missingPieces: 8, extraPieces: 3, hasDiscrepancy: true });
  });

  it("reports a clean transfer as clean", () => {
    const result = reconcileTransfer([{ code: "A", qtySent: 3, received: 3 }]);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.missingPieces + result.extraPieces).toBe(0);
  });
});
