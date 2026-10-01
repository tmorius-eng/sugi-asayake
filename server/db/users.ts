// server/db/users.ts — Хэрэглэгч, session, хаяг, хүслийн жагсаалт, утасны баталгаажуулалт/бүртгэл, Facebook.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { phoneVerificationSessions, products, pushSubscriptions, sessionRevocations, userAddresses, users, wishlistItems } from "../../drizzle/schema";
import { type UbDistrict } from "../../shared/districts";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { withLiveCampaign } from "./price-campaigns";
import { getDb } from "./connection";

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/**
 * The user row as the SESSION sees it, held for a few seconds
 * (2026-09-12 performance pass). Every authenticated request used to re-read
 * this row before doing any work -- one round trip to Aiven, ~170ms from
 * Bangalore, per call.
 *
 * Keyed by user id, not by session token, so that the writers below can drop
 * it the instant something security-relevant changes: a "sign out
 * everywhere" or password reset (sessionVersion), a suspension, a role
 * change, an account deletion. The first version of this cache was keyed by
 * token and could not be invalidated -- server/auth.session-versioning
 * caught it: a bumped sessionVersion was still honoured for up to five
 * seconds. Now those take effect on the very next request, and the TTL only
 * bounds staleness for fields nobody enforces access on (name, avatar).
 */
const SESSION_USER_TTL_MS = 5_000;
const sessionUserKey = (id: number) => `session-user:${id}`;

export async function getSessionUserById(id: number) {
  return getOrSetCached(sessionUserKey(id), SESSION_USER_TTL_MS, () => getUserById(id));
}

/** Every write that changes what a session is allowed to do calls this. */
export function forgetSessionUser(id: number) {
  invalidateCached(sessionUserKey(id));
}

// 2026-09-05 ("remove email!!! only phone number!!!" -- Tom, explicit):
// phone is now the required, unique account identifier (see users.phone's
// own comment in drizzle/schema.ts) -- email is optional and only ever
// populated for legacy accounts created before this date, never collected
// at registration anymore. `phone` here MUST already be the normalized
// bare 8-digit form (normalizePhoneForVerifyMn) -- callers (auth.register)
// are responsible for that, same discipline server/verifyMn.ts already
// applies before writing to this column anywhere else.
export async function createUserWithPassword(input: { phone: string; passwordHash: string; name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const existing = await findUserByPhone(input.phone);
  if (existing) throw new Error("Энэ утасны дугаараар бүртгэл үүссэн байна.");

  // 2026-10-01 (аюулгүй байдлын scan): "хамгийн эхний хэрэглэгч автоматаар admin"
  // дүрэм ХАСАГДСАН. count-аар шалгаад insert хийх нь race-тэй байсан (хоёр
  // зэрэгцээ бүртгэл хоёулаа admin болно) ба хоосон DB дээр (шинэ эзэн, staging
  // хуулбар, CI) хэн түрүүлж бүртгүүлсэн нь admin болдог байв. Одоо бүх бүртгэл
  // "user"; анхны admin-ийг серверт хандах эрхтэй хүн
  // `pnpm exec tsx scripts/make-admin.ts <утас>`-аар оноодог.
  const role = "user" as const;

  const inserted = await db.insert(users).values({
    phone: input.phone,
    passwordHash: input.passwordHash,
    name: input.name ?? null,
    role,
    lastSignedIn: new Date(),
  });
  const created = await getUserById(Number(inserted[0].insertId));
  if (!created) throw new Error("Unable to create the account.");
  return created;
}

export async function touchUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

/** Profile page (name/phone) update — email and password have their own
 *  dedicated flows (registration, forgot-password) and aren't touched here. */
// 2026-09-27: `phone` параметрийг хасав — утас нь нэвтрэлтийн identity тул зөвхөн
// SMS-ээр баталгаажсан замаар (`attachPhoneFromVerifiedSession`) бичигдэнэ.
export async function updateUserProfile(userId: number, input: { name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  return getUserById(userId);
}

export async function updateUserAvatar(userId: number, avatarUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  return getUserById(userId);
}

/** Saved delivery addresses for the profile page's address book. Default
 *  address first, then most-recently-added. */
export async function getUserAddresses(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(desc(userAddresses.isDefault), desc(userAddresses.createdAt));
}

export async function createUserAddress(userId: number, input: { label: string; recipientName: string; phone: string; addressLine: string; district?: UbDistrict | null; isDefault?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: userAddresses.id }).from(userAddresses).where(eq(userAddresses.userId, userId));
  // The very first saved address is always the default — there's no "no
  // default" state once at least one address exists, so checkout always has
  // something to prefill from.
  const makeDefault = input.isDefault === true || existing.length === 0;
  if (makeDefault) {
    await db.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
  }
  const inserted = await db.insert(userAddresses).values({
    userId,
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone,
    addressLine: input.addressLine,
    district: input.district ?? null,
    isDefault: makeDefault,
  });
  const created = await db.select().from(userAddresses).where(eq(userAddresses.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateUserAddress(userId: number, addressId: number, input: { label?: string; recipientName?: string; phone?: string; addressLine?: string; district?: UbDistrict | null; isDefault?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await db.select({ id: userAddresses.id }).from(userAddresses).where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId))).limit(1);
  if (!owned.length) throw new Error("Address not found.");
  if (input.isDefault === true) {
    await db.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
  }
  // 2026-09-23: `isDefault: false`-ыг ОДООГИЙН анхдагч дээр хэрэглэхгүй.
  // `createUserAddress`/`deleteUserAddress` нь "хаяг байгаа цагт яг нэг
  // анхдагч" гэсэн зүй тогтлыг барьдаг атал энэ зам анхдагчийг тугийг
  // авчихаад өөрийг сурталчилдаггүй тул хэрэглэгч анхдагчгүй үлдэж,
  // checkout юу ч урьдчилан бөглөхөө болино.
  const patch = { ...input };
  if (patch.isDefault === false) delete patch.isDefault;
  await db.update(userAddresses).set({ ...patch, updatedAt: new Date() }).where(eq(userAddresses.id, addressId));
  const updated = await db.select().from(userAddresses).where(eq(userAddresses.id, addressId)).limit(1);
  return updated[0];
}

export async function deleteUserAddress(userId: number, addressId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await db.select({ id: userAddresses.id, isDefault: userAddresses.isDefault }).from(userAddresses).where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId))).limit(1);
  if (!owned.length) throw new Error("Address not found.");
  await db.delete(userAddresses).where(eq(userAddresses.id, addressId));
  // Deleting the default address promotes the next most-recent one so
  // checkout still has a default to prefill from.
  if (owned[0].isDefault) {
    const remaining = await db.select({ id: userAddresses.id }).from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(desc(userAddresses.createdAt)).limit(1);
    if (remaining.length) await db.update(userAddresses).set({ isDefault: true }).where(eq(userAddresses.id, remaining[0].id));
  }
  return { success: true } as const;
}

