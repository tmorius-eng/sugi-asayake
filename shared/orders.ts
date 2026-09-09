/**
 * Order money-state helpers shared by the storefront (Profile), the admin
 * panel (orders list, dashboard) and the server (emails, dashboard counts).
 *
 * Audit 2026-09-09 (R2 + architecture debt #2): `paymentStatus` records
 * whether money was COLLECTED ("paid") or given BACK ("refunded"); it says
 * nothing about whether the sale still stands. The one combination that
 * needs its own name is "we have the customer's money and the order is
 * dead": a QPay order becomes "paid" at webhook time while still
 * pending/confirmed -- exactly the window in which it can be cancelled
 * (orders.cancel by the customer, admin.updateOrder by the warehouse).
 * Cancellation deliberately never touches paymentStatus (the money really
 * was collected), so such an order is `cancelled` + `paid` until finance
 * records the refund (admin.refundOrder). That is a REFUND OWED, and this
 * is the single definition of it -- derived, not stored, so it can never
 * drift from the two columns it is made of.
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
