import { describe, expect, it } from "vitest";
import { computeDeliveryFeeMnt, freeShippingProgress } from "../shared/delivery";

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

describe("freeShippingProgress", () => {
  const base = { subtotalMnt: 30_000, freeShippingThresholdMnt: 50_000 };

  it("reports what is still missing, and how far along the bar is", () => {
    expect(freeShippingProgress(base)).toEqual({ remainingMnt: 20_000, ratio: 0.6 });
  });

  it("is hidden once the threshold is reached (the fee is already 0)", () => {
    expect(freeShippingProgress({ ...base, subtotalMnt: 50_000 })).toBeNull();
    expect(freeShippingProgress({ ...base, subtotalMnt: 90_000 })).toBeNull();
  });

  it("is hidden when no threshold is configured, or the cart is empty", () => {
    expect(freeShippingProgress({ ...base, freeShippingThresholdMnt: 0 })).toBeNull();
    expect(freeShippingProgress({ ...base, subtotalMnt: 0 })).toBeNull();
  });

  it("is hidden for a gift-card-only basket: there is nothing to deliver", () => {
    expect(freeShippingProgress({ ...base, digitalOnly: true })).toBeNull();
  });

  it("agrees with computeDeliveryFeeMnt about where 'free' starts", () => {
    // The banner must never promise free shipping the checkout then charges for.
    for (const subtotalMnt of [1, 49_999, 50_000, 50_001]) {
      const fee = computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 50_000 });
      const progress = freeShippingProgress({ subtotalMnt, freeShippingThresholdMnt: 50_000 });
      expect(fee === 0).toBe(progress === null);
    }
  });
});
