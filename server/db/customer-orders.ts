// server/db/customer-orders.ts — Харилцагчийн өөрийн захиалга: жагсаалт, цуцлах.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { orderItems, orders, giftCards, products } from "../../drizzle/schema";
import { getDb } from "./connection";
import { updateAdminOrder } from "./admin-orders";
import { orderHasRedeemedGiftCards } from "./gift-cards";
import { recordNotification } from "./notifications";

/**
 * Харилцагчид буцаах захиалгын мөр (2026-09-27): ажилтны дотоод талбаруудыг
 * хасна. Өмнө нь `orders.mine` / `orders.cancel` / `orders.requestReturn` бүтэн
 * мөр буцаадаг байсан тул "агуулахад харагдана" гэсэн admin тэмдэглэл,
 * idempotency түлхүүр, visitor session, санхүүгийн буцаалтын тэмдэглэл
 * харилцагчийн хөтчийн DevTools-д ил байв.
 */
export function toCustomerOrder<T extends Record<string, unknown>>(order: T) {
  const {
    adminNote: _adminNote, clientRequestId: _clientRequestId, visitorSessionId: _visitorSessionId,
    trafficSource: _trafficSource, deviceType: _deviceType, fulfillingBranchId: _fulfillingBranchId,
    refundNote: _refundNote, ...rest
  } = order;
  return rest;
}

export async function getOrderForUser(orderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  return result[0];
}

// Audit 2026-09-09 (R4): cursor-paged (newest first, `cursor` = the last
// order id already shown) instead of the whole history in one response, so
// a long-standing customer's profile never grows into an unbounded query.
// `total` rides along for the profile's "Нийт захиалга" counter, which
// used to be `orders.length` of the (now partial) list.
export async function getOrdersForUser(userId: number, input: { cursor?: number | null; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return { orders: [], nextCursor: null as number | null, total: 0 };
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const where = input.cursor ? and(eq(orders.userId, userId), lt(orders.id, input.cursor)) : eq(orders.userId, userId);
  const [orderRows, [countRow]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.id)).limit(limit + 1),
    db.select({ count: sql<number>`count(*)` }).from(orders).where(eq(orders.userId, userId)),
  ]);
  const total = Number(countRow?.count ?? 0);
  const pageRows = orderRows.slice(0, limit);
  const nextCursor = orderRows.length > limit ? pageRows[pageRows.length - 1].id : null;
  if (!pageRows.length) return { orders: [], nextCursor: null, total };
  // `productId` (nullable — SET NULL if the product was later deleted) lets
  // the "Дахин захиалах" (Buy Again) button on the profile Orders tab
  // re-add these exact products to the cart. Scoped to this user's own
  // order ids rather than scanning the whole order_items table.
  const orderIds = pageRows.map(order => order.id);
  const [lineItems, cardRows] = await Promise.all([
    // `kind` (LEFT JOIN: the product may be gone) tells the profile a line
    // is a gift card whose code is still to come (2026-09-14). `variantId`
    // (2026-09-27) lets "Дахин захиалах" re-add the exact variant bought,
    // instead of always guessing the product's default one.
    db.select({ orderId: orderItems.orderId, productId: orderItems.productId, variantId: orderItems.variantId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt, kind: products.kind })
      .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(inArray(orderItems.orderId, orderIds)),
    db.select({ orderId: giftCards.purchaseOrderId, code: giftCards.code, amountMnt: giftCards.amountMnt, status: giftCards.status, expiresAt: giftCards.expiresAt })
      .from(giftCards).where(inArray(giftCards.purchaseOrderId, orderIds)).orderBy(asc(giftCards.id)),
  ]);
  return {
    orders: pageRows.map(order => ({
      ...toCustomerOrder(order),
      items: lineItems.filter(item => item.orderId === order.id),
      giftCards: cardRows.filter(card => card.orderId === order.id).map(({ orderId: _orderId, ...card }) => card),
    })),
    nextCursor,
    total,
  };
}

