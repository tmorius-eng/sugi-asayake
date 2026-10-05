// server/db/payments.ts — QPay/StorePay төлбөрийн оролдлого.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { orders, paymentAttempts } from "../../drizzle/schema";
import { invalidateCachedByPrefix } from "../_core/ttlCache";
import { getDb } from "./connection";
import { announceIssuedGiftCards, issueGiftCardsForPaidOrder, type IssuedGiftCard } from "./gift-cards";
import { recordNotification } from "./notifications";
import { recordOrderEvent } from "./order-events";

/**
 * Нэг захиалгын төлбөрийн хүсэлтийг (QPay нэхэмжлэл / StorePay зээл) зэрэг хоёр
 * удаа үүсгэхээс сэргийлнэ (2026-09-27). "Өмнөх оролдлого байна уу → байхгүй бол
 * провайдерт шинэ хүсэлт" нь check-then-act байсан тул давхар товшилт/хоёр таб
 * хоёр төлөгдөх нэхэмжлэл эсвэл хоёр зээлийн хүсэлт нээдэг байв.
 *
 * MySQL-ийн нэрлэсэн цоож (`GET_LOCK`) — сервер даяар, хоёр лаптоп + prod-д ч
 * хүчинтэй. Захиалгын мөрийг `FOR UPDATE`-ээр барьвал провайдерийн HTTP дуудлагын
 * турш callback хүлээх бөгөөд оролдлогын INSERT (өөр connection) FK-ийн shared
 * lock-оор deadlock болно — тиймээс мөр биш нэр цоожилно. Транзакц нь зөвхөн
 * нэг connection-ийг барих зорилготой; `fn` дотор pool-оор уншиж/бичнэ.
 */
export class PaymentRequestBusyError extends Error {
  constructor() { super("Энэ захиалгын төлбөрийн хүсэлт яг одоо боловсруулагдаж байна. Хэдэн секундын дараа дахин оролдоно уу."); }
}

export async function withOrderPaymentLock<T>(orderId: number, fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  if (!db) return fn();
  const lockName = `sugi:payment-request:${orderId}`;
  return db.transaction(async tx => {
    const [rows] = await tx.execute(sql`SELECT GET_LOCK(${lockName}, 20) AS got`);
    const got = Number((rows as unknown as Array<{ got: number | null }>)[0]?.got ?? 0);
    if (got !== 1) throw new PaymentRequestBusyError();
    try {
      return await fn();
    } finally {
      await tx.execute(sql`SELECT RELEASE_LOCK(${lockName})`).catch(() => undefined);
    }
  });
}

export async function createQPayPaymentAttempt(input: { orderId: number; providerInvoiceId: string; responseJson: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(paymentAttempts).values({ orderId: input.orderId, provider: "qpay", providerInvoiceId: input.providerInvoiceId, responseJson: input.responseJson });
  const attempt = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerInvoiceId, input.providerInvoiceId)).limit(1);
  return attempt[0];
}

/** 2026-09-12: the StorePay equivalent -- one row per loan request, with the
 *  loan id in providerInvoiceId so every attempt lookup stays shared. */
export async function createStorepayPaymentAttempt(input: { orderId: number; providerInvoiceId: string; responseJson: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(paymentAttempts).values({ orderId: input.orderId, provider: "storepay", providerInvoiceId: input.providerInvoiceId, responseJson: input.responseJson });
  const attempt = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerInvoiceId, input.providerInvoiceId)).limit(1);
  return attempt[0];
}

export async function getLatestQPayPaymentAttemptForOrder(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // 2026-09-23: `id` тэнцвэр. Энэ мөр нь "нэхэмжлэл дахин ашиглах эсэх"-ийг
  // шийддэг тул нэг секундэд үүссэн хоёр оролдлого (амжилтгүй, дараа нь шинэ)
  // дундаас амжилтгүйг буцаавал төлөх боломжтой нэхэмжлэл байхад шинийг
  // үүсгэдэг байв.
  const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id)).limit(1);
  return attempts[0];
}

/**
 * 2026-09-23: `provider` нь одоо шалгагдана. Өмнө нь QPay болон StorePay-ийн
 * callback хоёулаа providerInvoiceId-аар л хайж, дараа нь ӨӨРИЙН провайдераас
 * тэр id-г асуудаг байсан — нөгөө провайдер танихгүй id дээр алдаа шидэж
 * байгаа цагт л аюулгүй байв. StorePay хэзээ нэгэн цагт танихгүй id дээр
 * `value:false` буцаавал QPay-ийн оролдлогыг "амжилтгүй" болгож, түүний
 * `responseJson`-ыг дарж бичих байсан.
 */