/** Beauty & Home preference profile — see the schema doc comment on
 *  users.skinType for what these are (and aren't yet) used for. */
export async function updateUserPreferences(userId: number, input: {
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns?: string | null;
  interiorStyle?: string | null;
  birthYear?: number | null;
  occupation?: string | null;
  // Preference Profile v2 (2026-09-01) — quiz wizard fields, all optional.
  gender?: "male" | "female" | "other" | null;
  primaryDistrict?: UbDistrict | null;
  skinRoutineComplexity?: "minimal" | "moderate" | "extensive" | null;
  hairType?: "dry" | "oily" | "normal" | "damaged" | "color_treated" | null;
  hairConcerns?: string | null;
  fragrancePreference?: "unscented" | "light" | "floral" | "citrus" | null;
  wellnessInterests?: string | null;
  hasYoungChildren?: boolean | null;
  // Биеийн арчилгаа (2026-09-20, migration 0091).
  bodySkinType?: "dry" | "normal" | "sensitive" | null;
  bodyConcerns?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, userId));
  // 2026-09-20: сешн хэрэглэгч 5 секунд кэшлэгддэг (SESSION_USER_TTL_MS) тул
  // үүнгүйгээр хадгалсан өөрчлөлт `auth.me`-д тэр хугацаанд ХАРАГДАХГҮЙ —
  // асуулгаа дуусгасан худалдан авагч хоосон профайл хараад үлддэг байв
  // (шинэ E2E тест барьж авав). Аюулгүй байдлын бичигчид (нууц үг, эрх) энэ
  // дуудлагыг аль хэдийн хийдэг; профайлын бичигчид л орхигдсон байжээ.
  forgetSessionUser(userId);
  return getUserById(userId);
}

export async function updateNotificationPreferences(userId: number, input: { emailOptIn?: boolean; smsOptIn?: boolean; pushOptIn?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  return getUserById(userId);
}

/** Profile page "Аюулгүй байдал" tab — change password while staying signed
 *  in on the current device. Bumps sessionVersion (same as a forced
 *  password reset) so every OTHER already-issued session/device is logged
 *  out; the caller (server/routers.ts) re-signs a fresh token for the
 *  current request so this device isn't logged out of its own change. */
export async function changeUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
  const updated = await getUserById(userId);
  if (!updated) throw new Error("Хэрэглэгч олдсонгүй.");
  return updated;
}

