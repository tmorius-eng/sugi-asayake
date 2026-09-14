/**
 * The ONE delivery-fee rule, shared by the checkout preview (client) and the
 * real charge (server/db.ts createOrderFromActiveCart).
 *
 * Audit 2026-09-09 (architecture debt #1): the same three-line formula was
 * written out twice -- Checkout.tsx and createOrderFromActiveCart -- and
 * happened to agree. Two hand-copied implementations of one money rule is
 * exactly how a preview and a charge start to disagree; both now call this.
 *
 * Rule: store pickup is always free. Ulaanbaatar delivery costs
 * `deliveryFeeUbMnt` unless a free-shipping threshold is configured (> 0)
 * and the PRE-discount subtotal reaches it -- the conventional "order
 * amount" a shopper compares against a free-shipping banner, not the
 * post-discount payable total.
 */
export function computeDeliveryFeeMnt(input: {
  deliveryMethod: "ub_delivery" | "store_pickup";
  subtotalMnt: number;
  deliveryFeeUbMnt: number;
  freeShippingThresholdMnt: number;
  /** A basket of only gift cards (shared/gift-cards.ts): nothing to deliver, so never a fee. */
  digitalOnly?: boolean;
}): number {
  if (input.digitalOnly) return 0;
  if (input.deliveryMethod !== "ub_delivery") return 0;
  const qualifiesForFreeShipping = input.freeShippingThresholdMnt > 0 && input.subtotalMnt >= input.freeShippingThresholdMnt;
  return qualifiesForFreeShipping ? 0 : Math.max(0, input.deliveryFeeUbMnt);
}
