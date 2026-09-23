// server/db/customers.ts — Admin: хэрэглэгчийн жагсаалт/дэлгэрэнгүй, гишүүнчлэлийн төлөв, түр хаах, эрх, утас.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { orders, pushSubscriptions, users } from "../../drizzle/schema";
import { getLoyaltyTier, getNextLoyaltyTier } from "../../shared/loyalty";
import { escapeLike, getDb, settledSaleSql } from "./connection";
import { getLoyaltyTierTable } from "./site";
import { findUserByPhone, forgetSessionUser } from "./users";

// Audit 2026-09-09 (R4): server-side page + search, instead of shipping the
// entire users table to the browser on every open of the Users section.
// Invisible with today's handful of accounts; the point is that it stays
// invisible at 50,000. Search is a plain prefix/contains match on the three
// columns the old client-side filter used, so the admin sees exactly the
// same results as before, just computed where the data is.
export async function getAdminUsers(input: { search?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const search = input.search?.trim() ?? "";
  // 2026-09-23: `%`/`_` нь LIKE-ийн орлуулагч тул хайлтын үгнээс салгана.
  const pattern = `%${escapeLike(search)}%`;
  const where = search ? or(like(users.name, pattern), like(users.email, pattern), like(users.phone, pattern)) : undefined;
  const [rows, [countRow]] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
    }).from(users).where(where).orderBy(desc(users.lastSignedIn), desc(users.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(users).where(where),
  ]);
  return { rows, total: Number(countRow?.count ?? 0) };
}

// Admin overhaul (2026-09-08, Phase J): the campaign composer always sends
// to an explicit, already-resolved userIds[] (never a server-side "resolve
// this filter at send time") -- this is the one place that list gets turned
// back into real contact info + opt-in flags, right before actually
// sending, so what was previewed is exactly who gets messaged.
export async function getUsersForCampaignSend(userIds: number[]) {
  const db = await getDb();
  if (!db || userIds.length === 0) return [];
  // `pushSubscriptionCount` (2026-09-16): push сувгийн эрхшээл нь зөвхөн туг
  // биш — тухайн хүн ЯМАР НЭГЭН хөтөч дээр бүртгүүлсэн байх ёстой. Үүнгүйгээр
  // админ "500 хүнд илгээлээ" гэж харах атлаа хэн ч хүлээж авахгүй.
  //
  // ⚠️ Хоёр асуулгаар. Эхний хувилбар нь `sql`-ийн дотор хамаарсан дэд асуулга
  // (`select count(*) from ${pushSubscriptions} where …`) байсан бөгөөд
  // бодит мөр байхад ч ТЭГ буцааж байв — алдаа шиддэггүй, зүгээр л чимээгүй
  // буруу. (Түүхий SQL-ээр тоолоход 1, ижил дуудлагад дэд асуулга 0.) Тоолол
  // тусдаа асуулга болсноор юу ажиллаж байгаа нь харагдана.
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    emailOptIn: users.emailOptIn,
    smsOptIn: users.smsOptIn,
    pushOptIn: users.pushOptIn,
    // 2026-09-23: хаагдсан данс кампанит ажилд ОРОХГҮЙ. Back-in-stock ажил
    // аль хэдийн `isNull(users.suspendedAt)`-аар шүүдэг байсан ч энэ зам
    // зөвхөн opt-in тугуудыг хардаг тул зүй бус үйлдлийн улмаас хаагдсан
    // данс төлбөртэй маркетингийн SMS/push авсаар байв.
    suspendedAt: users.suspendedAt,
  }).from(users).where(and(inArray(users.id, userIds), isNull(users.suspendedAt)));

  const subscriptionCounts = await db
    .select({ userId: pushSubscriptions.userId, total: sql<number>`count(*)` })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds))
    .groupBy(pushSubscriptions.userId);
  const byUser = new Map(subscriptionCounts.map(row => [row.userId, Number(row.total)]));

  return rows.map(row => ({ ...row, pushSubscriptionCount: byUser.get(row.id) ?? 0 }));
}

