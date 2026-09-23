/**
 * Checkout-оор зарагдах бэлгийн карт (2026-09-14) — checkout preview (client) ба
 * бодит төлбөр (server/db.ts) хоёрын заавал санал нийлэх цөөн дүрэм.
 *
 * Бэлгийн картын мөр цахим: тавиураас хэзээ ч гарахгүй, зөвхөн карттай сагсанд
 * хүргэлт хэрэггүй, хувийн хямдрал түүнд хэзээ ч хэрэглэгдэх ёсгүй — 100,000₮-ийн
 * картад 50% купон 50,000₮-өөр 100,000₮ дэлгүүрийн зээл гаргана. Картын дүн нь
 * барааны үнэ; захиалга төлөгдмөгц код олгогдоно (issueGiftCardsForPaidOrder).
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

/**
 * "N сарын дараа" — сарын төгсгөлийг халихгүйгээр (2026-09-23).
 *
 * `setMonth(getMonth() + n)` нь 1-р сарын 31-д 1 сар нэмэхэд 2-р сарын 31 →
 * 3-р сарын 3 болгодог тул бэлгийн карт худалдан авагчийн хүлээж байгаагаас
 * хожуу/эрт дуусдаг. Зорилтот сард тэр өдөр байхгүй бол тухайн сарын сүүлийн
 * өдөр болгож хязгаарлана.
 */
export function addMonthsClamped(from: Date, months: number): Date {
  const day = from.getDate();
  const result = new Date(from.getTime());
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}
