import { describe, expect, it } from "vitest";
import { computeDeliveryFeeMnt } from "../shared/delivery";
import { discountableSubtotalMnt, isDigitalOnlyBasket, isGiftCardLine } from "../shared/gift-cards";

// Gift cards sold at checkout (2026-09-14): the rules the checkout preview
// and the real charge share. The DB side (issue on paid, idempotency, void
// on cancel) is in gift-card-checkout.integration.test.ts.
describe("gift-card basket rules", () => {
  const card = { kind: "gift_card" as const, priceMnt: 50_000, quantity: 2 };
  const cream = { kind: "physical" as const, priceMnt: 28_000, quantity: 1 };

  it("a basket is digital-only when every line is a gift card, and never when empty", () => {
    expect(isDigitalOnlyBasket([card])).toBe(true);
    expect(isDigitalOnlyBasket([card, cream])).toBe(false);
    expect(isDigitalOnlyBasket([cream])).toBe(false);
    expect(isDigitalOnlyBasket([])).toBe(false);
  });

  it("treats a line with no kind (older rows, POS lines) as physical", () => {
    expect(isGiftCardLine({ kind: null })).toBe(false);
    expect(isGiftCardLine({})).toBe(false);
    expect(isDigitalOnlyBasket([{ kind: undefined }])).toBe(false);
  });

  it("percentage discounts apply to the physical part of the basket only", () => {
    expect(discountableSubtotalMnt([card, cream])).toBe(28_000);
    expect(discountableSubtotalMnt([card])).toBe(0);
    expect(discountableSubtotalMnt([cream, { priceMnt: 2_000, quantity: 3 }])).toBe(34_000);
  });

  it("a digital-only basket is never charged delivery, whatever method the form sent", () => {
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 50_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 0, digitalOnly: true })).toBe(0);
    // and the flag changes nothing for a physical basket
    expect(computeDeliveryFeeMnt({ deliveryMethod: "ub_delivery", subtotalMnt: 50_000, deliveryFeeUbMnt: 5_000, freeShippingThresholdMnt: 0, digitalOnly: false })).toBe(5_000);
  });
});