/** Profile page "Аюулгүй байдал" tab — permanent self-service account
 *  deletion. Relies entirely on the FK cascade/set-null rules already
 *  established in drizzle/schema.ts (TIER 1): orders.userId -> SET NULL
 *  (order history/accounting survives), cart/address/wishlist rows ->
 *  CASCADE. Any account that has ever authored a post, edited site media,
 *  performed a logged admin action, or invited staff is guarded by a
 *  RESTRICT FK and will fail here — server/routers.ts only exposes this to
 *  plain "user" role accounts for exactly that reason, so in practice this
 *  should never hit the RESTRICT case, but the try/catch is a safety net
 *  against a stale/edge-case role. */
export async function deleteUserAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  try {
    await db.delete(users).where(eq(users.id, userId));
    forgetSessionUser(userId);
  } catch (error) {
    // 2026-09-27: зөвхөн FK-ийн (холбогдсон мөр) алдааг "агуулга үүсгэсэн" гэж
    // тайлбарлана — deadlock/холболтын алдааг байнгын татгалзал мэт харуулдаг байв.
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code !== "ER_ROW_IS_REFERENCED_2" && code !== "ER_ROW_IS_REFERENCED") throw error;
    throw new Error("Энэ акаунт агуулга (пост, лог г.м.) үүсгэсэн байгаа тул автоматаар устгах боломжгүй. Дэлгүүрийн админтай холбогдоно уу.", { cause: error });
  }
  return { success: true } as const;
}

/** Profile page "Хүслийн жагсаалт" tab. One flat wishlist per user (no
 *  named boards/collections yet — see the schema doc comment). */
export async function getWishlistForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // 2026-09-29: нийтийн хямдрал — /shop-той ижил үнэ.
  return withLiveCampaign(await db.select({
    id: wishlistItems.id,
    productId: wishlistItems.productId,
    notifyOnRestock: wishlistItems.notifyOnRestock,
    createdAt: wishlistItems.createdAt,
    name: products.name,
    nameMn: products.nameMn,
    slug: products.slug,
    priceMnt: products.priceMnt,
    compareAtPriceMnt: products.compareAtPriceMnt,
    kind: products.kind,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    isPublished: products.isPublished,
  }).from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId)).where(eq(wishlistItems.userId, userId)).orderBy(desc(wishlistItems.createdAt)));
}

export async function addWishlistItem(userId: number, productId: number, notifyOnRestock: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const productExists = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
  if (!productExists.length) throw new Error("Бүтээгдэхүүн олдсонгүй.");
  // Дахин асаахад (эсвэл унтраахад) өмнөх мөчлөгийн "мэдэгдсэн" тэмдэг арилна.
  await db.insert(wishlistItems).values({ userId, productId, notifyOnRestock }).onDuplicateKeyUpdate({ set: { notifyOnRestock, restockNotifiedAt: null } });
  return { success: true } as const;
}

export async function removeWishlistItem(userId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  return { success: true } as const;
}

/** Called from admin.updateProduct (server/routers.ts) when a product's
 *  stock crosses 0 -> >0. One-shot: watchers are cleared after notifying,
 *  so re-subscribing (toggling "Ирэхээр мэдэгдэх" again) is an explicit
 *  choice rather than a standing subscription that fires every restock. */
/**
 * "Ирэхээр мэдэгдэх" (2026-09-21, 0092) — server/automation.ts-ийн back-in-stock job.
 * Мэдэгдэх ёстой мөрүүд: асаалттай, энэ мөчлөгт хараахан мэдэгдээгүй, бараа нийтлэгдсэн
 * ба нөөцтэй, хэрэглэгч түр хаагдаагүй. Бараа тус бүрийн нэр/slug хамт (мэдэгдлийн текст).
 */
/** `productIds`: зөвхөн эдгээр бараа (integration тест өөрийн throwaway мөрөөс хальж,
 *  бодит харилцагчийн хүлээгдэж буй мэдэгдлийг "эзэмшиж" алга болгохгүйн тулд). */
export async function getPendingRestockAlerts(limit = 200, productIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  // 2026-09-27 (I12): a row with NO deliverable channel (email notifications
  // off or no email on file, AND no push subscription) used to still be
  // returned here, then claimed by runBackInStockJob and counted as
  // "notified" with nothing actually sent -- claimRestockAlert is a
  // guarded, at-most-once UPDATE, so that wishlist entry would never hear
  // about the restock again (short of the product selling out and coming
  // back, which re-arms it). Filtered out here instead, the same
  // channel-existence check getAbandonedCartsNeedingReminder already uses.
  const pushSubscriptionCount = sql<number>`(SELECT COUNT(*) FROM ${pushSubscriptions} WHERE ${pushSubscriptions.userId} = ${users.id})`;
  return db.select({
    id: wishlistItems.id,
    userId: wishlistItems.userId,
    email: users.email,
    emailOptIn: users.emailOptIn,
    productName: products.name,
    productNameMn: products.nameMn,
    productSlug: products.slug,
  }).from(wishlistItems)
    .innerJoin(users, eq(users.id, wishlistItems.userId))
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(and(
      eq(wishlistItems.notifyOnRestock, true),
      isNull(wishlistItems.restockNotifiedAt),
      eq(products.isPublished, true),
      gt(products.stockQuantity, 0),
      isNull(users.suspendedAt),
      productIds ? inArray(wishlistItems.productId, productIds) : undefined,
      or(and(eq(users.emailOptIn, true), isNotNull(users.email)), sql`${pushSubscriptionCount} > 0`),
    ))
    .orderBy(wishlistItems.id)
    .limit(limit);
}

