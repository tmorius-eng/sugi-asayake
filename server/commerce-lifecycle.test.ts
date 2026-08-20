import { describe, expect, it } from "vitest";
import { getInventoryReservationFailure, shouldRestoreStock } from "./commerce-lifecycle";

describe("commerce lifecycle safeguards", () => {
  it("identifies an oversold cart line before an order can reserve stock", () => {
    expect(getInventoryReservationFailure([{ name: "Hada Labo", quantity: 2, stockQuantity: 1 }])).toContain("Hada Labo");
    expect(getInventoryReservationFailure([{ name: "Hada Labo", quantity: 1, stockQuantity: 1 }])).toBeNull();
  });

  it("restores stock only when an open order is moved to cancelled", () => {
    expect(shouldRestoreStock("pending", "cancelled")).toBe(true);
    expect(shouldRestoreStock("completed", "cancelled")).toBe(false);
    expect(shouldRestoreStock("cancelled", "cancelled")).toBe(false);
  });
});