// Admin overhaul (2026-09-08, Phase G): customer self-service cancellation.
// This is deliberately a thin ownership+status check that then hands off to
// the *existing* updateAdminOrder for the actual state change -- reusing its
// forward-only-ladder guard and stock-restore logic rather than
// reimplementing them, so there is exactly one place that knows how order
// status transitions and restocking work. A customer can only cancel their
// own order (never someone else's, even by guessing an id), and only while
// it's still pending/confirmed -- once it's been packed, undoing it is a
// warehouse/admin decision (admin.updateOrder), not a self-service one.
export async function cancelOwnOrder(orderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current[0] || current[0].userId !== userId) throw new Error("Захиалга олдсонгүй.");
  if (current[0].status !== "pending" && current[0].status !== "confirmed") throw new Error("Энэ захиалгыг цуцлах боломжгүй — аль хэдийн савлагдсан эсвэл хаагдсан байна.");
  // 2026-09-27: энэ захиалгаар авсан бэлгийн карт аль хэдийн ашиглагдсан бол
  // өөрөө цуцлахыг хаана — эс бөгөөс карт (дэлгүүрийн зээл) + буцаан олголт
  // хоёуланг авах зам нээгддэг. Дэлгүүр admin-аас шийднэ (буцаан олголт нь
  // ашиглагдсан дүнгээр хязгаарлагдсан).
  if (await orderHasRedeemedGiftCards(orderId)) {
    throw new Error("Энэ захиалгын бэлгийн карт аль хэдийн ашиглагдсан тул цуцлахын тулд дэлгүүртэй холбогдоно уу.");
  }
  // `allowedFromStatuses`: дээрх уншилт ба төлөв солих хоёрын хооронд агуулах
  // "савласан" болговол цуцлалт давж, савласан илгээмжийн нөөц буцаж ордог байв.
  const result = await updateAdminOrder({ id: orderId, status: "cancelled", allowedFromStatuses: ["pending", "confirmed"] });
  // The warehouse may already be picking this order -- tell them (2026-09-11).
  const [itemCount] = await db.select({ total: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` }).from(orderItems).where(eq(orderItems.orderId, orderId));
  await recordNotification("order.cancelled_by_customer", { orderNumber: current[0].orderNumber, totalMnt: current[0].totalMnt, itemCount: Number(itemCount?.total ?? 0) }, `order:${orderId}`);
  return result;
}

/**
 * Сэтгэгдлийн урамшуулалд зориулсан шалгалт (2026-09-23): захиалга нь бодитоор
 * ТӨЛӨГДСӨН ба цуцлагдаагүй эсэх. Сэтгэгдэл БИЧИХ эрх нь "захиалсан" дүрмээр
 * (доорх findVerifyingOrderId) хэвээр, харин МӨНГӨ (store credit) зөвхөн
 * төлбөр орсон захиалгад олгоно — өмнө нь төлөгдөөгүй COD захиалгаар 20 бараанд
 * сэтгэгдэл бичээд захиалгаа цуцалж, урамшууллыг үлдээх боломжтой байв.
 */
export async function isOrderSettled(orderId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    // 2026-09-27: `returned` мөн хасна — буцаагдсан (мөнгө буцаах хүлээгдэж буй) захиалга урамшуулал өгөхгүй.
    .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, "paid"), sql`${orders.status} NOT IN ('cancelled', 'returned')`))
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * PREMIUM-FEATURES.md TIER 2 verified-purchase gate: the shopper must have
 * at least one non-cancelled order that actually contains this product. Not
 * restricted to `completed` orders — the spec calls this "ordered" (захиалсан),
 * not "received", and gating on final delivery would make reviewing
 * impractical for slower deliveries. Returns the most recent qualifying
 * order id so the caller can stamp the review with it (the "verified
 * purchase" badge points at *an* order, not a live re-check).
 */
export async function findVerifyingOrderId(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ orderId: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), eq(orderItems.productId, productId), sql`${orders.status} <> 'cancelled'`))
    // 2026-09-23: ТӨЛӨГДСӨН захиалгыг ТЭРГҮҮН эрэмбээр. Урамшуулал
    // `isOrderSettled(review.orderId)`-аар шалгагддаг тул зөвхөн хамгийн
    // шинийг авбал хуучин төлсөн захиалга байхад шинэ COD захиалга сонгогдож,
    // бодитоор худалдан авсан хүн урамшуулалгүй үлдэх байв. `id` нь
    // секундын нарийвчлалтай timestamp-ийн тэнцвэр.
    .orderBy(sql`${orders.paymentStatus} = 'paid' DESC`, desc(orders.createdAt), desc(orders.id))
    .limit(1);
  return rows[0]?.orderId ?? null;
}
