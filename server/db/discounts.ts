// server/db/discounts.ts — Хямдралын код.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { discountCodes, orders } from "../../drizzle/schema";
import { getDb } from "./connection";

/**
 * Manually-entered checkout discount code ("SALE10") — distinct from the two
 * automatic discounts above (routine bundle, loyalty tier), which need no
 * code. Validated against real, current state (active, not expired, under
 * its use limit, subtotal meets the minimum) — never trusts a
 * client-supplied discount amount. `amountMnt` is the base it applies to:
 * subtotal *after* the routine discount (see the stacking order comment in
 * createOrderFromActiveCart), so a bundle and a coupon are never both
 * computed off the same money. Shared by the checkout-preview query
 * (cart.applicableCouponDiscount) and the real redemption at order time, so
 * the number a shopper sees before confirming is guaranteed to match what's
 * actually charged.
 */
/**
 * Audit 2026-09-09 (R1): `customer` identifies who is redeeming, for the
 * per-customer cap (discount_codes.maxUsesPerCustomer). A signed-in shopper
 * is matched by account id; a guest by the last 8 digits of the phone they
 * gave at checkout (so signing out does not reset the count). Cancelled
 * orders do not count -- their coupon use was undone with everything else.
 * At preview time a guest's phone is not yet known, so the preview passes
 * only a null identity and the real check happens at order time; a signed-in
 * shopper gets the honest answer already in the preview.
 */
export type DiscountRedeemer = { userId: number | null; phone: string | null };

/**
 * Купон ашиглалтын дэвтрийн (`discount_code_redemptions`, migration 0084)
 * хэрэглэгчийн түлхүүр. Нэвтэрсэн бол дансаар, зочин бол утасны сүүлийн 8
 * цифрээр — доорх тооллын ижил дүрэм. Аль нь ч байхгүй бол (нэрээ ч, утсаа ч
 * өгөөгүй) нэг хэрэглэгчийн хязгаарыг хэрэгжүүлэх боломжгүй тул null.
 */
export function discountRedemptionKey(customer: DiscountRedeemer): string | null {
  if (customer.userId) return `u:${customer.userId}`;
  const digits = customer.phone ? customer.phone.replace(/\D/g, "").slice(-8) : "";
  return digits.length === 8 ? `p:${digits}` : null;
}

export async function validateDiscountCode(rawCode: string, amountMnt: number, customer: DiscountRedeemer = { userId: null, phone: null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("Хямдралын код оруулна уу.");
  const rows = await db.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  const record = rows[0];
  if (!record || !record.isActive) throw new Error("Хямдралын код олдсонгүй.");
  if (record.expiresAt && record.expiresAt < new Date()) throw new Error("Хямдралын кодны хугацаа дууссан байна.");
  if (record.maxUses !== null && record.usesCount >= record.maxUses) throw new Error("Хямдралын код дууссан байна.");
  if (amountMnt < record.minSubtotalMnt) throw new Error(`Энэ код ${record.minSubtotalMnt.toLocaleString("mn-MN")}₮-с дээш захиалгад хамаарна.`);
  if (record.maxUsesPerCustomer !== null) {
    const phoneDigits = customer.phone ? customer.phone.replace(/\D/g, "").slice(-8) : "";
    const identityConditions = [
      ...(customer.userId ? [eq(orders.userId, customer.userId)] : []),
      ...(phoneDigits.length === 8 ? [sql`RIGHT(REGEXP_REPLACE(${orders.customerPhone}, '[^0-9]', ''), 8) = ${phoneDigits}`] : []),
    ];
    if (identityConditions.length) {
      const [usage] = await db.select({ count: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.couponCode, record.code), ne(orders.status, "cancelled"), or(...identityConditions)));
      if (Number(usage?.count ?? 0) >= record.maxUsesPerCustomer) {
        throw new Error(record.maxUsesPerCustomer === 1 ? "Та энэ кодыг аль хэдийн ашигласан байна." : `Энэ кодыг нэг хэрэглэгч хамгийн ихдээ ${record.maxUsesPerCustomer} удаа ашиглана — та хязгаартаа хүрсэн байна.`);
      }
    }
  }
  const discountMnt = record.type === "percent"
    ? Math.round(amountMnt * (record.percentValue ?? 0) / 100)
    : Math.min(record.fixedAmountMnt ?? 0, amountMnt);
  if (discountMnt <= 0) throw new Error("Энэ код одоогийн сагсанд хямдрал өгөхгүй байна.");
  return { id: record.id, code: record.code, discountMnt, maxUsesPerCustomer: record.maxUsesPerCustomer };
}

export async function discountCodeExists(code: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code.trim().toUpperCase())).limit(1);
  return Boolean(rows[0] && rows[0].id !== excludeId);
}

export async function getAdminDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(discountCodes).orderBy(desc(discountCodes.updatedAt));
}

export type DiscountCodeWriteInput = {
  code: string;
  type: "percent" | "fixed";
  percentValue?: number | null;
  fixedAmountMnt?: number | null;
  minSubtotalMnt: number;
  maxUses?: number | null;
  isActive: boolean;
  expiresAt?: Date | null;
};

export async function createAdminDiscountCode(input: DiscountCodeWriteInput, createdByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(discountCodes).values({ ...input, code: input.code.trim().toUpperCase(), createdByUserId });
  const created = await db.select().from(discountCodes).where(eq(discountCodes.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminDiscountCode(input: { id: number } & Partial<DiscountCodeWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { id, ...changes } = input;
  const existing = await db.select({ id: discountCodes.id, type: discountCodes.type, percentValue: discountCodes.percentValue, fixedAmountMnt: discountCodes.fixedAmountMnt }).from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  if (!existing[0]) throw new Error("Хямдралын код олдсонгүй.");
  // 2026-09-27: үүсгэхэд шалгадаг "percent → хувь, fixed → дүн" дүрмийг засварын
  // ЭЦСИЙН төлөв дээр дахин шалгана. Өмнө нь төрлийг fixed болгоод дүн өгөхгүй,
  // эсвэл хувийг null болгоход код бүх худалдан авагчид 0₮ хямдрал өгдөг байв.
  const merged = {
    type: changes.type ?? existing[0].type,
    percentValue: changes.percentValue !== undefined ? changes.percentValue : existing[0].percentValue,
    fixedAmountMnt: changes.fixedAmountMnt !== undefined ? changes.fixedAmountMnt : existing[0].fixedAmountMnt,
  };
  if (merged.type === "percent" ? !merged.percentValue : !merged.fixedAmountMnt) {
    throw new Error(merged.type === "percent" ? "Хувийн хямдралд хувь (1–100) заавал оруулна." : "Тогтмол хямдралд дүн заавал оруулна.");
  }
  const patch: Record<string, unknown> = { ...changes, updatedAt: new Date() };
  if (changes.code !== undefined) patch.code = changes.code.trim().toUpperCase();
  await db.update(discountCodes).set(patch).where(eq(discountCodes.id, id));
  const updated = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminDiscountCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
  return { id };
}
