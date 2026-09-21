// server/db/gift-cards.ts — Бэлгийн карт.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { orderItems, orders, giftCards, products, storeCreditLedger, users } from "../../drizzle/schema";
import { GIFT_CARD_VALIDITY_MONTHS } from "../../shared/gift-cards";
import { getDb } from "./connection";
import { OrderTx } from "./admin-orders";
import { forgetSessionUser } from "./users";

// ---------------------------------------------------------------------------
// Gift cards (2026-09-13, migration 0073).
// ---------------------------------------------------------------------------

/** Crockford-style alphabet without 0/O/1/I so a printed code is unambiguous. */
const GIFT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateGiftCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += GIFT_CODE_ALPHABET[bytes[i]! % GIFT_CODE_ALPHABET.length];
  return `SUGI-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
/** "sugi abcd-efgh 2345" -> "SUGI-ABCD-EFGH-2345" (whatever the customer typed). */
export function normalizeGiftCode(raw: string): string {
  const body = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SUGI/, "");
  return `SUGI-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export async function issueGiftCards(input: { amountMnt: number; count: number; issuedByUserId: number; recipientName?: string | null; note?: string | null; expiresAt?: Date | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const created: { id: number; code: string }[] = [];
  for (let i = 0; i < input.count; i++) {
    // Retry on the (astronomically unlikely) unique collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateGiftCode();
      try {
        const inserted = await db.insert(giftCards).values({ code, amountMnt: input.amountMnt, issuedByUserId: input.issuedByUserId, recipientName: input.recipientName ?? null, note: input.note ?? null, expiresAt: input.expiresAt ?? null });
        created.push({ id: Number(inserted[0].insertId), code });
        break;
      } catch (error) {
        if (attempt === 2 || !(error instanceof Error && /Duplicate/i.test(error.message))) throw error;
      }
    }
  }
  return created;
}

/**
 * Gift cards sold at checkout (2026-09-14). Mints the cards an order paid
 * for -- one per unit of every gift_card line, each worth that line's unit
 * price -- and returns them so the caller can hand them to the buyer.
 *
 * Runs inside the caller's transaction (or on the plain connection for the
 * QPay webhook, whose guarded UPDATE already serialised the "became paid"
 * moment). Idempotent by `purchaseOrderId`: a second call for the same order
 * -- the admin marking a webhook-paid order completed, a repeated callback
 * -- finds the existing rows and mints nothing. Physical-only orders return
 * an empty list without writing anything.
 */
export async function issueGiftCardsForPaidOrder(tx: GiftCardWriter, orderId: number): Promise<IssuedGiftCard[]> {
  const lines = await tx.select({ quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt, orderNumber: orders.orderNumber, customerName: orders.customerName })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.orderId, orderId), eq(products.kind, "gift_card")));
  if (!lines.length) return [];
  const already = await tx.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.purchaseOrderId, orderId)).limit(1);
  if (already.length) return [];
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + GIFT_CARD_VALIDITY_MONTHS);
  const issued: IssuedGiftCard[] = [];
  for (const line of lines) {
    for (let unit = 0; unit < line.quantity; unit++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateGiftCode();
        try {
          const inserted = await tx.insert(giftCards).values({ code, amountMnt: line.unitPriceMnt, purchaseOrderId: orderId, issuedByUserId: null, recipientName: line.customerName, note: `Захиалга ${line.orderNumber}`, expiresAt });
          issued.push({ id: Number(inserted[0].insertId), code, amountMnt: line.unitPriceMnt, expiresAt });
          break;
        } catch (error) {
          if (attempt === 2 || !(error instanceof Error && /Duplicate/i.test(error.message))) throw error;
        }
      }
    }
  }
  return issued;
}
export type IssuedGiftCard = { id: number; code: string; amountMnt: number; expiresAt: Date };
type GiftCardWriter = Pick<OrderTx, "select" | "insert" | "update">;

/** The cards an order bought that nobody has redeemed yet become void with the order (cancel / refund). */
export async function voidGiftCardsForOrder(tx: GiftCardWriter, orderId: number): Promise<number> {
  const result = await tx.update(giftCards).set({ status: "void" }).where(and(eq(giftCards.purchaseOrderId, orderId), eq(giftCards.status, "active")));
  return Number(result[0].affectedRows ?? 0);
}

/**
 * Hands freshly minted cards to the buyer (push + email) after the paying
 * transaction has committed. Loaded lazily: giftCardFulfilment imports this
 * module, and a static import back would be a cycle. Never throws -- the
 * codes are in the database and on the profile regardless.
 */
export function announceIssuedGiftCards(orderId: number, cards: IssuedGiftCard[]): void {
  if (!cards.length) return;
  import("../giftCardFulfilment")
    .then(module => module.deliverIssuedGiftCards(orderId, cards))
    .catch(error => console.error(`[gift-cards] could not deliver the codes for order ${orderId}`, error));
}

export async function listGiftCards(limit = 300) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(giftCards).orderBy(desc(giftCards.id)).limit(limit);
}

export async function voidGiftCard(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(giftCards).set({ status: "void" }).where(and(eq(giftCards.id, id), eq(giftCards.status, "active")));
  return Number(result[0].affectedRows ?? 0) === 1;
}

/**
 * Redeem into store credit. One transaction: the guarded UPDATE on the card
 * (status must still be active) is the lock -- a second tab or a second
 * customer typing the same code sees affectedRows 0 and gets the "already
 * used" message; the balance and the ledger row follow in the same
 * transaction so a card can never be marked used without the credit landing.
 */
export async function redeemGiftCard(rawCode: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const code = normalizeGiftCode(rawCode);
  return db.transaction(async tx => {
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
    if (!card) throw new Error("Ийм бэлгийн карт олдсонгүй. Кодоо шалгана уу.");
    if (card.status === "redeemed") throw new Error("Энэ бэлгийн карт аль хэдийн ашиглагдсан байна.");
    if (card.status === "void") throw new Error("Энэ бэлгийн карт хүчингүй болсон байна.");
    if (card.expiresAt && card.expiresAt.getTime() < Date.now()) throw new Error("Энэ бэлгийн картын хугацаа дууссан байна.");
    const claimed = await tx.update(giftCards)
      .set({ status: "redeemed", redeemedByUserId: userId, redeemedAt: new Date() })
      .where(and(eq(giftCards.id, card.id), eq(giftCards.status, "active")));
    if (Number(claimed[0].affectedRows ?? 0) !== 1) throw new Error("Энэ бэлгийн карт аль хэдийн ашиглагдсан байна.");
    await tx.update(users).set({ storeCreditMnt: sql`${users.storeCreditMnt} + ${card.amountMnt}`, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.insert(storeCreditLedger).values({ userId, deltaMnt: card.amountMnt, reason: `Бэлгийн карт ${code}`, actorUserId: null, orderId: null });
    const [updated] = await tx.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, userId)).limit(1);
    forgetSessionUser(userId);
    return { amountMnt: card.amountMnt, storeCreditMnt: updated?.storeCreditMnt ?? 0 };
  });
}