/**
 * Мөрийг "мэдэгдсэн" болгож эзэмшинэ — илгээхээс ӨМНӨ. `WHERE restockNotifiedAt IS NULL`
 * + affectedRows === 1 (төлөв шилжүүлэх UPDATE-ийн дүрэм): хоёр процесс нэг мөрийг
 * зэрэг авбал зөвхөн нэг нь илгээнэ. Илгээлт унавал дахин оролдохгүй (at-most-once) —
 * review-request job-той ижил сонголт.
 */
export async function claimRestockAlert(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [result] = await db.update(wishlistItems).set({ restockNotifiedAt: new Date() })
    .where(and(eq(wishlistItems.id, id), isNull(wishlistItems.restockNotifiedAt)));
  return (result as { affectedRows?: number }).affectedRows === 1;
}

/** Нөөц дахин дууссан барааны мөрийг дараагийн ирэлтэд бэлдэнэ (NULL болгоно). */
export async function rearmRestockAlerts(productIds?: number[]): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const soldOut = db.select({ id: products.id }).from(products).where(and(lte(products.stockQuantity, 0), productIds ? inArray(products.id, productIds) : undefined));
  const [result] = await db.update(wishlistItems).set({ restockNotifiedAt: null })
    .where(and(isNotNull(wishlistItems.restockNotifiedAt), inArray(wishlistItems.productId, soldOut)));
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

/**
 * Invalidates every session token issued before this call (see
 * server/_core/context.ts's `sessionVersion` check). Used for an explicit
 * "sign out everywhere" request and automatically after a password reset.
 */
export async function bumpUserSessionVersion(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, id));
  forgetSessionUser(id);
}

// ---------------------------------------------------------------------------
// Нэг төхөөрөмжийн logout (2026-10-01, migration 0099). Сешн JWT `jti`-тай;
// logout түүнийг `session_revocations`-д бичнэ, resolveUserFromToken шалгана.
// Хүчингүй болсон jti-г токены хугацаа дуустал процесс дотор урт кэшлэнэ
// (хүчингүй болох нь буцдаггүй); "хүчингүй биш" гэсэн хариуг ЗӨВХӨН 5 секунд —
// нөгөө worker дээр logout хийсэн токен хамгийн ихдээ тэр хугацаанд ажиллана.
// ---------------------------------------------------------------------------
const REVOKED_NEGATIVE_TTL_MS = 5_000;
const REVOKED_CACHE_MAX = 5_000;
const revokedJtis = new Map<string, number>(); // jti -> токены хугацаа дуусах мс
const notRevokedUntil = new Map<string, number>(); // jti -> "хүчингүй биш" кэшийн дуусах мс

function rememberRevoked(jti: string, expiresAtMs: number) {
  if (revokedJtis.size >= REVOKED_CACHE_MAX) {
    const now = Date.now();
    for (const [key, exp] of revokedJtis) if (exp <= now) revokedJtis.delete(key);
    // Цэвэрлэсний дараа ч дүүрэн бол хамгийн эхний бичлэгийг гаргана — хүчингүй
    // болсон токен кэшээс гарсан ч DB-ээс дахин олдох тул аюулгүй.
    if (revokedJtis.size >= REVOKED_CACHE_MAX) {
      const oldest = revokedJtis.keys().next().value;
      if (oldest !== undefined) revokedJtis.delete(oldest);
    }
  }
  revokedJtis.set(jti, expiresAtMs);
  notRevokedUntil.delete(jti);
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  const now = Date.now();
  const known = revokedJtis.get(jti);
  if (known !== undefined) {
    if (known > now) return true;
    revokedJtis.delete(jti);
  }
  const negative = notRevokedUntil.get(jti);
  if (negative !== undefined && negative > now) return false;
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ expiresAt: sessionRevocations.expiresAt }).from(sessionRevocations).where(eq(sessionRevocations.jti, jti)).limit(1);
  if (row) {
    rememberRevoked(jti, row.expiresAt.getTime());
    return true;
  }
  if (notRevokedUntil.size >= REVOKED_CACHE_MAX) notRevokedUntil.clear();
  notRevokedUntil.set(jti, now + REVOKED_NEGATIVE_TTL_MS);
  return false;
}

