import { describe, expect, it } from "vitest";
import { computeDeliveryFeeMnt } from "../shared/delivery";

// Audit 2026-09-09 (architecture debt #1): the one delivery-fee rule both
// the checkout preview and the real charge now call.
describe("computeDeliveryFeeMnt", () => {
  it("store pickup is always free, whatever the subtotal or settings", () => {
    expect(computeDeliveryFeeMnt({ deliveryMethod: "store_pickup", subtotalMnt: 0, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 0 })).toBe(0);
    expect(computeDeliveryFeeMnt({ deliveryMethod: "store_pickup", subtotalMnt: 10_000_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 50_000 })).toBe(0);
  });

  it("UB delivery charges the configured fee when no free-shipping threshold is set", () => {
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 1_000_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 0 })).toBe(5_000);
  });

  it("UB delivery is free at or above the threshold, charged below it", () => {
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 49_999, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 50_000 })).toBe(5_000);
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 50_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 50_000 })).toBe(0);
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 80_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 50_000 })).toBe(0);
  });

  it("never returns a negative fee from a bad setting", () => {
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 1_000, deliveryFeeUbMnt: -100, freeShippingThresholdMnt: 0 })).toBe(0);
  });
});