export async function getAdminUserDetail(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    role: users.role,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
    suspendedAt: users.suspendedAt,
    suspendedReason: users.suspendedReason,
    loyaltyManualAdjustmentMnt: users.loyaltyManualAdjustmentMnt,
    storeCreditMnt: users.storeCreditMnt,
    branchId: users.branchId,
  }).from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return null;

  const [userOrders, [spendRow]] = await Promise.all([
    db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalMnt: orders.totalMnt,
      createdAt: orders.createdAt,
      // 2026-09-23: `id` тэнцвэр — секундын нарийвчлалтай timestamp-д нэг
      // секундийн хоёр захиалгын дараалал MySQL-д баталгаагүй.
    }).from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt), desc(orders.id)),
    db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), settledSaleSql)),
  ]);

  const onlineSpendMnt = Number(spendRow?.total ?? 0);
  const totalSpendMnt = onlineSpendMnt + user.loyaltyManualAdjustmentMnt;
  const adminTiers = await getLoyaltyTierTable();
  return {
    ...user,
    orders: userOrders,
    totalSpentMnt: onlineSpendMnt, // kept for the existing admin panel display
    loyalty: { onlineSpendMnt, totalSpendMnt, manualAdjustmentMnt: user.loyaltyManualAdjustmentMnt, currentTier: getLoyaltyTier(totalSpendMnt, adminTiers), nextTier: getNextLoyaltyTier(totalSpendMnt, adminTiers) },
  };
}

/** admin.updateUserLoyaltyAdjustment — bridges the physical-POS gap: an
 *  admin can credit a customer with known in-store lifetime spend so their
 *  online tier reflects reality, without any Smart POS API integration. */