/** Энэ нэг токеныг хүчингүй болгоно (бусад төхөөрөмж хөндөгдөхгүй). Давхар дуудлага аюулгүй. */
export async function revokeSessionToken(input: { jti: string; userId: number; expiresAt: Date }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sessionRevocations).values({ jti: input.jti, userId: input.userId, expiresAt: input.expiresAt }).onDuplicateKeyUpdate({ set: { jti: input.jti } });
  rememberRevoked(input.jti, input.expiresAt.getTime());
}

/** Токены хугацаа дууссан мөрийг устгана (өдөр тутмын retention job, server/automation.ts). */
export async function purgeExpiredSessionRevocations(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(sessionRevocations).where(lt(sessionRevocations.expiresAt, new Date()));
  return Number(result[0].affectedRows ?? 0);
}

/** Тест seam: процессын кэшийг март. */
export function clearSessionRevocationCacheForTests() {
  revokedJtis.clear();
  notRevokedUntil.clear();
}

// Tom, 2026-09-05 ("we do not need brevo at all"): the email-OTP password
// reset (createPasswordResetCode/resetPasswordWithCode) and email
// verification (createEmailVerificationCode/verifyEmailWithCode) functions
// that used to live here are gone -- verify.mn phone verification below is
// the only account-recovery/verification mechanism now (see
// server/routers.ts auth.register/auth.resetPasswordViaPhone). The
// password_reset_tokens/email_verification_tokens tables themselves are
// left in drizzle/schema.ts (an empty-going-forward schema, not deleted --
// dropping a live table is a separate, riskier migration with no functional
// upside here).

// --- verify.mn phone verification (2026-09-05) -----------------------------
// See server/verifyMn.ts for the HTTP integration this backs, and
// drizzle/schema.ts's comment on phoneVerificationSessions for why the
// table exists and what it does/doesn't store.

// Forgot-password's phone path needs to find the account a given phone
// number belongs to -- users.phone is free-form (spaces/dashes/+976 or not,
// whatever a shopper typed at checkout/in their profile), so this compares
// digits-only, right-anchored to the 8-digit local mobile number, rather
// than requiring an exact string match against however it happened to be
// stored. Returns undefined (not an error) when nothing matches -- the only
// caller (auth.startPhoneVerification) treats "no match" as a normal,
// anti-enumeration-safe outcome, not a failure.
export async function findUserByPhone(localEightDigitPhone: string) {
  const db = await getDb();
  if (!db) return undefined;
  if (!/^\d{8}$/.test(localEightDigitPhone)) return undefined;
  // Audit finding BUG-005 (2026-09-06): wrapping the indexed `phone` column
  // in REGEXP_REPLACE/RIGHT below defeats the users.phone UNIQUE index --
  // every call was a full table scan, on the single highest-traffic query in
  // the app (every login, register-duplicate-check, and password-reset
  // attempt runs through this). In practice every current write path
  // (auth.register/completeRegistration, admin.updateUserPhone,
  // profile.update, attachPhoneFromVerifiedSession) already normalizes to
  // this exact bare 8-digit form before writing -- so try a plain indexed
  // exact match first. It's a straight semantic no-op (still returns the
  // same row an exact-format phone would have matched via the slow path
  // below), just fast for the overwhelming majority of real rows. Only a
  // legacy row written in some other format (pre-dating that normalization
  // discipline, or a manual DB edit) falls through to the original
  // full-scan comparison, so matching behavior is unchanged either way.
  const fastMatch = await db.select().from(users).where(eq(users.phone, localEightDigitPhone)).limit(1);
  if (fastMatch[0]) return fastMatch[0];
  const result = await db.select().from(users).where(sql`RIGHT(REGEXP_REPLACE(${users.phone}, '[^0-9]', ''), 8) = ${localEightDigitPhone}`).limit(1);
  return result[0];
}

// Inserted BEFORE calling verify.mn's API (see createVerificationSession's
// own comment for why: our callback URL has to name this row's id, but that
// URL is submitted in the same POST that returns verify.mn's real session
// id, so we can't have the real id yet). verifyMnSessionId is NOT NULL
// UNIQUE, so a random local placeholder fills that column until
// attachVerifyMnSessionId overwrites it.
/** Энэ дугаарт сүүлийн `windowMs`-д үүссэн баталгаажуулах сесс (2026-09-27, SMS-ийн утас тус бүрийн хязгаар). */
export async function countRecentPhoneVerificationSessions(phone: string, windowMs: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - windowMs);
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(phoneVerificationSessions)
    .where(and(eq(phoneVerificationSessions.phone, phone), gte(phoneVerificationSessions.createdAt, since)));
  return Number(row?.count ?? 0);
}

