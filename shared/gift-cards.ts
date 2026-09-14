/**
 * Gift cards sold at checkout (2026-09-14) -- the few rules the checkout
 * preview (client) and the real charge (server/db.ts) must agree on.
 *
 * A gift-card line is digital: it never leaves a shelf, a basket made only
 * of gift cards needs no delivery, and a percentage discount must never
 * apply to it -- a 50% coupon on a 100,000₮ card would mint 100,000₮ of
 * store credit for 50,000₮. The card's value is its product price; the
 * codes are issued the moment the order is paid (issueGiftCardsForPaidOrder).
 */
export type GiftCardAwareLine = { kind?: "physical" | "gift_card" | null; priceMnt: number; quantity: number };

export const isGiftCardLine = (line: { kind?: string | null }) => line.kind === "gift_card";

/** True when the basket holds at least one line and every line is a gift card. */
export function isDigitalOnlyBasket(lines: readonly { kind?: string | null }[]): boolean {
  return lines.length > 0 && lines.every(isGiftCardLine);
}

/** The part of the subtotal a coupon / loyalty tier / routine discount may apply to. */
export function discountableSubtotalMnt(lines: readonly GiftCardAwareLine[]): number {
  return lines.reduce((sum, line) => sum + (isGiftCardLine(line) ? 0 : line.priceMnt * line.quantity), 0);
}

/** A card bought online is valid this long. Shown on the card and on the profile. */
export const GIFT_CARD_VALIDITY_MONTHS = 12;
