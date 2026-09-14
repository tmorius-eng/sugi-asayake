/**
 * Storefront (Profile), admin панель (захиалгын жагсаалт, самбар), сервер (имэйл,
 * самбарын тоо) хуваалцдаг захиалгын мөнгөний төлөвийн туслахууд.
 *
 * Аудит 2026-09-09 (R2 + архитектурын өр #2): `paymentStatus` мөнгө АВСАН ("paid")
 * эсвэл БУЦААСАН ("refunded") эсэхийг бүртгэнэ; борлуулалт хүчинтэй эсэх талаар юу ч
 * хэлэхгүй. Өөрийн нэр хэрэгтэй цорын ганц хослол "харилцагчийн мөнгө бидэнд, захиалга
 * үхсэн": QPay захиалга webhook үед pending/confirmed хэвээр "paid" болно — яг
 * цуцлагдаж болох цонх (харилцагч orders.cancel, агуулах admin.updateOrder).
 * Цуцлалт paymentStatus-ийг санаатай хөнддөггүй (мөнгө үнэхээр авагдсан) тул ийм
 * захиалга finance буцаан олголт бүртгэтэл (admin.refundOrder) `cancelled` + `paid`.
 * Энэ бол ХҮЛЭЭГДЭЖ БУЙ БУЦААН ОЛГОЛТ, түүний цорын ганц тодорхойлолт — гаргаж авсан,
 * хадгалаагүй тул бүрдүүлдэг хоёр баганаасаа хэзээ ч зөрөхгүй.
 */
export type OrderMoneyState = { status: string; paymentStatus: string };

export function isRefundOwed(order: OrderMoneyState): boolean {
  return order.status === "cancelled" && order.paymentStatus === "paid";
}

/** Whether finance may record a refund for this order (server/db.ts's
 *  refundOrder enforces the same rule; this is for showing the control). */
export function isRefundable(order: OrderMoneyState): boolean {
  return order.paymentStatus === "paid" && (order.status === "returned" || order.status === "cancelled");
}

export type PaymentBadge = { label: string; tone: "paid" | "refunded" | "refund-owed" | "unpaid" };

/** One wording for the payment pill wherever an order is shown. */
export function paymentBadgeFor(order: OrderMoneyState): PaymentBadge {
  if (order.paymentStatus === "refunded") return { label: "Буцаан олгосон", tone: "refunded" };
  if (isRefundOwed(order)) return { label: "Буцаан олголт хүлээгдэж буй", tone: "refund-owed" };
  if (order.paymentStatus === "paid") return { label: "Төлөгдсөн", tone: "paid" };
  return { label: "Төлбөр хүлээж буй", tone: "unpaid" };
}