export async function createPendingPhoneVerificationSession(input: { userId: number | null; purpose: "register" | "password_reset" | "checkout"; phone: string; code: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const placeholder = `pending:${randomBytes(16).toString("hex")}`;
  const inserted = await db.insert(phoneVerificationSessions).values({ userId: input.userId, purpose: input.purpose, phone: input.phone, verifyMnSessionId: placeholder, code: input.code, expiresAt: input.expiresAt });
  return Number(inserted[0].insertId);
}

export async function attachVerifyMnSessionId(id: number, verifyMnSessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(phoneVerificationSessions).set({ verifyMnSessionId }).where(eq(phoneVerificationSessions.id, id));
}

// Cleans up a reserved row when the verify.mn API call itself failed (bad
// key, network error, etc.) -- otherwise a placeholder row with a fake
// verifyMnSessionId would sit there forever, matching nothing real.
export async function deletePendingPhoneVerificationSession(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(phoneVerificationSessions).where(eq(phoneVerificationSessions.id, id));
}

export async function getPhoneVerificationSessionByLocalId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(phoneVerificationSessions).where(eq(phoneVerificationSessions.id, id)).limit(1);
  return result[0];
}

export async function getPhoneVerificationSessionByVerifyMnId(verifyMnSessionId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(phoneVerificationSessions).where(eq(phoneVerificationSessions.verifyMnSessionId, verifyMnSessionId)).limit(1);
  return result[0];
}

/**
 * Spends a verified checkout session on exactly one order (2026-09-14). The
 * guarded UPDATE is the lock: a second order that presents the same session
 * sees affectedRows 0 and is refused, so one 150₮ SMS cannot vouch for a
 * stream of orders.
 */
export async function consumeCheckoutPhoneVerificationSession(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(phoneVerificationSessions).set({ consumedAt: new Date(), status: "verified" })
    .where(and(eq(phoneVerificationSessions.id, id), eq(phoneVerificationSessions.purpose, "checkout"), isNull(phoneVerificationSessions.consumedAt)));
  return Number(result[0].affectedRows ?? 0) === 1;
}

/**
 * Эзэмшсэн checkout сессийг буцааж суллана (2026-09-23). Захиалга үүсгэх
 * оролдлого уначихвал (сагс хоосон, нөөц хүрэлцэхгүй г.м.) худалдан авагчийг
 * дахин 150₮ төлж баталгаажуулахад хүргэхгүйн тулд эзэмшилтийг буцаана.
 */
export async function releaseCheckoutPhoneVerificationSession(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(phoneVerificationSessions).set({ consumedAt: null })
    .where(and(eq(phoneVerificationSessions.id, id), eq(phoneVerificationSessions.purpose, "checkout")));
}

export async function updatePhoneVerificationSessionStatus(id: number, status: "pending" | "verified" | "expired") {
  const db = await getDb();
  if (!db) return;
  await db.update(phoneVerificationSessions).set({ status }).where(eq(phoneVerificationSessions.id, id));
}

// Spends a VERIFIED password_reset session: updates the linked user's
// password and bumps sessionVersion in the same update (same "kill every
// other existing session the moment the password changes" discipline
// resetPasswordWithCode already applies to the email-code path above), then
// marks the session consumed so it can't be replayed. Caller
// (auth.resetPasswordViaPhone) is responsible for re-checking verify.mn's
// LIVE status immediately before calling this -- this function trusts
// whatever status is already on the row, so it must be fresh.
class PhoneChangedError extends Error {}