export async function getPaymentAttemptByInvoiceId(providerInvoiceId: string, provider?: "qpay" | "storepay") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const attempts = await db.select().from(paymentAttempts)
    .where(provider
      ? and(eq(paymentAttempts.providerInvoiceId, providerInvoiceId), eq(paymentAttempts.provider, provider))
      : eq(paymentAttempts.providerInvoiceId, providerInvoiceId))
    .limit(1);
  return attempts[0];
}

export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0] ?? null;
}

// Audit 2026-09-09 (R6): an invoice QPay reports as PAID for LESS than the
// order total is recorded as a failed attempt (visible on the dashboard's
// "Амжилтгүй төлбөр" list) rather than silently confirming the order.
export async function markQPayPaymentAttemptFailed(input: { id: number; providerPaymentId: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(paymentAttempts).set({ status: "failed", providerPaymentId: input.providerPaymentId, updatedAt: new Date() }).where(eq(paymentAttempts.id, input.id));
}

export async function storeQPayPaymentAttemptResponse(input: { id: number; responseJson: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(paymentAttempts).set({ responseJson: input.responseJson, updatedAt: new Date() }).where(eq(paymentAttempts.id, input.id));
}

// Audit 2026-09-09: this used to be an unconditional
// `SET paymentStatus='paid', status='confirmed'`, i.e. the webhook was the one
// writer in the codebase that ignored updateAdminOrder's forward-only ladder.
// A late or duplicate QPay callback (they are delivered at-least-once) could
// therefore: resurrect a CANCELLED order into "confirmed" after its stock had
// already been restored (oversell), knock a packed/completed order backward
// to "confirmed", or flip a REFUNDED order back to "paid". Now the order row
// only changes while it is genuinely awaiting payment: still unpaid and not
// closed. "pending" advances to "confirmed" as before; any later fulfilment
// status is left alone (payment arriving after packing must not un-pack it).
// The payment_attempts row is always recorded, so money that arrives for an
// already-cancelled order is never lost -- it is visible to finance as a
// paid attempt on a closed order (logged below) and refundable from there.
export async function markQPayPaymentAttemptPaid(input: { id: number; orderId: number; providerPaymentId: string | null }) {
  invalidateCachedByPrefix("storefront:bestsellers:");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // 2026-09-27: энэ оролдлого АНХ удаа "paid" болж байгаа эсэхийг guarded
  // UPDATE-ээр мэднэ — провайдерийн давтан callback (at-least-once) бол 0 мөр.
  // Анх удаа боловч захиалга аль хэдийн ӨӨР оролдлогоор төлөгдсөн бол энэ бол
  // давхар төлбөр (StorePay 15 минутын дараах 2 дахь зээл, QPay-ийн дутуу
  // төлбөрийн дараах шинэ нэхэмжлэл) — өмнө нь зөвхөн console.warn үлддэг байв.
  const attemptFlip = await db.update(paymentAttempts).set({ status: "paid", providerPaymentId: input.providerPaymentId, updatedAt: new Date() })
    .where(and(eq(paymentAttempts.id, input.id), ne(paymentAttempts.status, "paid")));
  const attemptNewlyPaid = Number(attemptFlip[0].affectedRows ?? 0) === 1;
  // Процессын бүртгэл (2026-10-05): callback-ийн ӨМНӨХ төлөвийг нэг удаа уншина — status.changed
  // event-д fromStatus хэрэгтэй (доорх UPDATE нь pending→confirmed-ийг SQL IF-ээр хийдэг).
  const [before] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
  const [attemptForEvent] = await db.select({ provider: paymentAttempts.provider }).from(paymentAttempts).where(eq(paymentAttempts.id, input.id)).limit(1);
  const webhookActor = { kind: "webhook" as const, label: attemptForEvent?.provider ?? "qpay" };
  const updated = await db.update(orders)
    .set({ paymentStatus: "paid", status: sql`IF(${orders.status} = 'pending', 'confirmed', ${orders.status})`, updatedAt: new Date() })
    .where(and(eq(orders.id, input.orderId), eq(orders.paymentStatus, "unpaid"), sql`${orders.status} NOT IN ('cancelled', 'returned')`));
  const orderUpdated = Number(updated[0].affectedRows ?? 0) === 1;
  // Транзакцаас гадна (энэ функц өөрөө нэг tx биш) — алдаа гарвал callback-ийг унагаахгүй:
  // payment_attempts мөр эх сурвалж хэвээр, timeline түүнийг ч харуулдаг.
  if (attemptNewlyPaid) {
    try {
      await recordOrderEvent(db, { orderId: input.orderId, kind: "payment.paid", actor: webhookActor, payload: { provider: webhookActor.label, providerPaymentId: input.providerPaymentId, orderUpdated } });
      if (orderUpdated && before?.status === "pending") await recordOrderEvent(db, { orderId: input.orderId, kind: "status.changed", fromStatus: "pending", toStatus: "confirmed", actor: webhookActor, payload: { reason: "payment_confirmed" } });
    } catch (error) {
      console.error("[payments] order_events бичигдсэнгүй:", error);
    }
  }
  // 2026-09-23: карт үүсгэх нь `orderUpdated` дээр л явдаг байсан тул эхний
  // callback дээр захиалга "paid" болоод карт үүсгэх нь уначихвал (DB-ийн
  // түр зуурын алдаа) провайдерийн дахин илгээлт `orderUpdated=false` авч
  // ХЭЗЭЭ Ч дахин үүсгэдэггүй байв — худалдан авагч кодоо мөнхөд хүлээнэ.
  //
  // ⚠️ Гэхдээ `issueGiftCardsForPaidOrder`-ийн idempotency нь "байгаа эсэхийг
  // хараад дараа нь бичих" (check-then-insert) бөгөөд UNIQUE индексгүй. Өмнө нь
  // зөвхөн guarded UPDATE-ийн НЭГ л дийлэгч дуудаж байсан тул зэрэгцээ ажиллах
  // боломж байхгүй байв. Callback нь нэвтрэлтгүй GET тул одоо ХАМГИЙН БАГА
  // цоожтой байх ёстой: мөрийг `FOR UPDATE`-ээр цоожилж, дараа нь л шалгаж
  // бичнэ — эс бөгөөс хоёр зэрэгцээ callback хоёулаа шалгалтыг давж, 200 000₮-ийн
  // картыг ХОЁР удаа үүсгэнэ (бодит мөнгөний гарз).
  const issuedOnFallback = await db.transaction(async tx => {
    const [locked] = await tx.select({ paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
    if (!locked || locked.paymentStatus !== "paid") return [] as IssuedGiftCard[];
    return issueGiftCardsForPaidOrder(tx, input.orderId);
  });
  announceIssuedGiftCards(input.orderId, issuedOnFallback);
  if (!orderUpdated) {
    console.warn(`[QPay] Payment ${input.providerPaymentId ?? "(no id)"} confirmed for order ${input.orderId}, but the order is already paid or closed -- left unchanged; check payment_attempts for a refund.`);
  }
  // Phone pushes (2026-09-11). The dedupe keys make QPay's at-least-once
  // callbacks harmless: one "paid" per order, one alarm per payment attempt.
  const [order] = await db.select({ orderNumber: orders.orderNumber, totalMnt: orders.totalMnt, status: orders.status, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (order && orderUpdated) {
    // 2026-09-27: энэ push зурвас өмнө нь "QPay-аар" гэж ХАТУУ бичигдсэн байсан
    // ч StorePay-ийн төлбөр ч яг энэ л функцээр (нэрийг үл харгалзан QPay/
    // StorePay хоёулаа энд дуудагддаг) "paid" болдог -- жинхэнэ провайдерыг
    // унших нь энэ мессежийг зөв болгоно (shared/notification-events.ts).
    const [paidAttempt] = await db.select({ provider: paymentAttempts.provider }).from(paymentAttempts).where(eq(paymentAttempts.id, input.id)).limit(1);
    await recordNotification("order.paid", { orderNumber: order.orderNumber, totalMnt: order.totalMnt, paymentMethod: paidAttempt?.provider }, `order:${input.orderId}`);
  } else if (order && attemptNewlyPaid && order.paymentStatus === "paid" && order.status !== "cancelled" && order.status !== "returned") {
    const [otherPaid] = await db.select({ id: paymentAttempts.id }).from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, input.orderId), eq(paymentAttempts.status, "paid"), ne(paymentAttempts.id, input.id))).limit(1);
    const [attemptRow] = await db.select({ provider: paymentAttempts.provider }).from(paymentAttempts).where(eq(paymentAttempts.id, input.id)).limit(1);
    if (otherPaid) {
      await recordNotification("payment.duplicate", { orderNumber: order.orderNumber, provider: attemptRow?.provider ?? "qpay", totalMnt: order.totalMnt }, `attempt:${input.id}`);
      await recordOrderEvent(db, { orderId: input.orderId, kind: "payment.duplicate", actor: webhookActor, payload: { provider: attemptRow?.provider ?? "qpay", attemptId: input.id } }).catch(error => console.error("[payments] order_events бичигдсэнгүй:", error));
    }
  } else if (order && (order.status === "cancelled" || order.status === "returned" || order.paymentStatus === "refunded")) {
    // Money arrived for an order that is closed -- someone has to give it
    // back. (A repeat callback for an order that is simply already paid is
    // routine and says nothing.)
    await recordNotification("payment.paid_on_closed_order", { orderNumber: order.orderNumber, orderStatus: order.status, paymentStatus: order.paymentStatus }, `attempt:${input.id}`);
  }
  return { orderUpdated };
}