export async function updateUserLoyaltyAdjustment(userId: number, adjustmentMnt: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current[0]) throw new Error("User not found.");
  await db.update(users).set({ loyaltyManualAdjustmentMnt: adjustmentMnt, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  return getAdminUserDetail(userId);
}

/** /profile "Гишүүнчлэлийн карт" + the checkout discount preview. The
 *  physical POS card number is the customer's phone number — mirrored here
 *  so the same card concept lines up for a customer holding both. */
export async function getUserLoyaltyStatus(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ phone: users.phone, loyaltyManualAdjustmentMnt: users.loyaltyManualAdjustmentMnt }).from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return null;
  const [spendRow] = await db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), settledSaleSql));
  const onlineSpendMnt = Number(spendRow?.total ?? 0);
  const totalSpendMnt = onlineSpendMnt + user.loyaltyManualAdjustmentMnt;
  // 2026-09-12: the ladder is admin-editable now (loyalty_tiers), so it is
  // read per call rather than closed over from a module constant.
  const tiers = await getLoyaltyTierTable();
  const nextTier = getNextLoyaltyTier(totalSpendMnt, tiers);
  // Home redesign Quick Stats section: lifetime money actually saved via the
  // loyalty tier discount, kept mathematically separate from totalSpendMnt
  // (spend) and currentTier.discountPercent (rate). Same "same bar as
  // loyalty spend" filter as onlineSpendMnt just above -- paymentStatus
  // ="paid" only, not order `status` -- so a shopper's tier/discount% and
  // their savings total can never silently disagree about which orders
  // count (mirrors the reasoning already documented on
  // getBestsellingProducts for the same paymentStatus-vs-status choice).
  // orders.loyaltyDiscountMnt is a column entirely separate from
  // orders.discountMnt (routine) and orders.couponDiscountMnt (coupon), so
  // summing it alone can't leak either of those into "loyalty savings".
  const [savingsRow] = await db.select({ total: sql<number>`coalesce(sum(${orders.loyaltyDiscountMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), settledSaleSql));
  const totalLoyaltySavingsMnt = Number(savingsRow?.total ?? 0);
  return {
    cardNumber: user.phone,
    onlineSpendMnt,
    manualAdjustmentMnt: user.loyaltyManualAdjustmentMnt,
    totalSpendMnt,
    totalLoyaltySavingsMnt,
    currentTier: getLoyaltyTier(totalSpendMnt, tiers),
    nextTier,
    tiers,
    amountToNextTierMnt: nextTier ? nextTier.minSpendMnt - totalSpendMnt : null,
  };
}

/**
 * PREMIUM-FEATURES.md TIER 5: real, enforced discount — computed from the
 * shopper's actual cumulative paid spend at order-creation time, applied on
 * top of whatever the routine discount already took off `amountMnt` (see
 * createOrderFromActiveCart below). Guests (no userId) never qualify — the
 * membership card is tied to a registered account, same as the physical one
 * is tied to a phone number on file.
 */
export async function getApplicableLoyaltyDiscount(userId: number | undefined, amountMnt: number) {
  if (!userId || amountMnt <= 0) return null;
  const status = await getUserLoyaltyStatus(userId);
  if (!status || status.currentTier.discountPercent <= 0) return null;
  const discountMnt = Math.round(amountMnt * status.currentTier.discountPercent / 100);
  if (discountMnt <= 0) return null;
  return { tierName: status.currentTier.name, discountPercent: status.currentTier.discountPercent, discountMnt };
}

export async function suspendUser(input: { userId: number; reason?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!current[0]) throw new Error("User not found.");
  await db.update(users).set({ suspendedAt: new Date(), suspendedReason: input.reason?.trim() || null, updatedAt: new Date() }).where(eq(users.id, input.userId));
  forgetSessionUser(input.userId);
  const updated = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const { passwordHash: _passwordHash, ...safeUser } = updated[0];
  return safeUser;
}

export async function unsuspendUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current[0]) throw new Error("User not found.");
  await db.update(users).set({ suspendedAt: null, suspendedReason: null, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const { passwordHash: _passwordHash, ...safeUser } = updated[0];
  return safeUser;
}

// 2026-09-05 ("admin invite staff section just change it to manually only
// admin give staff role to default users" -- Tom, explicit): the whole
// email-invitation flow (createStaffInvitation/getStaffInvitationByTokenHash/
// acceptStaffInvitation/revokeStaffInvitation/getAdminStaffInvitations, plus
// the invites.* router and /invite/:token page) is removed -- it also
// depended on matching an invitee's email, which doesn't fit a phone-first
// account model anyway. updateAdminUserRole below (already existed, already
// wired to a per-row role <select> in the admin Users panel) is now the
// *only* way to grant staff/admin: pick an existing, already-registered
// user and change their role directly. The staff_invitations table itself
// is left in place, unused -- same call as the old password/email-code
// tables made during the Brevo removal (dropping a live table is a
// separate, riskier migration with no functional upside here).
export async function updateAdminUserRole(input: { userId: number; role: "user" | "staff" | "finance" | "marketing" | "warehouse" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user[0]) throw new Error("User not found.");
  await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
  forgetSessionUser(input.userId);
  return { ...user[0], role: input.role };
}

// 2026-09-05: the account-recovery path for "require phone for everyone"
// (Tom's explicit choice over keeping legacy email accounts working) -- a
// legacy account with no phone on file can't log in at all anymore (login
// is phone+password only, see auth.login), and a shopper who mistypes their
// number at registration can't self-serve a phone-based reset to the WRONG
// number either. Both resolve the same way Tom asked for: contact an admin,
// who corrects/sets the phone here. No password touched -- once the phone
// is right, the account's existing password keeps working immediately
// (login just needed the right phone to find the row), and the normal
// verify.mn forgot-password flow (server/verifyMn.ts) works from then on
// if they've also forgotten the password.
export async function updateAdminUserPhone(input: { userId: number; phone: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user[0]) throw new Error("Хэрэглэгч олдсонгүй.");
  if (input.phone) {
    const existing = await findUserByPhone(input.phone);
    if (existing && existing.id !== input.userId) throw new Error("Энэ утасны дугаарыг өөр хэрэглэгч ашиглаж байна.");
  }
  await db.update(users).set({ phone: input.phone, updatedAt: new Date() }).where(eq(users.id, input.userId));
  // 2026-09-23: сешн 5 секунд кэштэй (PROJECT-GUIDE-ийн дүрэм: `users`-д
  // бичдэг ЯМАР Ч зам `forgetSessionUser` дуудна). Утас нь нэвтрэх нэр, /profile
  // дээр харагдах ба checkout-д урьдчилан бөглөгддөг тул засварын дараа
  // худалдан авагч тэр хугацаанд хуучин дугаараа хардаг байв.
  forgetSessionUser(input.userId);
  return { ...user[0], phone: input.phone };
}