export async function resetPasswordViaPhoneSession(input: { sessionId: number; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const session = await getPhoneVerificationSessionByLocalId(input.sessionId);
  if (!session || session.purpose !== "password_reset" || !session.userId) throw new Error("Баталгаажуулалт олдсонгүй.");
  if (session.consumedAt) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");
  if (session.expiresAt.getTime() <= Date.now()) throw new Error("Баталгаажуулалтын хугацаа дууссан байна.");
  if (session.status !== "verified") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");

  // Audit finding BUG-003 (2026-09-06): the `consumedAt` check above is a
  // plain read, not a DB-level guard -- two concurrent calls with the same
  // sessionId (a double-click, a flaky-network client retry) could both pass
  // it before either commits. Claiming the session with the same
  // WHERE-guard + affectedRows idiom createOrderFromActiveCart's stock
  // decrement already uses elsewhere in this file closes that: exactly one
  // concurrent caller can ever win this UPDATE, so only one password change
  // ever actually applies.
  const claimed = await db.update(phoneVerificationSessions)
    .set({ consumedAt: new Date() })
    .where(and(eq(phoneVerificationSessions.id, session.id), isNull(phoneVerificationSessions.consumedAt)));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");

  try {
    // 2026-10-01: `users.phone = session.phone` нөхцөл. Сесс нь утсаар баталгаажсан;
    // тэр хооронд дансны утас солигдсон (эсвэл хэн нэгэн хуучин утсаа авсан) бол
    // хуучин утасны баталгаажуулалтаар НЭГ ӨӨР утастай дансны нууц үгийг солихгүй.
    const updated = await db.update(users)
      .set({ passwordHash: input.passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(users.id, session.userId), eq(users.phone, session.phone)));
    if (Number(updated[0].affectedRows ?? 0) !== 1) throw new PhoneChangedError();
    forgetSessionUser(session.userId);
  } catch (error) {
    // Claimed the session but the actual password update failed (a genuine
    // DB error) -- release the claim so the shopper isn't left with a
    // burned, unusable session and no changed password.
    await db.update(phoneVerificationSessions).set({ consumedAt: null }).where(eq(phoneVerificationSessions.id, session.id));
    if (error instanceof PhoneChangedError) throw new Error("Энэ баталгаажуулалт одоогийн утасны дугаарт хамаарахгүй байна. Нууц үг сэргээх хүсэлтээ шинээр эхлүүлнэ үү.", { cause: error });
    throw error;
  }
  return { userId: session.userId };
}

// 2026-09-06 (Tom, after watching an unverified registration go through
// with his wife's phone number: "ehneriinhee utasiig hiigeed burtguulsen
// chine shuud burtgegdej baina!! verify.mn geed ajilahgui baina" --
// reversing the earlier "optional, contact admin if typo'd" call once he
// saw what skipping verification actually allowed): registration now
// REQUIRES a live-confirmed SMS reply before an account exists at all, so
// this is the real signup path -- the session was created with userId:null
// (see auth.startPhoneVerification's purpose:"register" branch), and this
// is what actually creates the account once verify.mn confirms it. Distinct
// from attachPhoneFromVerifiedSession below (which attaches a phone to an
// ALREADY-EXISTING logged-in user -- still valid for a possible future
// Profile "change my phone" feature, just no longer reachable from Login.tsx
// since verification now happens before an account exists, not after).
export async function completeRegistrationViaPhoneSession(input: { sessionId: number; passwordHash: string; name: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const session = await getPhoneVerificationSessionByLocalId(input.sessionId);
  if (!session || session.purpose !== "register") throw new Error("Баталгаажуулалт олдсонгүй.");
  // ⚠️ `consumedAt`-ийг `userId`-аас ӨМНӨ шалгана (2026-09-16). Ялагч нь
  // дарааллаар: (1) сессийг атомикаар эзэмшиж `consumedAt` тавина, (2)
  // хэрэглэгч үүсгэнэ, (3) сесс дээр `userId` бичнэ. Хожигдогч (3)-ын
  // ДАРАА уншвал өмнө нь `userId` шалгалт эхэлж "Баталгаажуулалт
  // олдсонгүй" гэж ТӨӨРӨГДҮҮЛЭХ мессеж өгдөг байв — сесс нь байгаа,
  // зүгээр л дөнгөж ашиглагдсан. Хурдан DB дээр (CI) хожигдогч үргэлж
  // (3)-ын дараа уншдаг тул мессеж орчноос хамаарч хоёр янз гарч байв.
  if (session.consumedAt) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");
  if (session.userId) throw new Error("Баталгаажуулалт олдсонгүй.");
  if (session.expiresAt.getTime() <= Date.now()) throw new Error("Баталгаажуулалтын хугацаа дууссан байна.");
  if (session.status !== "verified") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");

  // Audit finding BUG-003 (2026-09-06): claim the session atomically BEFORE
  // creating any account -- the plain `session.consumedAt` read above can't
  // stop two concurrent calls (a double-click, a client retry) with the
  // same sessionId from both reaching createUserWithPassword. Previously the
  // users.phone UNIQUE constraint was the only thing stopping a genuine
  // duplicate account, which meant the losing racer got a raw DB
  // constraint-violation error instead of the clean "already used" message.
  // Same WHERE-guard + affectedRows idiom as createOrderFromActiveCart's
  // stock decrement: exactly one concurrent caller can ever win this UPDATE.
  const claimed = await db.update(phoneVerificationSessions)
    .set({ consumedAt: new Date() })
    .where(and(eq(phoneVerificationSessions.id, session.id), isNull(phoneVerificationSessions.consumedAt)));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");

  try {
    const user = await createUserWithPassword({ phone: session.phone, passwordHash: input.passwordHash, name: input.name });
    await db.update(phoneVerificationSessions).set({ userId: user.id }).where(eq(phoneVerificationSessions.id, session.id));
    return user;
  } catch (error) {
    // Claimed the session but account creation failed -- release the claim
    // so it isn't burned for nothing and the shopper can retry.
    await db.update(phoneVerificationSessions).set({ consumedAt: null }).where(eq(phoneVerificationSessions.id, session.id));
    throw error;
  }
}

// Spends a VERIFIED register session: attaches the phone number to the
// account that started the verification (set at session-creation time, for
// an already-logged-in user attaching/changing their own phone -- see
// auth.startPhoneVerification's ctx.user branch). Same fresh-status
// contract as resetPasswordViaPhoneSession above.
export async function attachPhoneFromVerifiedSession(input: { sessionId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const session = await getPhoneVerificationSessionByLocalId(input.sessionId);
  if (!session || session.purpose !== "register" || !session.userId) throw new Error("Баталгаажуулалт олдсонгүй.");
  if (session.consumedAt) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");
  if (session.expiresAt.getTime() <= Date.now()) throw new Error("Баталгаажуулалтын хугацаа дууссан байна.");
  if (session.status !== "verified") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");

  // Audit finding BUG-003 (2026-09-06): same atomic-claim fix as
  // resetPasswordViaPhoneSession/completeRegistrationViaPhoneSession above --
  // see either's comment for why the plain `session.consumedAt` read alone
  // isn't race-proof.
  const claimed = await db.update(phoneVerificationSessions)
    .set({ consumedAt: new Date() })
    .where(and(eq(phoneVerificationSessions.id, session.id), isNull(phoneVerificationSessions.consumedAt)));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");

  try {
    // 2026-10-01: утас бол нэвтрэлтийн identity — солигдоход бусад төхөөрөмж (хуучин утсаар
    // нэвтэрсэн, хулгайлагдсан сешн) гарна. Дуудагч (auth.attachPhoneViaVerification)
    // ЭНЭ төхөөрөмжид шинэ сешн cookie олгоно.
    await db.update(users).set({ phone: session.phone, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, session.userId));
    // 2026-09-23: сешний 5 секундын кэш — үүнгүйгээр шинэ утас тэр хугацаанд
    // `ctx.user.phone`-д харагдахгүй (checkout-ийн зочны OTP шалгалт үүнээс хамаарна).
    forgetSessionUser(session.userId);
  } catch (error) {
    await db.update(phoneVerificationSessions).set({ consumedAt: null }).where(eq(phoneVerificationSessions.id, session.id));
    throw error;
  }
  return { userId: session.userId };
}

// ---------------------------------------------------------------------------
// "Continue with Facebook" (2026-09-13, migration 0072). Phone remains the
// primary identifier; a Facebook sign-in either finds the account already
// linked to that app-scoped id or creates a phone-less account (the profile
// page can attach a verified phone later). passwordHash is NOT NULL, so a
// Facebook-created account gets a hash of a random 32-byte secret nobody
// knows -- password login for it is impossible until a reset sets one.
// ---------------------------------------------------------------------------

export async function findUserByFacebookId(facebookId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [user] = await db.select().from(users).where(eq(users.facebookId, facebookId)).limit(1);
  return user;
}

export async function createUserFromFacebook(input: { facebookId: string; name: string | null; email: string | null; avatarUrl: string | null; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // Email is unique; if another account already carries this address, leave
  // it off rather than fail the whole sign-in (email is not a login key here).
  let email = input.email;
  if (email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) email = null;
  }
  const inserted = await db.insert(users).values({
    facebookId: input.facebookId,
    name: input.name,
    email,
    avatarUrl: input.avatarUrl,
    passwordHash: input.passwordHash,
    role: "user",
    lastSignedIn: new Date(),
  });
  return getUserById(Number(inserted[0].insertId));
}

/** Link a Facebook id to an already signed-in account (profile page). Fails if that id belongs to someone else. */
export async function linkFacebookIdToUser(userId: number, facebookId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const other = await findUserByFacebookId(facebookId);
  if (other && other.id !== userId) throw new Error("Энэ Facebook данс өөр бүртгэлтэй холбогдсон байна.");
  // 2026-09-27: аль хэдийн ӨӨР Facebook холбогдсон бол чимээгүй солихгүй — хулгайлсан
  // session нууц үггүйгээр дансны сошиал нэвтрэлтийг өөрийн Facebook руу чиглүүлж чаддаг байв.
  const [self] = await db.select({ facebookId: users.facebookId }).from(users).where(eq(users.id, userId)).limit(1);
  if (self?.facebookId && self.facebookId !== facebookId) throw new Error("Энэ дансанд өөр Facebook аль хэдийн тохируулагдсан байна. Солих бол дэлгүүрийн админтай ярина уу.");
  await db.update(users).set({ facebookId }).where(eq(users.id, userId));
  forgetSessionUser(userId);
}

/**
 * Facebook холбоосыг салгана (2026-10-01). Хэрэглэгч өөрөө (нууц үгээр баталгаажуулсны
 * дараа — auth.unlinkFacebook) эсвэл admin (admin.clearUserFacebook) дууддаг.
 * Холбоогүй байсан ч алдаагүй (idempotent).
 */
export async function clearFacebookIdForUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ facebookId: null, updatedAt: new Date() }).where(eq(users.id, userId));
  forgetSessionUser(userId);
}
