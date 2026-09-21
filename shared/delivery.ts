/**
 * Checkout preview (client) ба бодит төлбөр (server/db.ts createOrderFromActiveCart)
 * хоёрын хуваалцдаг ЦОРЫН ГАНЦ хүргэлтийн төлбөрийн дүрэм.
 *
 * Аудит 2026-09-09 (архитектурын өр #1): ижил гурван мөрийн томьёо хоёр газар —
 * Checkout.tsx ба createOrderFromActiveCart — бичигдэж, санамсаргүй таарч байв. Нэг
 * мөнгөний дүрмийн гараар хуулсан хоёр хэрэгжүүлэлт нь preview ба төлбөр зөрж эхлэх
 * яг тэр арга; одоо хоёулаа үүнийг дуудна.
 *
 * Дүрэм: салбараас авах үргэлж үнэгүй. Улаанбаатар хүргэлт `deliveryFeeUbMnt`,
 * үнэгүй хүргэлтийн босго (> 0) тохируулагдсан бөгөөд ХЯМДРАЛААС ӨМНӨХ дүн түүнд
 * хүрсэн бол үнэгүй — худалдан авагчийн үнэгүй хүргэлтийн banner-тай харьцуулдаг
 * ердийн "захиалгын дүн", хямдралын дараах төлөх дүн биш.
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

/**
 * "Үнэгүй хүргэлтэд X төгрөг дутуу" мөрөнд хэрэгтэй тоо (2026-09-20).
 *
 * Босгыг `computeDeliveryFeeMnt`-тэй ЯГ ижил уншина: хямдралаас ӨМНӨХ
 * барааны дүнгээр, учир нь худалдан авагчийн харж буй banner болон бодитоор
 * авах хөнгөлөлт хоёр зөрвөл тэр нь алдаа. Хоёр дахь томьёо бичихгүйн тулд
 * энд байна (файлын толгойн тайлбарыг үз).
 *
 * `null` = мөрийг ОГТ харуулахгүй: босго тохируулаагүй, сагс хоосон, зөвхөн
 * бэлгийн карт (хүргэлтгүй), эсвэл аль хэдийн үнэгүй болсон.
 */
export function freeShippingProgress(input: {
  subtotalMnt: number;
  freeShippingThresholdMnt: number;
  digitalOnly?: boolean;
}): { remainingMnt: number; ratio: number } | null {
  const threshold = input.freeShippingThresholdMnt;
  if (input.digitalOnly || threshold <= 0 || input.subtotalMnt <= 0) return null;
  const remainingMnt = threshold - input.subtotalMnt;
  if (remainingMnt <= 0) return null;
  return { remainingMnt, ratio: Math.min(1, Math.max(0, input.subtotalMnt / threshold)) };
}
