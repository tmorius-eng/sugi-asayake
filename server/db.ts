import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { adminAuditLogs, branches, branchStock, cartItems, carts, discountCodes, faceAttempts, faceChallenges, faceEnrollments, featuredBrands, InsertProduct, InsertProductCategory, InsertUser, integrationConfigs, loginAttempts, marketingSpend, mediaLibrary, orderItems, orders, paymentAttempts, phoneVerificationSessions, postCategories, postCategoryLinks, posts, postTagLinks, postTags, productCategories, productReviews, productVariants, products, routines, routineSteps, scheduledJobRuns, siteMedia, siteText, sitePromotions, storeCreditLedger, storeSettings, userAddresses, users, visitorSessions, wishlistItems } from "../drizzle/schema";
import { slugify } from "../shared/slugify";
import { guessDistrictFromAddress, type UbDistrict } from "../shared/districts";
import { getStoreSettingSlot, type StoreSettingKey } from "../shared/store-settings";
import { decryptJson, encryptJson } from "./_core/crypto";
import { sqlQueryLogger } from "./_core/sqlQueryLog";
import { ENV } from './_core/env';
import { sanitizePostContent } from "./_core/sanitizeHtml";
import { getInventoryReservationFailure, shouldRestoreStock } from "./commerce-lifecycle";
import { getLoyaltyTier, getNextLoyaltyTier } from "../shared/loyalty";
import { applyDiversityCap, computeCategoryAffinity, filterCatalogBrand, filterCatalogPriceRange, filterCatalogProducts, filterCatalogSkinType, filterCatalogStock, getCatalogCategories, getCatalogSkinTypes, scorePreferenceMatch, scorePriceBandAffinity, sortCatalogProducts, type CatalogSortOption, type PreferenceProfile, type SkinType } from "../shared/catalog-filter";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Backend audit (2026-09-02): drizzle(connectionString) used to pass
      // a bare string, which lets mysql2 apply its own defaults for
      // everything (connectionLimit: 10, queueLimit: 0/unbounded, no
      // connectTimeout, no keepAlive). CLAUDE.md documents real, repeated
      // Aiven network-latency spikes serious enough that vitest's own test
      // timeout had to be raised from 5s to 30s; production code had zero
      // handling for the same kind of blip -- a slow Aiven response just
      // hung whatever request was in flight indefinitely instead of
      // failing cleanly. connectTimeout bounds how long a NEW connection
      // attempt can hang (it does not bound an already-established
      // connection's query time -- mysql2 has no simple per-query timeout
      // independent of the connection itself), so this is a targeted,
      // proportionate fix for the specific documented failure mode, not a
      // general retry/circuit-breaker layer. Passed via drizzle's own
      // { connection: {...} } config form (rather than constructing a
      // mysql2 Pool by hand) so drizzle creates the pool with its own
      // resolved copy of mysql2 -- avoids a cross-package Pool type clash
      // when pnpm hoists a different mysql2 version at the workspace root.
      // Phase K: every query Drizzle issues also passes through the
      // in-process ring buffer that backs the admin "SQL лог" tab (see
      // server/_core/sqlQueryLog.ts for why this can't just read Aiven's
      // own slow-query log instead).
      _db = drizzle({ connection: { uri: process.env.DATABASE_URL, connectTimeout: 10_000, enableKeepAlive: true }, logger: sqlQueryLogger });
      // drizzle-orm's mysql `timestamp` column hard-assumes the DB session
      // is UTC: it reads a raw wire value and appends "+0000" (see
      // node_modules/drizzle-orm/mysql-core/columns/timestamp.js), and
      // writes a Date by stripping its own UTC ISO string down to a plain
      // "YYYY-MM-DD HH:MM:SS". If the MySQL session's time_zone is
      // anything else (MySQL's default is `SYSTEM`, i.e. the server OS's
      // local zone — not UTC), `NOW()`/`defaultNow()` columns come back
      // shifted by the local UTC offset relative to app-computed Date
      // values (confirmed locally: an 8-hour skew against Asia/Ulaanbaatar,
      // caught by a `dateFrom`/`dateTo` audit-log filter test that compared
      // a `createdAt` column straight against `new Date()`). Force every
      // pooled connection to UTC so app-computed and DB-generated
      // timestamps are always comparable.
      _db.$client.on("connection", connection => connection.query("SET time_zone = '+00:00'"));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// TIER 6: lightweight admin-panel "is the database reachable" check — a bare
// SELECT 1, not a real query, so it's cheap enough to run on every dashboard
// load. Never throws: reports the failure instead, same contract as
// storagePing() in server/storage.ts.
export async function dbPing(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) return { ok: false, error: "DATABASE_URL тохируулаагүй байна." };
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown database error" };
  }
}

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

  // The very first account on a fresh deployment is granted admin
  // automatically -- this replaces the old "openId === ENV.ownerOpenId"
  // bootstrap rule. The old second bootstrap path (email === OWNER_EMAIL)
  // is gone along with it: registration no longer collects an email to
  // compare, and the one real owner account already exists with admin role
  // and its own phone on file. ENV.ownerEmail itself is untouched -- it
  // still routes owner alert emails (server/_core/notification.ts).
  const [{ userCount }] = await db.select({ userCount: sql<number>`count(*)` }).from(users);
  const isFirstUser = Number(userCount) === 0;
  const role: "user" | "admin" = isFirstUser ? "admin" : "user";

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
export async function updateUserProfile(userId: number, input: { name?: string | null; phone?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function updateUserAvatar(userId: number, avatarUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId));
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
  await db.update(userAddresses).set({ ...input, updatedAt: new Date() }).where(eq(userAddresses.id, addressId));
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function updateNotificationPreferences(userId: number, input: { emailOptIn?: boolean; smsOptIn?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, userId));
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
  } catch {
    throw new Error("Энэ акаунт агуулга (пост, лог г.м.) үүсгэсэн байгаа тул автоматаар устгах боломжгүй. Дэлгүүрийн админтай холбогдоно уу.");
  }
  return { success: true } as const;
}

/** Profile page "Хүслийн жагсаалт" tab. One flat wishlist per user (no
 *  named boards/collections yet — see the schema doc comment). */
export async function getWishlistForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: wishlistItems.id,
    productId: wishlistItems.productId,
    notifyOnRestock: wishlistItems.notifyOnRestock,
    createdAt: wishlistItems.createdAt,
    name: products.name,
    slug: products.slug,
    priceMnt: products.priceMnt,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    isPublished: products.isPublished,
  }).from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId)).where(eq(wishlistItems.userId, userId)).orderBy(desc(wishlistItems.createdAt));
}

export async function addWishlistItem(userId: number, productId: number, notifyOnRestock: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const productExists = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
  if (!productExists.length) throw new Error("Бүтээгдэхүүн олдсонгүй.");
  await db.insert(wishlistItems).values({ userId, productId, notifyOnRestock }).onDuplicateKeyUpdate({ set: { notifyOnRestock } });
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
export async function getWishlistWatchersForProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ userId: wishlistItems.userId, email: users.email, emailOptIn: users.emailOptIn })
    .from(wishlistItems)
    .innerJoin(users, eq(users.id, wishlistItems.userId))
    .where(and(eq(wishlistItems.productId, productId), eq(wishlistItems.notifyOnRestock, true)));
}

export async function clearWishlistNotifyFlagsForProduct(productId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(wishlistItems).set({ notifyOnRestock: false }).where(eq(wishlistItems.productId, productId));
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
export async function createPendingPhoneVerificationSession(input: { userId: number | null; purpose: "register" | "password_reset"; phone: string; code: string; expiresAt: Date }) {
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
    await db.update(users).set({ passwordHash: input.passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, session.userId));
  } catch (error) {
    // Claimed the session but the actual password update failed (a genuine
    // DB error) -- release the claim so the shopper isn't left with a
    // burned, unusable session and no changed password.
    await db.update(phoneVerificationSessions).set({ consumedAt: null }).where(eq(phoneVerificationSessions.id, session.id));
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
  if (!session || session.purpose !== "register" || session.userId) throw new Error("Баталгаажуулалт олдсонгүй.");
  if (session.consumedAt) throw new Error("Энэ баталгаажуулалт аль хэдийн ашиглагдсан байна.");
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
    await db.update(users).set({ phone: session.phone, updatedAt: new Date() }).where(eq(users.id, session.userId));
  } catch (error) {
    await db.update(phoneVerificationSessions).set({ consumedAt: null }).where(eq(phoneVerificationSessions.id, session.id));
    throw error;
  }
  return { userId: session.userId };
}

// PREMIUM-FEATURES.md TIER 2: average rating + review count, shared by the
// catalog list, a single product page, and the admin product list. A LEFT
// JOIN + GROUP BY (rather than a per-row correlated subquery) so this stays
// cheap across the full ~900-product catalog. Only isApproved reviews count
// toward the public-facing average — a hidden review shouldn't move the
// star rating shoppers see.
// mysql2 returns AVG() results as a decimal *string* (e.g. "4.0000"), not a
// number, to avoid float precision loss — .mapWith coerces it back to a
// real number (or keeps null when there are no reviews yet) so callers on
// both the server and client can do plain arithmetic/toFixed on it.
const avgRatingExpr = sql<number | null>`AVG(CASE WHEN ${productReviews.isApproved} = 1 THEN ${productReviews.rating} END)`.mapWith(value => value === null ? null : Number(value));
const reviewCountExpr = sql<number>`COUNT(CASE WHEN ${productReviews.isApproved} = 1 THEN 1 END)`;

// Shared column shape for the two catalog readers below (getPublishedCatalog
// and getPublishedProductsByIds) so the row shape can't drift between them.
const catalogRowColumns = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  brand: products.brand,
  shortDescription: products.shortDescription,
  priceMnt: products.priceMnt,
  compareAtPriceMnt: products.compareAtPriceMnt,
  imageUrl: products.imageUrl,
  stockQuantity: products.stockQuantity,
  categoryName: productCategories.name,
  categorySlug: productCategories.slug,
  skinType: products.skinType,
  skinConcerns: products.skinConcerns,
  interiorStyle: products.interiorStyle,
  avgRating: avgRatingExpr,
  reviewCount: reviewCountExpr,
};

export async function getPublishedCatalog() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select(catalogRowColumns)
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(eq(products.isPublished, true))
    .groupBy(products.id, productCategories.id)
    .orderBy(asc(productCategories.sortOrder), desc(products.createdAt));
}

// 2026-09-04 cohesion audit: the "800+" product-count claim on the homepage
// was hardcoded independently in 3 separate places (hero badge, category
// section description, "why choose us" card) with only a code comment (not
// a real mechanism) keeping them in sync -- one of them wasn't even
// admin-editable, so all 3 could silently drift from the real catalog size
// and from each other. A plain COUNT(*) rather than getPublishedCatalog()
// (which selects every column, joins reviews, and groups by product for the
// full catalog) since the homepage only ever needs the number.
export async function getPublishedProductCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.isPublished, true));
  return count;
}

export type CatalogPageParams = {
  search?: string;
  category?: string;
  brand?: string;
  skinType?: SkinType | "all";
  // NEWVISION.md §14 (Phase 2): Isetan-style deep faceted filter, either
  // bound optional -- a shopper setting only a floor or only a ceiling
  // shouldn't have to also guess the other. See filterCatalogPriceRange.
  minPriceMnt?: number;
  maxPriceMnt?: number;
  inStockOnly?: boolean;
  sort?: CatalogSortOption;
  page?: number;
  pageSize?: number;
};

// Short in-memory memoization of getPublishedCatalog(), used ONLY by
// getPublishedCatalogPage below -- NOT applied to getPublishedCatalog()
// itself, so every other caller (admin writes, commerce.database.
// integration.test.ts's immediate-read-after-write check) keeps seeing
// fully fresh data with zero behavior change.
//
// Why this exists: getPublishedCatalogPage now runs once per /shop filter/
// page/sort change (previously the browser fetched the full catalog once
// per VISIT and did all filtering/pagination client-side) -- each of those
// still needs the full catalog to filter/sort/paginate against server-side.
// Aiven has documented, real network-latency spikes (CLAUDE.md; vitest's
// integration-test timeout was raised from 5s to 30s specifically because
// of this), so re-querying it on every click would trade "one large
// payload over a slow client connection" for "one Aiven round trip per
// click" -- a real regression on this specific database, not a
// hypothetical one. This is deliberately NOT a general caching layer or
// Redis (this project isn't building one at current near-zero traffic --
// see ROADMAP.md); it's a short-lived memoization of one already-cheap
// query, local to this one function. A product/category edit becomes
// visible on /shop within CATALOG_PAGE_CACHE_TTL_MS instead of instantly --
// an acceptable trade at this traffic level.
const CATALOG_PAGE_CACHE_TTL_MS = 10_000;
let catalogPageCache: { expiresAt: number; rows: Awaited<ReturnType<typeof getPublishedCatalog>> } | null = null;

async function getPublishedCatalogCached() {
  if (catalogPageCache && catalogPageCache.expiresAt > Date.now()) return catalogPageCache.rows;
  const rows = await getPublishedCatalog();
  catalogPageCache = { expiresAt: Date.now() + CATALOG_PAGE_CACHE_TTL_MS, rows };
  return rows;
}

/**
 * Frontend performance audit (2026-09-02): /shop used to call the no-arg
 * getPublishedCatalog() unconditionally and do ALL filtering, sorting, and
 * pagination in the BROWSER over the full ~937-row payload -- shipping
 * every product's full metadata (including tag columns nothing on /shop
 * renders) across the actual public network hop on every visit, regardless
 * of what page/filter the shopper wanted. Mongolia's median mobile
 * connection (17 Mbps, 92ms latency -- well below the 33.9 Mbps global
 * median) makes that payload weight a real cost, not a cosmetic one.
 *
 * Fix: keep the full-catalog fetch (cheap, and short-TTL-cached -- see
 * getPublishedCatalogCached above), but filter/sort/paginate HERE, reusing
 * the exact same shared/catalog-filter.ts functions Shop.tsx used to run
 * client-side -- single source of truth, zero behavior drift -- and ship
 * only the requested page's rows across the slow hop. Facets (categories/
 * skinTypes) are computed from the FULL catalog, unfiltered by the
 * shopper's other active selections, matching Shop.tsx's original
 * behavior: the filter pills always list every possible value, not just
 * ones matching whatever else is currently selected.
 */
export async function getPublishedCatalogPage(params: CatalogPageParams) {
  const fullCatalog = await getPublishedCatalogCached();

  const categories = getCatalogCategories(fullCatalog);
  const skinTypes = getCatalogSkinTypes(fullCatalog);

  const matching = sortCatalogProducts(
    filterCatalogStock(
      filterCatalogPriceRange(
        filterCatalogSkinType(
          filterCatalogBrand(
            filterCatalogProducts(fullCatalog, params.search ?? "", params.category ?? "all"),
            params.brand ?? "all",
          ),
          params.skinType ?? "all",
        ),
        params.minPriceMnt,
        params.maxPriceMnt,
      ),
      params.inStockOnly ?? false,
    ),
    params.sort ?? "featured",
  );

  const pageSize = params.pageSize ?? 24;
  const page = Math.max(1, params.page ?? 1);
  const items = matching.slice((page - 1) * pageSize, page * pageSize);

  return { items, totalCount: matching.length, totalPublishedCount: fullCatalog.length, categories, skinTypes };
}

/**
 * Resolves specific product ids against the published catalog -- backs
 * Shop.tsx's "Таны сүүлд үзсэн" (recently viewed) rail, which needs to look
 * up a handful of arbitrary product ids (read from localStorage) regardless
 * of the shopper's current category/skinType/page selection, now that
 * catalog.list no longer ships the full catalog for the client to resolve
 * IDs against locally. Bounded by the caller's own cap (see
 * shared/recently-viewed.ts's rememberRecentlyViewed, limit 6), so this can
 * never become an unbounded fetch itself.
 */
export async function getPublishedProductsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || !ids.length) return [];

  return db
    .select(catalogRowColumns)
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.isPublished, true), inArray(products.id, ids)))
    .groupBy(products.id, productCategories.id);
}

/**
 * Homepage "Их зарагддаг бараа" rail (inspired by matsukiyococokara-online.com's
 * 売れ筋ランキング section, 2026-08-26) — real order history, not a manually
 * curated list. Only counts order_items belonging to a paid order (same
 * "actually happened" bar as loyalty spend in getUserLoyaltyStatus) so a
 * cancelled or still-unpaid cash-on-delivery order can't inflate a product's
 * rank.
 *
 * Two plain queries instead of one big join: order_items already fans out
 * 1:many against product_reviews once both are joined onto products in a
 * single query (the same trap getPublishedCatalog avoids), which would
 * double- or triple-count sold quantity. Summing sold quantity in its own
 * query first, then fetching the winning products' catalog rows separately,
 * sidesteps that without a SQL subquery.
 */
export async function getBestsellingProducts(limit = 8) {
  const db = await getDb();
  if (!db) return [];

  const soldQtyExpr = sql<number>`SUM(${orderItems.quantity})`;
  const soldRows = await db
    .select({ productId: orderItems.productId, soldQuantity: soldQtyExpr })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.paymentStatus, "paid"))
    .groupBy(orderItems.productId)
    .orderBy(desc(soldQtyExpr))
    .limit(limit * 3); // headroom: some winners may since have gone unpublished

  const productIds = soldRows.map(row => row.productId).filter((id): id is number => id != null);
  if (!productIds.length) return [];
  const soldQuantityByProduct = new Map(soldRows.map(row => [row.productId, Number(row.soldQuantity)]));

  const catalogRows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(inArray(products.id, productIds), eq(products.isPublished, true)))
    .groupBy(products.id);

  return catalogRows
    .map(row => ({ ...row, soldQuantity: soldQuantityByProduct.get(row.id) ?? 0 }))
    .sort((a, b) => b.soldQuantity - a.soldQuantity)
    .slice(0, limit);
}

/**
 * NEWVISION.md §7/§11: one category's shelf for the new homepage
 * CarouselShelf rail. "нөөцтэй эхэлж, борлуулалтаар эрэмбэлнэ" (in-stock
 * first, then by sales) -- but real paid-order volume is near zero today
 * (same reality getRecommendedProducts' cold-start tier already handles),
 * so this ranks by real sold quantity where it exists, then fills any
 * remaining slots with other published, in-stock products in the category
 * (newest first) rather than returning a half-empty shelf. Never returns an
 * out-of-stock product ahead of an in-stock one.
 */
export async function getCategoryShelfProducts(categoryId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];

  const soldQtyExpr = sql<number>`SUM(${orderItems.quantity})`;
  const soldRows = await db
    .select({ productId: orderItems.productId, soldQuantity: soldQtyExpr })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orders.paymentStatus, "paid"), eq(products.categoryId, categoryId), eq(products.isPublished, true)))
    .groupBy(orderItems.productId)
    .orderBy(desc(soldQtyExpr))
    .limit(limit);
  const soldQuantityByProduct = new Map(soldRows.map(row => [row.productId, Number(row.soldQuantity)]));

  const catalogColumns = {
    id: products.id, name: products.name, slug: products.slug, brand: products.brand,
    priceMnt: products.priceMnt, compareAtPriceMnt: products.compareAtPriceMnt, imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity, avgRating: avgRatingExpr, reviewCount: reviewCountExpr,
  };

  const soldProductIds = soldRows.map(row => row.productId).filter((id): id is number => id != null);
  const soldCatalogRows = soldProductIds.length
    ? await db.select(catalogColumns).from(products).leftJoin(productReviews, eq(productReviews.productId, products.id))
        .where(inArray(products.id, soldProductIds)).groupBy(products.id)
    : [];

  const picked = soldCatalogRows
    .map(row => ({ ...row, soldQuantity: soldQuantityByProduct.get(row.id) ?? 0 }))
    .sort((a, b) => b.soldQuantity - a.soldQuantity);

  if (picked.length < limit) {
    const excludeIds = picked.map(row => row.id);
    const fillerRows = await db.select({ ...catalogColumns, createdAt: products.createdAt }).from(products)
      .leftJoin(productReviews, eq(productReviews.productId, products.id))
      .where(and(
        eq(products.categoryId, categoryId),
        eq(products.isPublished, true),
        excludeIds.length ? sql`${products.id} NOT IN (${sql.join(excludeIds, sql`, `)})` : sql`1=1`,
      ))
      .groupBy(products.id)
      .orderBy(desc(sql`${products.stockQuantity} > 0`), desc(products.createdAt))
      .limit(limit - picked.length);
    picked.push(...fillerRows.map(({ createdAt: _createdAt, ...row }) => ({ ...row, soldQuantity: 0 })));
  }

  return picked.slice(0, limit);
}

/** All 6 real, active categories with their shelf products -- backs the
 *  homepage's category CarouselShelf rails (NEWVISION.md §7). */
export async function getHomeCategoryShelves(limitPerShelf = 12) {
  const db = await getDb();
  if (!db) return [];
  const categories = await db.select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
    .from(productCategories).where(eq(productCategories.isActive, true)).orderBy(asc(productCategories.sortOrder));
  const shelves = await Promise.all(categories.map(async category => ({
    category,
    products: await getCategoryShelfProducts(category.id, limitPerShelf),
  })));
  return shelves.filter(shelf => shelf.products.length > 0);
}

/**
 * ROADMAP.md TIER 2: server-side catalog search, replacing a client-side
 * substring filter over the entire ~937-row published catalog. Uses the
 * `products_search_idx` FULLTEXT index (drizzle/0027_catalog_fulltext_search.sql)
 * over (name, brand, shortDescription) in BOOLEAN MODE with a trailing `*`
 * wildcard on every term, so "крем нью" behaves like a prefix search per
 * word ("find rows where some indexed word starts with крем AND some
 * indexed word starts with нью") — the closest FULLTEXT equivalent to the
 * old client-side "substring anywhere" behavior, though not identical:
 * MySQL's default InnoDB FULLTEXT parser only indexes whole words of at
 * least 3 characters (innodb_ft_min_token_size), so a query like "ню" alone
 * won't match a 4-letter word by prefix the way the old JS .includes() did
 * for genuinely tiny fragments — real product/brand names are essentially
 * always long enough for this not to matter in practice.
 */
export async function searchPublishedCatalog(query: string) {
  const db = await getDb();
  if (!db) return [];

  const terms = query.trim().split(/\s+/).filter(Boolean)
    // Strip MySQL boolean-mode operator characters so user input can't
    // change the query's structure (e.g. a leading "-" would exclude
    // instead of require a term) — this is a search relevance concern, not
    // a SQL-injection one (drizzle still parameterizes the whole string).
    .map(term => term.replace(/[+\-<>()~*"@]/g, ""))
    .filter(Boolean)
    .map(term => `+${term}*`);
  if (!terms.length) return [];
  const booleanQuery = terms.join(" ");
  const matchExpr = sql`MATCH(${products.name}, ${products.brand}, ${products.shortDescription}) AGAINST(${booleanQuery} IN BOOLEAN MODE)`;

  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      categoryName: productCategories.name,
      categorySlug: productCategories.slug,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.isPublished, true), matchExpr))
    .groupBy(products.id, productCategories.id)
    .orderBy(desc(matchExpr))
    .limit(200);
}

// Preference Profile v2 (2026-09-01): "recommended for you" v2. A real read
// of the live catalog found only 4/937 products carry any personalization
// tag, so a pure tag-intersection recommender (the v1 version this
// replaced) would render near-empty for almost everyone. This version:
// (1) scores preference-tag matches via shared/catalog-filter.ts's
//     scorePreferenceMatch (pure, unit-tested there) — the permanent
//     backbone, matching industry practice for a catalog this size;
// (2) adds free behavioral signals that need zero manual tagging — category
//     affinity from the shopper's own paid order history, price-band
//     affinity, wishlist-adjacency;
// (3) applies a diversity cap so one generically-named brand can't fill the
//     whole list;
// (4) backfills with bestsellers whenever the scored result is thin —
//     including the true cold-start case (guest, or a shopper with no
//     preferences/history yet) — so the section never renders empty.
// Public-facing (routers.ts's catalog.recommended is now a publicProcedure):
// userId is null for a guest, who still gets a bestseller-backed list.
export async function getRecommendedProducts(userId: number | null, limit = 8) {
  const db = await getDb();
  if (!db) return [];

  const bestsellers = () => getBestsellingProducts(limit);

  let preferences: PreferenceProfile = {};
  let categoryAffinity = new Map<number, number>();
  let avgHistoricalUnitPriceMnt: number | null = null;
  let wishlistCategoryIds = new Set<number>();

  if (userId != null) {
    const userRows = await db.select({
      skinType: users.skinType,
      skinConcerns: users.skinConcerns,
      hairType: users.hairType,
      hairConcerns: users.hairConcerns,
      fragrancePreference: users.fragrancePreference,
      wellnessInterests: users.wellnessInterests,
      interiorStyle: users.interiorStyle,
      hasYoungChildren: users.hasYoungChildren,
    }).from(users).where(eq(users.id, userId)).limit(1);
    preferences = userRows[0] ?? {};

    const paidOrderItemRows = await db.select({ categoryId: products.categoryId, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orders.userId, userId), eq(orders.paymentStatus, "paid")));
    categoryAffinity = computeCategoryAffinity(paidOrderItemRows.map(row => ({ categoryId: row.categoryId, quantity: row.quantity })));
    if (paidOrderItemRows.length) {
      avgHistoricalUnitPriceMnt = paidOrderItemRows.reduce((sum, row) => sum + row.unitPriceMnt, 0) / paidOrderItemRows.length;
    }

    const wishlistRows = await db.select({ categoryId: products.categoryId })
      .from(wishlistItems)
      .innerJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(wishlistItems.userId, userId));
    wishlistCategoryIds = new Set(wishlistRows.map(row => row.categoryId).filter((id): id is number => id != null));
  }

  const hasAnyPreference = Boolean(preferences.skinType || preferences.skinConcerns || preferences.hairType || preferences.hairConcerns || preferences.fragrancePreference || preferences.wellnessInterests || preferences.interiorStyle || preferences.hasYoungChildren);
  const hasAnyHistory = categoryAffinity.size > 0 || wishlistCategoryIds.size > 0;
  if (!hasAnyPreference && !hasAnyHistory) {
    // Cold start: a guest, or a shopper who has stated nothing and bought
    // nothing. Bestsellers are the right answer WHEN THERE ARE ANY -- but
    // this catalog currently has ~0 paid orders, so bestsellers() came back
    // empty and RecommendedForYou (which renders null on an empty list)
    // made the whole rail vanish for every guest on the homepage. Falling
    // through instead reaches the same final "any in-stock published
    // product" tier the scored path below already uses, so the rail always
    // has content -- which is what this component's contract already
    // claimed. With no preferences every score is 0, so the scoring work
    // below is skipped naturally and only that last tier fills the list.
    const top = await bestsellers();
    if (top.length) return top;
  }

  const candidates = await db.select({
    id: products.id,
    categoryId: products.categoryId,
    name: products.name,
    slug: products.slug,
    brand: products.brand,
    shortDescription: products.shortDescription,
    priceMnt: products.priceMnt,
    compareAtPriceMnt: products.compareAtPriceMnt,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    categoryName: productCategories.name,
    categorySlug: productCategories.slug,
    skinType: products.skinType,
    skinConcerns: products.skinConcerns,
    hairType: products.hairType,
    hairConcerns: products.hairConcerns,
    fragrancePreference: products.fragrancePreference,
    wellnessInterests: products.wellnessInterests,
    interiorStyle: products.interiorStyle,
  }).from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), gte(products.stockQuantity, 1)));

  const scored = candidates
    .map(product => {
      let score = scorePreferenceMatch(product, preferences);
      const affinity = categoryAffinity.get(product.categoryId);
      if (affinity) score += affinity * 2;
      score += scorePriceBandAffinity(product.priceMnt, avgHistoricalUnitPriceMnt);
      if (wishlistCategoryIds.has(product.categoryId)) score += 0.5;
      return { product, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // maxPerCategory tightened 4->3 after a real QA run: with tag coverage
  // still thin catalog-wide, a single coarse signal (e.g. hasYoungChildren)
  // could otherwise fill most of the list from one category (see the
  // hasYoungChildren weight comment in scorePreferenceMatch).
  const diversified = applyDiversityCap(scored, { maxPerBrand: 3, maxPerCategory: 3 }).slice(0, limit);
  if (diversified.length >= Math.min(4, limit)) return diversified.map(entry => entry.product);

  // Thin result — backfill remaining slots with bestsellers rather than
  // showing a near-empty rail.
  const alreadyIncluded = new Set(diversified.map(entry => entry.product.id));
  const fillers = (await bestsellers()).filter(product => !alreadyIncluded.has(product.id));
  fillers.forEach(product => alreadyIncluded.add(product.id));
  const combined = [...diversified.map(entry => entry.product), ...fillers];
  if (combined.length >= limit) return combined.slice(0, limit);

  // Real edge case found via post-apply QA (2026-09-01): a shopper whose
  // ONLY stated preference is a specific enum value most real products
  // aren't tagged with (e.g. hairType exactly "dry" -- most untagged hair
  // products default to "normal", see scripts/auto-tag-products.ts's tier
  // 2) can score 0 candidates, and this catalog currently has 0 paid
  // orders so bestsellers() is ALSO empty -- both fallback tiers thin at
  // once. Rather than a genuinely empty rail, fill remaining slots with
  // any other in-stock published candidates (no scoring claim attached).
  const anyFillers = candidates.filter(product => !alreadyIncluded.has(product.id)).slice(0, limit - combined.length);
  return [...combined, ...anyFillers].slice(0, limit);
}

// Preference Profile v2 (2026-09-01): ProductDetail's related-products rail
// -- deliberately a separate, smaller feature from getRecommendedProducts
// above (no concept of "the current user", works for an anonymous
// visitor). Reuses the same pure scorePreferenceMatch by treating the
// VIEWED product's own tags as if they were a "preference profile" to
// match other products against -- same scoring math, no separate logic to
// maintain. Public (no auth needed).
export async function getRelatedProducts(productId: number, limit = 6) {
  const db = await getDb();
  if (!db) return [];

  const viewedRows = await db.select({
    categoryId: products.categoryId,
    skinType: products.skinType,
    skinConcerns: products.skinConcerns,
    hairType: products.hairType,
    hairConcerns: products.hairConcerns,
    fragrancePreference: products.fragrancePreference,
    wellnessInterests: products.wellnessInterests,
    interiorStyle: products.interiorStyle,
  }).from(products).where(eq(products.id, productId)).limit(1);
  const viewed = viewedRows[0];
  if (!viewed) return [];
  const viewedAsPreference: PreferenceProfile = viewed;

  const candidates = await db.select({
    id: products.id,
    categoryId: products.categoryId,
    name: products.name,
    slug: products.slug,
    brand: products.brand,
    priceMnt: products.priceMnt,
    compareAtPriceMnt: products.compareAtPriceMnt,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    categoryName: productCategories.name,
    categorySlug: productCategories.slug,
    skinType: products.skinType,
    skinConcerns: products.skinConcerns,
    hairType: products.hairType,
    hairConcerns: products.hairConcerns,
    fragrancePreference: products.fragrancePreference,
    wellnessInterests: products.wellnessInterests,
    interiorStyle: products.interiorStyle,
  }).from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), gte(products.stockQuantity, 1)));

  // Same paid-order sold-quantity signal getBestsellingProducts uses, as a
  // tiebreaker only (ranked "by overlap then bestseller count" per plan).
  const soldQtyExpr = sql<number>`SUM(${orderItems.quantity})`;
  const soldRows = await db.select({ productId: orderItems.productId, soldQuantity: soldQtyExpr })
    .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.paymentStatus, "paid")).groupBy(orderItems.productId);
  const soldByProduct = new Map(soldRows.map(row => [row.productId, Number(row.soldQuantity)]));

  const scored = candidates
    .filter(candidate => candidate.id !== productId)
    .map(candidate => {
      let score = scorePreferenceMatch(candidate, viewedAsPreference);
      if (candidate.categoryId === viewed.categoryId) score += 1;
      return { product: candidate, score, sold: soldByProduct.get(candidate.id) ?? 0 };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.sold - a.sold || tiebreakHash(productId, a.product.id) - tiebreakHash(productId, b.product.id));

  if (scored.length >= Math.min(3, limit)) return scored.slice(0, limit).map(entry => entry.product);

  // Thin match (very likely today, given real tagging coverage) -- backfill
  // with other same-category products rather than showing a near-empty rail.
  const alreadyIncluded = new Set(scored.map(entry => entry.product.id));
  const sameCategoryFillers = candidates
    .filter(candidate => candidate.id !== productId && candidate.categoryId === viewed.categoryId && !alreadyIncluded.has(candidate.id))
    .sort((a, b) => tiebreakHash(productId, a.id) - tiebreakHash(productId, b.id))
    .slice(0, limit - scored.length);
  return [...scored.map(entry => entry.product), ...sameCategoryFillers].slice(0, limit);
}

// Deterministic, per-viewed-product tiebreak for candidates that score
// identically -- extremely common today: most products still carry the same
// "normal"/null placeholder tags (see PRODUCT-IMPORT.md), so the category-match
// "+1" alone ties nearly an entire category together. Without this, both
// `.sort()` calls above are stable, so ties always fell back to raw,
// viewed-product-independent DB row order -- meaning almost every product in a
// category showed the exact same handful of "related" products (real bug,
// Tom, 2026-09-06: "most of them present these products"). This hash varies
// by (viewedProductId, candidateId), so ties resolve differently per product
// page, while staying 100% stable across repeat visits to the SAME page (no
// randomness, no flicker between renders, safely cacheable).
function tiebreakHash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 40503);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export async function getProductBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      description: products.description,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      sku: products.sku,
      imageUrl: products.imageUrl,
      galleryJson: products.galleryJson,
      stockQuantity: products.stockQuantity,
      categoryName: productCategories.name,
      categorySlug: productCategories.slug,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.slug, slug), eq(products.isPublished, true)))
    .groupBy(products.id, productCategories.id)
    .limit(1);

  return result[0] ?? null;
}

/**
 * Identifies who a cart (or an in-progress checkout) belongs to: either a
 * logged-in account, or an anonymous shopper via the guest-cart cookie (see
 * shared/const.ts GUEST_CART_COOKIE_NAME). Exactly one of the two is set —
 * mirrors the nullable `carts.userId` / `carts.guestToken` columns.
 */
export type CartOwner = { userId: number; guestToken?: undefined } | { userId?: undefined; guestToken: string };

function cartOwnerCondition(owner: CartOwner) {
  return owner.userId !== undefined ? eq(carts.userId, owner.userId) : eq(carts.guestToken, owner.guestToken);
}

/**
 * PHASE 2 of product variants: every cart line is keyed by variantId and
 * joined through productVariants to reach the parent product. `productId`/
 * `name`/`slug` below come from that join (there's no productId column on
 * cart_items any more — see the schema comment on cartItems). `sku` and
 * `attributesJson` are the variant's own, real ones (this is also what fixed
 * the old order_items.sku bug -- see createOrderFromActiveCart). `imageUrl`
 * falls back to the parent product's photo when a variant has none of its
 * own (most variants won't bother with a separate photo).
 */
export async function getActiveCartForOwner(owner: CartOwner) {
  const db = await getDb();
  if (!db) return null;

  const cart = await db
    .select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt })
    .from(carts)
    .where(and(cartOwnerCondition(owner), eq(carts.status, "active")))
    .orderBy(desc(carts.updatedAt))
    .limit(1);

  if (!cart[0]) return null;

  const items = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      productId: productVariants.productId,
      quantity: cartItems.quantity,
      name: products.name,
      slug: products.slug,
      sku: productVariants.sku,
      priceMnt: productVariants.priceMnt,
      compareAtPriceMnt: productVariants.compareAtPriceMnt,
      imageUrl: sql<string | null>`coalesce(${productVariants.imageUrl}, ${products.imageUrl})`,
      stockQuantity: productVariants.stockQuantity,
      attributesJson: productVariants.attributesJson,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cart[0].id));

  return { ...cart[0], items };
}

async function getOrCreateActiveCart(owner: CartOwner) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const active = await getActiveCartForOwner(owner);
  if (active) return active;
  const inserted = await db.insert(carts).values({ userId: owner.userId ?? null, guestToken: owner.guestToken ?? null, status: "active" });
  const created = await db.select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt }).from(carts).where(eq(carts.id, Number(inserted[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Unable to create an active cart.");
  return { ...created[0], items: [] };
}

/**
 * PHASE 2 of product variants: exactly one of productId/variantId is
 * expected (enforced by the router's zod schema). productId resolves to
 * that product's current default variant — this is what keeps every
 * existing call site (Shop quick-add, routine bulk-add, Profile reorder,
 * quick-view without a picker) working unchanged with zero client
 * changes, while a real variant picker (ProductDetail/QuickView, only
 * rendered when a product actually has more than one variant) passes
 * variantId directly to buy a specific option.
 */
export async function addCartItem(input: { owner: CartOwner; quantity: number; productId?: number; variantId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const variantSelect = { id: productVariants.id, stockQuantity: productVariants.stockQuantity, isPublished: products.isPublished };
  const variantRow = input.variantId !== undefined
    ? await db.select(variantSelect).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(eq(productVariants.id, input.variantId)).limit(1)
    : await db.select(variantSelect).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(and(eq(productVariants.productId, input.productId!), eq(productVariants.isDefault, true))).limit(1);
  if (!variantRow[0]?.isPublished) throw new Error("This product is not currently available for ordering.");
  const variantId = variantRow[0].id;

  const cart = await getOrCreateActiveCart(input.owner);

  // Read-modify-write on the existing quantity used to happen outside any
  // lock: two concurrent "add to cart" calls for the same variant (a double
  // click, two open tabs, guest-cart merge racing a manual add) could both
  // read the same starting quantity and clobber each other's increment. The
  // cart-row lock below serializes every addItem for this cart so that can't
  // happen, while still throwing the same "not enough stock" error as before.
  await db.transaction(async tx => {
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cart.id)).for("update");
    const existing = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId))).limit(1);
    const quantity = (existing[0]?.quantity ?? 0) + input.quantity;
    if (quantity > variantRow[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");

    if (existing[0]) {
      await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing[0].id));
    } else {
      await tx.insert(cartItems).values({ cartId: cart.id, variantId, quantity });
    }
  });
  return getActiveCartForOwner(input.owner);
}

export async function updateCartItemQuantity(input: { owner: CartOwner; itemId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = await db
    .select({ itemId: cartItems.id, cartId: carts.id, variantId: productVariants.id, stockQuantity: productVariants.stockQuantity })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(and(eq(cartItems.id, input.itemId), cartOwnerCondition(input.owner), eq(carts.status, "active")))
    .limit(1);
  if (!row[0]) throw new Error("Cart item not found.");
  if (input.quantity === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, row[0].itemId));
  } else {
    if (input.quantity > row[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");
    await db.update(cartItems).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(cartItems.id, row[0].itemId));
  }
  return getActiveCartForOwner(input.owner);
}

/**
 * Folds a guest cart into the now-logged-in user's cart (called right after
 * auth.login / auth.register when a guest-cart cookie is present). Best
 * effort: a line that no longer fits in stock is silently dropped rather
 * than failing the login. The guest cart itself is marked "converted" so its
 * (now stale) cookie can't be reused.
 */
export async function mergeGuestCartIntoUserCart(guestToken: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  const guestCart = await getActiveCartForOwner({ guestToken });
  if (!guestCart || guestCart.items.length === 0) return;

  for (const item of guestCart.items) {
    try {
      await addCartItem({ owner: { userId }, variantId: item.variantId, quantity: item.quantity });
    } catch {
      // Out of stock, or the product was unpublished since it was added — skip this line.
    }
  }
  await db.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, guestCart.id));
}

export async function createOrderFromActiveCart(input: {
  owner: CartOwner;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryMethod: "ub_delivery" | "store_pickup";
  deliveryAddress?: string | null;
  district?: UbDistrict | null;
  pickupBranch?: string | null;
  paymentMethod: "qpay" | "bank_transfer" | "card" | "cash_on_delivery";
  couponCode?: string | null;
  trafficSource?: string | null;
  deviceType?: "mobile" | "tablet" | "desktop" | "unknown";
  visitorSessionId?: number | null;
  // "Controls everything" admin overhaul (2026-09-08, Phase I): how much of
  // the customer's own store credit balance they opted to apply, requested
  // by the client -- re-validated against their REAL balance below, never
  // trusted as-is (same "never trust a client-supplied amount" discipline
  // as couponCode above). Guests (no owner.userId) can never have a
  // balance, so this is silently ignored for them rather than erroring.
  applyStoreCreditMnt?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const cart = await getActiveCartForOwner(input.owner);
  if (!cart?.items.length) throw new Error("Your cart is empty.");
  const availabilityFailure = getInventoryReservationFailure(cart.items);
  if (availabilityFailure) throw new Error(availabilityFailure);
  // "Controls everything" admin overhaul (2026-09-08, Phase J/L): validated
  // against the real, live branches table here (the actual authority),
  // rather than a hardcoded zod enum in the router -- the exact class of
  // bug that used to make branch 04 unselectable (it existed in
  // locations-data.ts's array but not in the router's separate, stale
  // 3-branch enum). Same "never trust a client string, check it against
  // real DB state" discipline as couponCode above. Also resolves WHICH
  // branch's shelf this order actually draws from (Phase L: per-branch
  // stock, not one shared global pool) -- store_pickup draws from the
  // customer's chosen branch, ub_delivery from whichever branch is
  // isFulfillmentDefault right now. Captured as a real id (fulfillingBranchId,
  // set on the order below) rather than re-derived later, so a future
  // change to which branch is the default never misattributes an already-
  // placed order's stock effect.
  const activeBranchesForOrder = await getActiveBranches();
  let fulfillingBranchId: number | null = null;
  if (input.deliveryMethod === "store_pickup") {
    const matchedBranch = input.pickupBranch ? activeBranchesForOrder.find(branch => branch.name === input.pickupBranch) : undefined;
    if (!matchedBranch) throw new Error("Select a valid SUGI branch for store pickup.");
    fulfillingBranchId = matchedBranch.id;
  } else {
    const fulfillmentBranch = activeBranchesForOrder.find(branch => branch.isFulfillmentDefault);
    if (!fulfillmentBranch) throw new Error("No fulfilment branch is configured. Please contact support.");
    fulfillingBranchId = fulfillmentBranch.id;
  }

  const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  // "Controls everything" admin overhaul (2026-09-08, Phase B): both numbers
  // now come from store_settings (admin-editable), falling back to today's
  // hardcoded UB_DELIVERY_FEE_MNT/no-threshold behavior when unset -- this
  // is the one authoritative place the actual charge is computed (Checkout.tsx
  // only ever displays a preview of this same logic, never the source of
  // truth). Free-shipping threshold checks the pre-discount subtotal, the
  // conventional "order amount" a shopper compares against a free-shipping
  // banner -- not the post-discount payable total.
  const [deliveryFeeUbMnt, freeShippingThresholdMnt] = await Promise.all([
    getStoreSettingNumber("delivery-fee-ub-mnt"),
    getStoreSettingNumber("free-shipping-threshold-mnt"),
  ]);
  const deliveryFeeMnt = input.deliveryMethod === "ub_delivery"
    ? (freeShippingThresholdMnt > 0 && subtotalMnt >= freeShippingThresholdMnt ? 0 : deliveryFeeUbMnt)
    : 0;
  // PREMIUM-FEATURES.md TIER 4: computed from the cart's real contents right
  // now, not a client-supplied amount — see getApplicableRoutineDiscount.
  const routineDiscount = await getApplicableRoutineDiscount(cart.items);
  const discountMnt = routineDiscount?.discountMnt ?? 0;
  // Coupon (manually entered) applies to the subtotal *after* the routine
  // discount. Re-validated here (never trusts a client-supplied amount) —
  // if the code has gone stale between the checkout-preview call and now
  // (expired, used up, deactivated), the whole order fails with a clear
  // error rather than silently dropping the discount the shopper was shown.
  const couponResult = input.couponCode ? await validateDiscountCode(input.couponCode, subtotalMnt - discountMnt) : null;
  const couponDiscountMnt = couponResult?.discountMnt ?? 0;
  // PREMIUM-FEATURES.md TIER 5: loyalty applies to the subtotal after both
  // the routine discount and the coupon — sequential stacking throughout,
  // never multiple percentages computed off the same base.
  const loyaltyDiscount = await getApplicableLoyaltyDiscount(input.owner.userId, subtotalMnt - discountMnt - couponDiscountMnt);
  const loyaltyDiscountMnt = loyaltyDiscount?.discountMnt ?? 0;
  // Prefer whatever the checkout form actually sent (a shopper picking
  // their saved address's district, or the dropdown next to a fresh
  // address); fall back to a best-effort guess from the free-text address
  // itself, so a district is captured even when the client doesn't send
  // one — see shared/districts.ts and scripts/backfill-order-districts.ts.
  const deliveryDistrict = input.deliveryMethod === "ub_delivery" ? (input.district ?? guessDistrictFromAddress(input.deliveryAddress)) : null;
  const orderNumber = `SA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const payableBeforeCreditMnt = subtotalMnt + deliveryFeeMnt - discountMnt - couponDiscountMnt - loyaltyDiscountMnt;
  // Phase I: credit is cash-equivalent, so it's applied LAST against the
  // already-discounted total, never stacked into the routine/coupon/loyalty
  // percentage math above. Capped at both the real balance (read fresh here,
  // not trusted from the client) and the payable total (can never make
  // totalMnt negative). The atomic guarded UPDATE inside the transaction
  // below is the actual race-proof enforcement, matching every other
  // decrement in this function -- this is only an optimistic pre-check.
  let storeCreditAppliedMnt = 0;
  if (input.owner.userId && input.applyStoreCreditMnt && input.applyStoreCreditMnt > 0) {
    const [creditRow] = await db.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, input.owner.userId)).limit(1);
    storeCreditAppliedMnt = Math.max(0, Math.min(input.applyStoreCreditMnt, creditRow?.storeCreditMnt ?? 0, payableBeforeCreditMnt));
  }
  let orderId = 0;
  await db.transaction(async tx => {
    for (const item of cart.items) {
      // "Controls everything" admin overhaul (2026-09-08, Phase L): decrements
      // the SPECIFIC fulfilling branch's shelf now, not one shared global
      // pool -- see decrementBranchStock's own doc-comment for the full
      // reasoning (race-proof guard, legacy fallback, isPublished check).
      await decrementBranchStock(tx, fulfillingBranchId, item.variantId, item.quantity, { requirePublished: true, itemLabel: item.name });
    }
    if (couponResult) {
      // Same WHERE-guard technique as the stock decrement above: atomic, so
      // two simultaneous orders can never both redeem the last remaining use
      // of a maxUses-limited code. Losing this race rolls back the whole
      // order (stock included) via the thrown error.
      const redeemed = await tx.update(discountCodes)
        .set({ usesCount: sql`${discountCodes.usesCount} + 1`, updatedAt: new Date() })
        .where(and(eq(discountCodes.id, couponResult.id), or(isNull(discountCodes.maxUses), lt(discountCodes.usesCount, discountCodes.maxUses))));
      if (Number(redeemed[0].affectedRows ?? 0) !== 1) {
        throw new Error("Энэ хямдралын код яг энэ мөчид дууссан байна. Дахин оролдоно уу.");
      }
    }
    const inserted = await tx.insert(orders).values({
      userId: input.owner.userId ?? null,
      orderNumber,
      paymentMethod: input.paymentMethod,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryDistrict,
      pickupBranch: input.pickupBranch ?? null,
      fulfillingBranchId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      // Both captured once, at order time, same as everything else above —
      // never backfilled for historical orders (see the schema comment on
      // orders.trafficSource/deviceType).
      trafficSource: input.trafficSource ?? null,
      deviceType: input.deviceType ?? "unknown",
      visitorSessionId: input.visitorSessionId ?? null,
      subtotalMnt,
      deliveryFeeMnt,
      discountMnt,
      appliedRoutineId: routineDiscount?.routineId ?? null,
      couponCode: couponResult?.code ?? null,
      couponDiscountMnt,
      loyaltyDiscountMnt,
      appliedLoyaltyTierName: loyaltyDiscount?.tierName ?? null,
      storeCreditAppliedMnt,
      totalMnt: payableBeforeCreditMnt - storeCreditAppliedMnt,
    });
    orderId = Number(inserted[0].insertId);
    await tx.insert(orderItems).values(cart.items.map(item => ({
      orderId,
      productId: item.productId,
      // PHASE 2 of product variants: fixes a pre-existing bug where this
      // used to write item.slug (the product's URL slug) here instead of a
      // real SKU/barcode, because the cart-items query never selected one.
      variantId: item.variantId,
      productName: item.name,
      sku: item.sku,
      unitPriceMnt: item.priceMnt,
      quantity: item.quantity,
    })));
    if (storeCreditAppliedMnt > 0) {
      // Same WHERE-guard + affectedRows race-proof idiom as the stock/coupon
      // decrements above -- if a concurrent spend already ate into this
      // balance since the optimistic pre-check, the whole order (stock
      // included) rolls back via the thrown error, same as losing the
      // coupon race above.
      const creditUpdate = await tx.update(users)
        .set({ storeCreditMnt: sql`${users.storeCreditMnt} - ${storeCreditAppliedMnt}`, updatedAt: new Date() })
        .where(and(eq(users.id, input.owner.userId!), gte(users.storeCreditMnt, storeCreditAppliedMnt)));
      if (Number(creditUpdate[0].affectedRows ?? 0) !== 1) {
        throw new Error("Дэлгүүрийн зээлийн үлдэгдэл өөрчлөгдсөн байна. Захиалгаа дахин баталгаажуулна уу.");
      }
      await tx.insert(storeCreditLedger).values({
        userId: input.owner.userId!, deltaMnt: -storeCreditAppliedMnt,
        reason: `Захиалга ${orderNumber}-д зарцуулсан`, actorUserId: null, orderId,
      });
    }
    await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, cart.id));
  });

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  // The cart's items are already in memory (loaded above, before the stock
  // decrement) — reuse them here instead of a redundant order_items query,
  // so the caller (checkout.createOrder) can build a confirmation email
  // without a second round trip.
  return { ...order[0], items: cart.items.map(item => ({ name: item.name, quantity: item.quantity, priceMnt: item.priceMnt, attributesJson: item.attributesJson })), routineName: routineDiscount?.routineName ?? null };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
 * in-person-sale tool -- creates a REAL, queryable order (paymentStatus
 * "paid" the instant it's recorded, no separate confirmation step; a
 * physical sale is already complete by the time a staff member enters it)
 * and decrements the exact branch's stock via the same shared
 * decrementBranchStock helper checkout uses, just with requirePublished:
 * false (a shelf item's online-publish flag is irrelevant to an in-store
 * sale -- a staff member scanning a real barcode off a real shelf is its
 * own proof the item exists and is for sale). Unlike the old
 * `users.loyaltyManualAdjustmentMnt` bridge (PREMIUM-FEATURES.md:65 -- a
 * single lump-sum number with no line items, no SKUs, no stock effect),
 * this creates real order/order_items rows with real SKUs and a real
 * stock effect, going forward superseding the need for that bridge for
 * NEW in-store purchases -- it stays untouched for existing/historical
 * data. No manual price override in v1 -- always the variant's real, current
 * priceMnt (never a client-supplied number), same "never trust a client
 * amount" discipline as checkout's own discounts/credit.
 */
export type InStoreSaleInput = {
  branchId: number;
  items: { variantId: number; quantity: number }[];
  userId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
};

export async function recordInStoreSale(input: InStoreSaleInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!input.items.length) throw new Error("Add at least one item to record a sale.");
  for (const item of input.items) {
    if (item.quantity < 1) throw new Error("Quantity must be at least 1 for every item.");
  }

  const branchRows = await db.select().from(branches).where(and(eq(branches.id, input.branchId), eq(branches.isActive, true))).limit(1);
  if (!branchRows[0]) throw new Error("Select a valid, active branch for this sale.");

  // Real, current price/name/sku -- never trusts a client-supplied amount.
  const variantIds = input.items.map(item => item.variantId);
  const variantRows = await db.select({
    id: productVariants.id, priceMnt: productVariants.priceMnt, sku: productVariants.sku,
    productId: productVariants.productId, productName: products.name,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  const variantsById = new Map(variantRows.map(row => [row.id, row]));
  for (const item of input.items) {
    if (!variantsById.has(item.variantId)) throw new Error("One of the selected products no longer exists.");
  }

  const subtotalMnt = input.items.reduce((sum, item) => sum + variantsById.get(item.variantId)!.priceMnt * item.quantity, 0);
  const orderNumber = `SA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  let orderId = 0;
  await db.transaction(async tx => {
    for (const item of input.items) {
      const variant = variantsById.get(item.variantId)!;
      await decrementBranchStock(tx, input.branchId, item.variantId, item.quantity, { requirePublished: false, itemLabel: variant.productName });
    }
    const inserted = await tx.insert(orders).values({
      userId: input.userId ?? null,
      orderNumber,
      status: "completed",
      paymentMethod: "in_store",
      paymentStatus: "paid",
      deliveryMethod: "store_pickup",
      salesChannel: "in_store",
      pickupBranch: branchRows[0].name,
      fulfillingBranchId: input.branchId,
      // A register sale often has no captured contact info at all -- these
      // placeholders keep the NOT NULL columns honest without inventing a
      // fake person; a real name/phone (or userId) is used whenever given.
      customerName: input.customerName?.trim() || "Дэлгүүрийн худалдан авагч",
      customerPhone: input.customerPhone?.trim() || "-",
      subtotalMnt,
      totalMnt: subtotalMnt,
    });
    orderId = Number(inserted[0].insertId);
    await tx.insert(orderItems).values(input.items.map(item => {
      const variant = variantsById.get(item.variantId)!;
      return {
        orderId, productId: variant.productId, variantId: item.variantId,
        productName: variant.productName, sku: variant.sku,
        unitPriceMnt: variant.priceMnt, quantity: item.quantity,
      };
    }));
  });

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order[0];
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
 * line-item composer's search -- reuses the same name/SKU LIKE-search
 * shape this codebase already uses elsewhere (admin.search's product
 * lookup), scoped to variants (not products) since a POS sale is rung up
 * by real SKU, and joined against the SPECIFIC branch being sold from so a
 * cashier can see real shelf stock there while adding items (0 for a
 * variant this branch has no branch_stock row for, same LEFT JOIN
 * discipline as getBranchStockForVariant).
 */
export async function searchVariantsForBranch(branchId: number, search: string) {
  const db = await getDb();
  if (!db) return [];
  const trimmed = search.trim();
  const term = `%${trimmed}%`;
  return db.select({
    variantId: productVariants.id,
    productId: productVariants.productId,
    productName: products.name,
    sku: productVariants.sku,
    priceMnt: productVariants.priceMnt,
    attributesJson: productVariants.attributesJson,
    stockAtBranch: sql<number>`COALESCE(${branchStock.stockQuantity}, 0)`,
  }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(branchStock, and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, productVariants.id)))
    .where(trimmed ? or(like(products.name, term), like(productVariants.sku, term)) : undefined)
    .orderBy(asc(products.name))
    .limit(30);
}

/**
 * PREMIUM-FEATURES.md TIER 4: does the given cart, as it stands right now,
 * contain every product in some published routine's steps? If several
 * qualify, the one worth the most to the shopper wins — there's no reason to
 * pick a smaller discount when a bigger one legitimately applies. Shared by
 * the checkout-preview query (cart.applicableRoutineDiscount) and the real
 * enforcement in createOrderFromActiveCart above, so the number a shopper
 * sees before confirming is guaranteed to be the number actually charged.
 */
export async function getApplicableRoutineDiscount(cartItems: { productId: number; priceMnt: number; quantity: number }[]) {
  const db = await getDb();
  if (!db || !cartItems.length) return null;

  const routineRows = await db.select({ id: routines.id, name: routines.name, discountPercent: routines.discountPercent })
    .from(routines)
    .where(and(eq(routines.isPublished, true), gte(routines.discountPercent, 1)));
  if (!routineRows.length) return null;

  const stepRows = await db.select({ routineId: routineSteps.routineId, productId: routineSteps.productId })
    .from(routineSteps)
    .where(inArray(routineSteps.routineId, routineRows.map(routine => routine.id)));

  const cartProductIds = new Set(cartItems.map(item => item.productId));
  let best: { routineId: number; routineName: string; discountPercent: number; discountMnt: number } | null = null;

  for (const routine of routineRows) {
    const stepProductIds = stepRows.filter(step => step.routineId === routine.id).map(step => step.productId);
    if (!stepProductIds.length || !stepProductIds.every(productId => cartProductIds.has(productId))) continue;
    const routineSubtotal = cartItems.filter(item => stepProductIds.includes(item.productId)).reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
    const discountMnt = Math.round(routineSubtotal * routine.discountPercent / 100);
    if (discountMnt > 0 && (!best || discountMnt > best.discountMnt)) {
      best = { routineId: routine.id, routineName: routine.name, discountPercent: routine.discountPercent, discountMnt };
    }
  }
  return best;
}

async function loadRoutineWithSteps(routine: typeof routines.$inferSelect) {
  const db = await getDb();
  if (!db) return null;
  const steps = await db.select({
    id: routineSteps.id,
    stepNumber: routineSteps.stepNumber,
    stepLabel: routineSteps.stepLabel,
    productId: products.id,
    name: products.name,
    slug: products.slug,
    priceMnt: products.priceMnt,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    isPublished: products.isPublished,
  }).from(routineSteps).innerJoin(products, eq(products.id, routineSteps.productId)).where(eq(routineSteps.routineId, routine.id)).orderBy(asc(routineSteps.stepNumber));
  return { ...routine, steps: steps.filter(step => step.isPublished) };
}

export async function getPublishedRoutineBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(routines).where(and(eq(routines.slug, slug), eq(routines.isPublished, true))).limit(1);
  if (!rows[0]) return null;
  return loadRoutineWithSteps(rows[0]);
}

/** ProductDetail's "Routine-оо дуусга" cross-sell block: the first published
 *  routine (if any) this product is a step of, with all of its steps. */
export async function getRoutineForProduct(productId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ routine: routines }).from(routineSteps)
    .innerJoin(routines, eq(routines.id, routineSteps.routineId))
    .where(and(eq(routineSteps.productId, productId), eq(routines.isPublished, true)))
    .limit(1);
  if (!rows[0]) return null;
  return loadRoutineWithSteps(rows[0].routine);
}

export async function getAdminRoutines() {
  const db = await getDb();
  if (!db) return [];
  const routineRows = await db.select().from(routines).orderBy(desc(routines.updatedAt));
  const stepCounts = await db.select({ routineId: routineSteps.routineId, count: sql<number>`count(*)` }).from(routineSteps).groupBy(routineSteps.routineId);
  return routineRows.map(routine => ({ ...routine, stepCount: Number(stepCounts.find(row => row.routineId === routine.id)?.count ?? 0) }));
}

export async function getAdminRoutineDetail(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(routines).where(eq(routines.id, id)).limit(1);
  if (!rows[0]) return null;
  const steps = await db.select({
    id: routineSteps.id,
    stepNumber: routineSteps.stepNumber,
    stepLabel: routineSteps.stepLabel,
    productId: products.id,
    name: products.name,
    priceMnt: products.priceMnt,
    imageUrl: products.imageUrl,
  }).from(routineSteps).innerJoin(products, eq(products.id, routineSteps.productId)).where(eq(routineSteps.routineId, id)).orderBy(asc(routineSteps.stepNumber));
  return { ...rows[0], steps };
}

export type RoutineWriteInput = { name: string; slug: string; description?: string | null; discountPercent: number; isPublished: boolean };

export async function routineSlugExists(slug: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: routines.id }).from(routines).where(eq(routines.slug, slug)).limit(1);
  return Boolean(rows[0] && rows[0].id !== excludeId);
}

export async function createAdminRoutine(input: RoutineWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(routines).values({ name: input.name, slug: input.slug, description: input.description ?? null, discountPercent: input.discountPercent, isPublished: input.isPublished });
  const created = await db.select().from(routines).where(eq(routines.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminRoutine(input: { id: number } & Partial<RoutineWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { id, ...changes } = input;
  const existing = await db.select({ id: routines.id }).from(routines).where(eq(routines.id, id)).limit(1);
  if (!existing[0]) throw new Error("Routine not found.");
  await db.update(routines).set({ ...changes, updatedAt: new Date() }).where(eq(routines.id, id));
  const updated = await db.select().from(routines).where(eq(routines.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminRoutine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(routines).where(eq(routines.id, id));
  return { id };
}

/** The one promotion (if any) currently shown to shoppers: active, and
 *  inside its scheduled window if it has one. When several qualify (admin
 *  mistake, or a deliberate handoff between two promos), the most recently
 *  updated one wins — deterministic and matches "whatever I touched last is
 *  what's live" admin intuition. */
export async function getActiveSitePromotion() {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  // updatedAt has only whole-second precision, so two edits within the same
  // second would tie -- id DESC breaks that tie deterministically (the
  // more-recently-created/edited row is reliably the higher id in practice).
  const rows = await db.select().from(sitePromotions).where(eq(sitePromotions.isActive, true)).orderBy(desc(sitePromotions.updatedAt), desc(sitePromotions.id));
  const live = rows.find(row => (!row.startsAt || row.startsAt <= now) && (!row.endsAt || row.endsAt >= now));
  return live ?? null;
}

export async function getAdminSitePromotions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sitePromotions).orderBy(desc(sitePromotions.updatedAt));
}

export type SitePromotionWriteInput = {
  isActive: boolean;
  displayMode: "popup" | "banner";
  headline: string;
  message?: string | null;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export async function createAdminSitePromotion(input: SitePromotionWriteInput, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(sitePromotions).values({ ...input, updatedByUserId });
  const created = await db.select().from(sitePromotions).where(eq(sitePromotions.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminSitePromotion(input: { id: number } & Partial<SitePromotionWriteInput>, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { id, ...changes } = input;
  const existing = await db.select({ id: sitePromotions.id }).from(sitePromotions).where(eq(sitePromotions.id, id)).limit(1);
  if (!existing[0]) throw new Error("Promotion not found.");
  await db.update(sitePromotions).set({ ...changes, updatedByUserId, updatedAt: new Date() }).where(eq(sitePromotions.id, id));
  const updated = await db.select().from(sitePromotions).where(eq(sitePromotions.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminSitePromotion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(sitePromotions).where(eq(sitePromotions.id, id));
  return { id };
}

/** Admin submits the whole ordered step list each time — simpler and less
 *  error-prone than incremental add/remove/reorder endpoints for a list
 *  that's realistically a handful of steps. Replaces all of a routine's
 *  steps in one transaction. */
export async function setRoutineSteps(routineId: number, steps: { productId: number; stepLabel: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (steps.length === 0) throw new Error("Routine-д хамгийн багадаа нэг алхам байх ёстой.");
  if (new Set(steps.map(step => step.productId)).size !== steps.length) throw new Error("Нэг бүтээгдэхүүн routine-д хоёр удаа орж болохгүй.");

  await db.transaction(async tx => {
    await tx.delete(routineSteps).where(eq(routineSteps.routineId, routineId));
    await tx.insert(routineSteps).values(steps.map((step, index) => ({ routineId, productId: step.productId, stepNumber: index + 1, stepLabel: step.stepLabel })));
  });
  return getAdminRoutineDetail(routineId);
}

export async function getOrderForUser(orderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  return result[0];
}

export async function getOrdersForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const orderRows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  if (!orderRows.length) return [];
  // `productId` (nullable — SET NULL if the product was later deleted) lets
  // the "Дахин захиалах" (Buy Again) button on the profile Orders tab
  // re-add these exact products to the cart. Scoped to this user's own
  // order ids rather than scanning the whole order_items table.
  const lineItems = await db.select({ orderId: orderItems.orderId, productId: orderItems.productId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(inArray(orderItems.orderId, orderRows.map(order => order.id)));
  return orderRows.map(order => ({ ...order, items: lineItems.filter(item => item.orderId === order.id) }));
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
  if (!current[0] || current[0].userId !== userId) throw new Error("Order not found.");
  if (current[0].status !== "pending" && current[0].status !== "confirmed") throw new Error("This order can no longer be cancelled -- it has already been packed or closed.");
  return updateAdminOrder({ id: orderId, status: "cancelled" });
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
async function findVerifyingOrderId(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ orderId: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), eq(orderItems.productId, productId), sql`${orders.status} <> 'cancelled'`))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return rows[0]?.orderId ?? null;
}

export async function createProductReview(input: { userId: number; productId: number; rating: number; comment: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const verifyingOrderId = await findVerifyingOrderId(input.userId, input.productId);
  if (!verifyingOrderId) throw new Error("Та энэ бүтээгдэхүүнийг захиалсан тохиолдолд л сэтгэгдэл бичих боломжтой.");

  const existing = await db.select({ id: productReviews.id }).from(productReviews).where(and(eq(productReviews.userId, input.userId), eq(productReviews.productId, input.productId))).limit(1);
  if (existing[0]) throw new Error("Та энэ бүтээгдэхүүнд сэтгэгдэл өмнө нь бичсэн байна.");

  const inserted = await db.insert(productReviews).values({
    productId: input.productId,
    userId: input.userId,
    orderId: verifyingOrderId,
    rating: input.rating,
    comment: input.comment,
  });
  const created = await db.select().from(productReviews).where(eq(productReviews.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

/** Public, approved-only reviews for a product page — newest first. */
export async function getProductReviews(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: productReviews.id,
      rating: productReviews.rating,
      comment: productReviews.comment,
      createdAt: productReviews.createdAt,
      reviewerName: users.name,
    })
    .from(productReviews)
    .innerJoin(users, eq(users.id, productReviews.userId))
    .where(and(eq(productReviews.productId, productId), eq(productReviews.isApproved, true)))
    .orderBy(desc(productReviews.createdAt));
}

/**
 * NEWVISION.md §6 "Юу ярьж байна" -- Isetan's "Let Customers Speak for Us"
 * equivalent, real reviews only (rating >= 4, a real non-empty comment,
 * approved). Real paid-order volume is near zero today, so this can
 * legitimately return few or zero rows -- CustomerVoices.tsx hides the whole
 * section rather than padding it with lower-rated or commentless reviews to
 * hit a target count (same "never fabricate to fill a section" discipline
 * as the bestseller rail's empty state).
 */
export async function getFeaturedReviews(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: productReviews.id,
      rating: productReviews.rating,
      comment: productReviews.comment,
      createdAt: productReviews.createdAt,
      reviewerName: users.name,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productImageUrl: products.imageUrl,
    })
    .from(productReviews)
    .innerJoin(users, eq(users.id, productReviews.userId))
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(and(
      eq(productReviews.isApproved, true),
      eq(products.isPublished, true),
      gte(productReviews.rating, 4),
      sql`${productReviews.comment} IS NOT NULL AND ${productReviews.comment} <> ''`,
    ))
    .orderBy(desc(productReviews.createdAt))
    .limit(limit);
}

/** Whether the current user has already reviewed this product, and whether
 *  they're even eligible to (verified purchase) — drives the ProductDetail
 *  review form's three states: write / already-reviewed / not-eligible. */
export async function getReviewEligibility(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return { canReview: false, alreadyReviewed: false };
  const existing = await db.select({ id: productReviews.id }).from(productReviews).where(and(eq(productReviews.userId, userId), eq(productReviews.productId, productId))).limit(1);
  if (existing[0]) return { canReview: false, alreadyReviewed: true };
  const verifyingOrderId = await findVerifyingOrderId(userId, productId);
  return { canReview: Boolean(verifyingOrderId), alreadyReviewed: false };
}

/** Admin moderation list (PREMIUM-FEATURES.md TIER 2) — every review
 *  (approved or hidden), newest first, with enough context (product + author)
 *  to moderate without a second lookup. Not paginated: review volume is far
 *  below the scale that would need it, matching the "жижиг moderation хэсэг"
 *  (small moderation panel, not a full queue system) scope in the plan. */
export async function getAdminReviews() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: productReviews.id,
      rating: productReviews.rating,
      comment: productReviews.comment,
      isApproved: productReviews.isApproved,
      createdAt: productReviews.createdAt,
      productId: productReviews.productId,
      productName: products.name,
      productSlug: products.slug,
      reviewerName: users.name,
      reviewerEmail: users.email,
    })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .innerJoin(users, eq(users.id, productReviews.userId))
    .orderBy(desc(productReviews.createdAt));
}

export async function setReviewApproval(id: number, isApproved: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(productReviews).set({ isApproved, updatedAt: new Date() }).where(eq(productReviews.id, id));
  return { id, isApproved };
}

export async function deleteAdminReview(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(productReviews).where(eq(productReviews.id, id));
  return { id };
}

export async function createQPayPaymentAttempt(input: { orderId: number; providerInvoiceId: string; responseJson: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(paymentAttempts).values({ orderId: input.orderId, provider: "qpay", providerInvoiceId: input.providerInvoiceId, responseJson: input.responseJson });
  const attempt = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerInvoiceId, input.providerInvoiceId)).limit(1);
  return attempt[0];
}

export async function getLatestQPayPaymentAttemptForOrder(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).orderBy(desc(paymentAttempts.createdAt)).limit(1);
  return attempts[0];
}

export async function getPaymentAttemptByInvoiceId(providerInvoiceId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerInvoiceId, providerInvoiceId)).limit(1);
  return attempts[0];
}

export async function storeQPayPaymentAttemptResponse(input: { id: number; responseJson: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(paymentAttempts).set({ responseJson: input.responseJson, updatedAt: new Date() }).where(eq(paymentAttempts.id, input.id));
}

export async function markQPayPaymentAttemptPaid(input: { id: number; orderId: number; providerPaymentId: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(paymentAttempts).set({ status: "paid", providerPaymentId: input.providerPaymentId, updatedAt: new Date() }).where(eq(paymentAttempts.id, input.id));
  await db.update(orders).set({ paymentStatus: "paid", status: "confirmed", updatedAt: new Date() }).where(eq(orders.id, input.orderId));
}

export async function getAdminProducts() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      description: products.description,
      sku: products.sku,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      costMnt: products.costMnt,
      imageUrl: products.imageUrl,
      galleryJson: products.galleryJson,
      stockQuantity: products.stockQuantity,
      isPublished: products.isPublished,
      updatedAt: products.updatedAt,
      categoryName: productCategories.name,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .orderBy(desc(products.updatedAt));
}

// Backend audit (2026-09-02): both queries here used to be genuinely
// unbounded -- `.from(orders)` with no LIMIT, and `.from(orderItems)` with
// no WHERE clause at all, fetching every order-item row that has ever
// existed regardless of how many orders were even shown, then filtering in
// JS. Harmless today at a handful of real orders; a real "fix before
// go-live" item once order volume is real (per ROADMAP.md's own framing).
// `limit` defaults to the most recent 200 orders -- generous enough that
// the admin-only order list panel behaves exactly as before at any
// realistic near-term volume, while the query itself is no longer
// architecturally unbounded. lineItems is now scoped to only the fetched
// orders' own ids instead of the whole table.
export async function getAdminOrders(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
  if (!orderRows.length) return [];
  const orderIds = orderRows.map(order => order.id);
  const lineItems = await db.select({ orderId: orderItems.orderId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(inArray(orderItems.orderId, orderIds));
  return orderRows.map(order => ({ ...order, items: lineItems.filter(item => item.orderId === order.id) }));
}

const LOW_STOCK_THRESHOLD = 5;

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase F): extracted out
 * of getAdminDashboardSummary's own inline query so the dashboard's
 * "НӨӨЦ ДУУСЧ БАЙНА" widget and the new low-stock owner-digest job
 * (server/automation.ts) read the exact same canonical query -- no risk of
 * the two silently drifting apart (e.g. a future edit to one's threshold or
 * published-only filter not being mirrored in the other).
 */
export async function getLowStockProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: products.id,
    name: products.name,
    sku: products.sku,
    stockQuantity: products.stockQuantity,
  }).from(products).where(and(eq(products.isPublished, true), sql`${products.stockQuantity} <= ${LOW_STOCK_THRESHOLD}`)).orderBy(asc(products.stockQuantity)).limit(10);
}

export async function getAdminDashboardSummary() {
  const db = await getDb();
  if (!db) {
    return { totalOrders: 0, totalRevenueMnt: 0, activeUsers: 0, recentOrders: [] as { id: number; orderNumber: string; customerName: string; totalMnt: number; status: string; paymentStatus: string; createdAt: Date; firstItemName: string | null; firstItemImageUrl: string | null; itemCount: number }[], lowStockProducts: [], failedPayments: [], ordersLast7d: 0, ordersPrevious7d: 0, ordersDailySeries: [] as { date: string; orderCount: number }[] };
  }

  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // 2026-09-06: for the new admin dashboard's "Захиалга" stat card + its
  // sparkline. Plain COUNT(*) over orders.createdAt, not payment-status
  // filtered -- matches totalOrders's own "every order regardless of
  // payment outcome" operational semantics (this counts orders placed, not
  // orders paid). One grouped query over the last 14 days, bucketed in JS
  // into "this week" vs "the week before" -- zero-filled so the sparkline
  // always has exactly 7 points, unlike getRevenueTimeseries's sparse
  // convention elsewhere (a sparkline needs a fixed length; a day with 0
  // orders is a real, meaningful zero, not a gap to omit).
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const dailyOrderDateExpr = sql<string>`date(${orders.createdAt})`;

  const [[orderCountRow], [revenueRow], [activeUserRow], recentOrders, lowStockProducts, failedPayments, dailyOrderRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(orders),
    db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(eq(orders.paymentStatus, "paid")),
    db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.lastSignedIn, activeSince)),
    db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      totalMnt: orders.totalMnt,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    }).from(orders).orderBy(desc(orders.createdAt)).limit(10),
    getLowStockProducts(),
    db.select({
      id: paymentAttempts.id,
      orderId: paymentAttempts.orderId,
      orderNumber: orders.orderNumber,
      provider: paymentAttempts.provider,
      createdAt: paymentAttempts.createdAt,
    }).from(paymentAttempts).leftJoin(orders, eq(paymentAttempts.orderId, orders.id)).where(eq(paymentAttempts.status, "failed")).orderBy(desc(paymentAttempts.createdAt)).limit(10),
    db.select({ date: dailyOrderDateExpr, count: sql<number>`count(*)` }).from(orders).where(gte(orders.createdAt, fourteenDaysAgo)).groupBy(dailyOrderDateExpr),
  ]);

  // 2026-09-08 (reference-driven admin redesign): the new dashboard's
  // "Сүүлийн захиалгууд" table shows what was actually bought (thumbnail +
  // product name), not just an order number -- one extra query over exactly
  // the 10 orders already fetched above, keyed by orderId. Reads
  // order_items' denormalized productName (durable across product deletion,
  // same discipline as getTopProducts) but LEFT JOINs products purely for
  // the photo, which is presentation-only and may legitimately be missing.
  const recentOrderIds = recentOrders.map(order => order.id);
  const recentOrderItemRows = recentOrderIds.length === 0 ? [] : await db.select({
    id: orderItems.id,
    orderId: orderItems.orderId,
    productName: orderItems.productName,
    imageUrl: products.imageUrl,
  }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(inArray(orderItems.orderId, recentOrderIds)).orderBy(asc(orderItems.id));
  const firstItemByOrderId = new Map<number, { productName: string; imageUrl: string | null }>();
  const itemCountByOrderId = new Map<number, number>();
  for (const row of recentOrderItemRows) {
    itemCountByOrderId.set(row.orderId, (itemCountByOrderId.get(row.orderId) ?? 0) + 1);
    if (!firstItemByOrderId.has(row.orderId)) firstItemByOrderId.set(row.orderId, { productName: row.productName, imageUrl: row.imageUrl ?? null });
  }
  const recentOrdersWithItems = recentOrders.map(order => ({
    ...order,
    firstItemName: firstItemByOrderId.get(order.id)?.productName ?? null,
    firstItemImageUrl: firstItemByOrderId.get(order.id)?.imageUrl ?? null,
    itemCount: itemCountByOrderId.get(order.id) ?? 0,
  }));

  const countsByDate = new Map(dailyOrderRows.map(row => [row.date, Number(row.count)]));
  const dayString = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ordersDailySeries: { date: string; orderCount: number }[] = [];
  let ordersLast7d = 0;
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const orderCount = countsByDate.get(dayString(daysAgo)) ?? 0;
    ordersDailySeries.push({ date: dayString(daysAgo), orderCount });
    ordersLast7d += orderCount;
  }
  let ordersPrevious7d = 0;
  for (let daysAgo = 13; daysAgo >= 7; daysAgo--) ordersPrevious7d += countsByDate.get(dayString(daysAgo)) ?? 0;

  return {
    totalOrders: Number(orderCountRow?.count ?? 0),
    totalRevenueMnt: Number(revenueRow?.total ?? 0),
    activeUsers: Number(activeUserRow?.count ?? 0),
    recentOrders: recentOrdersWithItems,
    lowStockProducts,
    failedPayments,
    ordersLast7d,
    ordersPrevious7d,
    ordersDailySeries,
  };
}

export async function adminGlobalSearch(queryText: string) {
  const db = await getDb();
  if (!db) return { products: [], orders: [], users: [], discountCodes: [], promotions: [], posts: [] };
  const term = `%${queryText}%`;

  // discountCodes/promotions/posts added 2026-09-07 (Project "SUGI Desk") --
  // found live: the admin command palette/top-bar search only ever covered
  // products/orders/users, so searching for a real discount code, promotion,
  // or post by name silently came back empty. Same shape as the queries
  // already here, not a new pattern. Posts excludes soft-deleted (trashed)
  // rows -- a post sitting in the trash shouldn't surface as a live search
  // result an admin could try to open.
  const [productRows, orderRows, userRows, discountCodeRows, promotionRows, postRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, sku: products.sku, slug: products.slug })
      .from(products)
      .where(or(like(products.name, term), like(products.sku, term)))
      .limit(5),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, customerPhone: orders.customerPhone, totalMnt: orders.totalMnt, status: orders.status })
      .from(orders)
      .where(or(like(orders.orderNumber, term), like(orders.customerName, term), like(orders.customerPhone, term)))
      .limit(5),
    db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role })
      .from(users)
      .where(or(like(users.name, term), like(users.email, term), like(users.phone, term)))
      .limit(5),
    db.select({ id: discountCodes.id, code: discountCodes.code, isActive: discountCodes.isActive })
      .from(discountCodes)
      .where(like(discountCodes.code, term))
      .limit(5),
    db.select({ id: sitePromotions.id, headline: sitePromotions.headline, isActive: sitePromotions.isActive })
      .from(sitePromotions)
      .where(like(sitePromotions.headline, term))
      .limit(5),
    db.select({ id: posts.id, title: posts.title, slug: posts.slug, isPublished: posts.isPublished })
      .from(posts)
      .where(and(or(like(posts.title, term), like(posts.slug, term)), isNull(posts.deletedAt)))
      .limit(5),
  ]);

  return { products: productRows, orders: orderRows, users: userRows, discountCodes: discountCodeRows, promotions: promotionRows, posts: postRows };
}

const orderStatusRank = { pending: 0, confirmed: 1, packed: 2, out_for_delivery: 3, completed: 4 } as const;
export type FulfilmentStatus = keyof typeof orderStatusRank | "cancelled" | "returned";

// Admin overhaul (2026-09-08, Phase E): the tx type a `db.transaction(async
// tx => ...)` callback receives, derived structurally (no direct import of
// drizzle-orm/mysql2's transaction type exists elsewhere in this file) so
// restoreStockForOrder below can be extracted out of updateAdminOrder's
// inline transaction body and reused by refundOrder's own transaction.
type OrderTx = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];
// Accepted by every branch-stock helper below so they work identically
// standalone (a plain getDb() connection) or inside an existing
// db.transaction callback (OrderTx) -- both expose the same query-builder
// shape, so one implementation covers both without duplicating it.
type DbOrTx = OrderTx | NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase K/L): the one
 * place that keeps 3 numbers honest after ANY branch_stock write --
 * productVariants.stockQuantity (a derived, cached SUM across every
 * branch -- every existing reader keeps working off this one column
 * unmodified) and, when this variant is its product's ONLY one,
 * products.stockQuantity too (mirrors syncSoleVariantFromProduct's own
 * established scope -- catalog list/ProductDetail/recommendation-candidate
 * queries read THAT column directly, never joining to variants, so it must
 * reflect the real post-sale number just as promptly). Every write path
 * that touches branch_stock (checkout's decrement, cancellation's restore,
 * the admin per-branch editor, POS) calls this immediately after.
 */
async function recomputeVariantStockTotal(db: DbOrTx, variantId: number) {
  const [totalRow] = await db.select({ total: sql<number>`COALESCE(SUM(${branchStock.stockQuantity}), 0)` }).from(branchStock).where(eq(branchStock.variantId, variantId));
  const total = Number(totalRow?.total ?? 0);
  await db.update(productVariants).set({ stockQuantity: total, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
  const [variantRow] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  if (variantRow) {
    const siblings = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, variantRow.productId));
    if (siblings.length === 1) {
      await db.update(products).set({ stockQuantity: total, updatedAt: new Date() }).where(eq(products.id, variantRow.productId));
    }
  }
  return total;
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase L/M): the one
 * atomic, race-proof branch-stock decrement -- shared by checkout
 * (createOrderFromActiveCart, requirePublished: true -- see BUG-004) and
 * the POS in-person-sale tool (recordInStoreSale, requirePublished: false
 * -- a physical shelf item's online-publish flag is irrelevant to a
 * register sale; a staff member scanning a real barcode off a real shelf
 * is its own proof the item exists and is for sale).
 *
 * A variant only has branch_stock rows once it's gone through the admin
 * write path (createAdminProductVariant/backfill-branch-stock.ts) -- one
 * inserted directly (a test fixture, or a not-yet-migrated environment
 * with no branches configured at all) has none. hasPerBranchTracking below
 * falls back to the pre-Phase-L aggregate decrement for exactly that case,
 * so this never breaks a variant that was never enrolled in per-branch
 * stock. MySQL forbids "UPDATE x ... WHERE EXISTS (SELECT ... FROM x ...)"
 * -- you can't target a table for update while also selecting FROM that
 * same table in a subquery (error 1093) -- so the two branches below need
 * their own EXISTS shape: the branch_stock UPDATE can safely subquery
 * productVariants (a different table); the legacy productVariants UPDATE
 * has to subquery only `products`.
 */
async function decrementBranchStock(tx: OrderTx, branchId: number, variantId: number, quantity: number, options: { requirePublished: boolean; itemLabel: string }) {
  const hasPerBranchTracking = (await tx.select({ id: branchStock.id }).from(branchStock).where(eq(branchStock.variantId, variantId)).limit(1)).length > 0;
  const update = hasPerBranchTracking
    ? await tx.update(branchStock).set({
        stockQuantity: sql`${branchStock.stockQuantity} - ${quantity}`,
        updatedAt: new Date(),
      }).where(and(
        eq(branchStock.branchId, branchId),
        eq(branchStock.variantId, variantId),
        gte(branchStock.stockQuantity, quantity),
        options.requirePublished ? sql`EXISTS (SELECT 1 FROM ${productVariants} JOIN ${products} ON ${products.id} = ${productVariants.productId} WHERE ${productVariants.id} = ${branchStock.variantId} AND ${products.isPublished} = TRUE)` : undefined,
      ))
    : await tx.update(productVariants).set({
        stockQuantity: sql`${productVariants.stockQuantity} - ${quantity}`,
        updatedAt: new Date(),
      }).where(and(
        eq(productVariants.id, variantId),
        gte(productVariants.stockQuantity, quantity),
        options.requirePublished ? sql`EXISTS (SELECT 1 FROM ${products} WHERE ${products.id} = ${productVariants.productId} AND ${products.isPublished} = TRUE)` : undefined,
      ));
  if (Number(update[0].affectedRows ?? 0) !== 1) {
    throw new Error(hasPerBranchTracking
      ? `${options.itemLabel} is no longer available in the requested quantity at the selected branch. Please refresh your cart or choose a different branch.`
      : `${options.itemLabel} is no longer available in the requested quantity. Please refresh your cart.`);
  }
  if (hasPerBranchTracking) await recomputeVariantStockTotal(tx, variantId);
}

// Extracted from updateAdminOrder's inline loop (Phase E) so refundOrder can
// reuse the exact same restock logic when an admin chooses to restock a
// refunded order's items, rather than re-deriving it. PHASE 2 of product
// variants: restores the specific variant's stock, not the parent product's
// -- a historical order placed before variants existed has variantId null
// (best-effort migration backfill couldn't find one), in which case there's
// nothing to safely restore.
//
// Phase L: restores to the SPECIFIC branch this order actually drew from
// (orders.fulfillingBranchId, captured once at order-creation time) rather
// than re-deriving "whichever branch is currently the default" -- an admin
// could reassign the fulfillment-default branch between this order's
// placement and its later cancellation, and re-deriving at cancel-time
// would then credit back the wrong branch's shelf. Falls back to crediting
// the aggregate directly when EITHER there's no real branch to credit
// (fulfillingBranchId null -- an order placed before this column existed,
// or whose branch was since deleted, FK sets it null via onDelete: "set
// null") OR this variant was never enrolled in per-branch tracking in the
// first place (symmetric with createOrderFromActiveCart's own
// hasPerBranchTracking check -- if the ORIGINAL decrement fell back to the
// legacy aggregate path because no branch_stock rows existed for this
// variant, restoring via branch_stock here would credit a row that was
// never actually debited, inflating stock).
async function restoreStockForOrder(tx: OrderTx, orderId: number) {
  const [orderRow] = await tx.select({ fulfillingBranchId: orders.fulfillingBranchId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const lineItems = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const affectedVariantIds = new Set<number>();
  for (const item of lineItems) {
    if (item.variantId === null) continue;
    const hasPerBranchTracking = (await tx.select({ id: branchStock.id }).from(branchStock).where(eq(branchStock.variantId, item.variantId)).limit(1)).length > 0;
    if (orderRow?.fulfillingBranchId && hasPerBranchTracking) {
      const updated = await tx.update(branchStock).set({ stockQuantity: sql`${branchStock.stockQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(and(eq(branchStock.branchId, orderRow.fulfillingBranchId), eq(branchStock.variantId, item.variantId)));
      if (Number(updated[0].affectedRows ?? 0) === 0) {
        // No branch_stock row exists yet for this specific (branch, variant)
        // pair (e.g. this branch was created after the variant already had
        // rows at other branches) -- insert one rather than silently losing
        // the restored quantity.
        await tx.insert(branchStock).values({ branchId: orderRow.fulfillingBranchId, variantId: item.variantId, stockQuantity: item.quantity });
      }
      affectedVariantIds.add(item.variantId);
    } else {
      await tx.update(productVariants).set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(eq(productVariants.id, item.variantId));
    }
  }
  for (const variantId of Array.from(affectedVariantIds)) await recomputeVariantStockTotal(tx, variantId);
}

export async function updateAdminOrder(input: { id: number; status?: FulfilmentStatus; deliveryTrackingRef?: string | null; adminNote?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current[0]) throw new Error("Order not found.");
  if (input.status) {
    const currentStatus = current[0].status;
    // "returned" only ever moves out of "completed" -- everything else that
    // already left the forward-progress track ("cancelled"/"returned"
    // itself) is closed for good. A completed order can ONLY become
    // "returned" from here on, never re-enter the forward progression.
    if (currentStatus === "cancelled" || currentStatus === "returned") throw new Error("This closed order cannot be changed.");
    if (currentStatus === "completed" && input.status !== "returned") throw new Error("This closed order cannot be changed.");
    if (input.status === "returned" && currentStatus !== "completed") throw new Error("Only a completed order can be marked as returned.");
    if (input.status !== "cancelled" && input.status !== "returned" && orderStatusRank[input.status] < orderStatusRank[currentStatus as keyof typeof orderStatusRank]) {
      throw new Error("Order fulfilment cannot move backward.");
    }
  }
  await db.transaction(async tx => {
    if (shouldRestoreStock(current[0].status as FulfilmentStatus, input.status)) {
      await restoreStockForOrder(tx, input.id);
    }
    await tx.update(orders).set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.status === "returned" ? { returnedAt: new Date() } : {}),
      // Fixes a real pre-existing gap: paymentStatus was only ever written
      // by the QPay webhook (markQPayPaymentAttemptPaid) -- a cash_on_
      // delivery/bank_transfer/card order never became "paid" anywhere in
      // the codebase, which would otherwise silently zero out every
      // paymentStatus="paid"-gated analytics figure for this store's actual
      // primary payment method. "Completed" is the real-world moment the
      // courier/bank/card charge is confirmed collected, so that's where
      // this fires -- QPay orders are unaffected (already paid earlier, by
      // the webhook, independent of fulfilment status).
      ...(input.status === "completed" && current[0].paymentMethod !== "qpay" ? { paymentStatus: "paid" as const } : {}),
      ...(input.deliveryTrackingRef !== undefined ? { deliveryTrackingRef: input.deliveryTrackingRef } : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      updatedAt: new Date(),
    }).where(eq(orders.id, input.id));
  });
  const updated = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  return updated[0];
}

// Admin overhaul (2026-09-08, Phase E): the refund/credit flow updateAdminOrder's
// own "returned" handling always deferred as separate, unscoped work.
// Deliberately its own function, not a branch of updateAdminOrder -- this is
// financeProcedure-gated (recording a refund is a money decision), while
// updateAdminOrder stays warehouseProcedure (moving an order through
// fulfilment). Guards enforce: only a "returned" order can be refunded, never
// twice, and the refund can never exceed what the customer actually paid.
export async function refundOrder(input: { id: number; refundAmountMnt: number; refundNote: string | null; restockItems: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current[0]) throw new Error("Order not found.");
  if (current[0].status !== "returned") throw new Error("Only a returned order can be refunded.");
  if (current[0].paymentStatus === "refunded") throw new Error("This order has already been refunded.");
  if (input.refundAmountMnt > current[0].totalMnt) throw new Error("Refund amount cannot exceed the order total.");
  await db.transaction(async tx => {
    if (input.restockItems) {
      await restoreStockForOrder(tx, input.id);
    }
    await tx.update(orders).set({
      paymentStatus: "refunded",
      refundAmountMnt: input.refundAmountMnt,
      refundedAt: new Date(),
      refundNote: input.refundNote,
      updatedAt: new Date(),
    }).where(eq(orders.id, input.id));
  });
  const updated = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  return updated[0];
}

// Admin overhaul (2026-09-08, Phase F): guest checkout customers have never
// had any way to check their order status after leaving the confirmation
// page -- this is the first one. Phone-first (not email) to match this
// project's own phone-first identity model: customerPhone is NOT NULL,
// customerEmail isn't, so phone is the only field guaranteed present for
// every order including the common cash-on-delivery/bank-transfer checkout.
// Single combined query (order number AND phone match together, same
// tolerant right-8-digits comparison findUserByPhone's own fallback uses,
// since customerPhone is checkout-collected free text, not guaranteed to
// already be in a normalized form) so a wrong order number and a right
// order number with a wrong phone produce the exact same "not found" --
// this is a public, anti-enumeration lookup, not a login.
export async function getOrderForTracking(orderNumber: string, phone: string) {
  const db = await getDb();
  if (!db) return null;
  const digitsOnlyPhone = phone.replace(/\D/g, "");
  if (digitsOnlyPhone.length < 8) return null;
  const localPhone = digitsOnlyPhone.slice(-8);
  const rows = await db.select().from(orders).where(and(eq(orders.orderNumber, orderNumber.trim()), sql`RIGHT(REGEXP_REPLACE(${orders.customerPhone}, '[^0-9]', ''), 8) = ${localPhone}`)).limit(1);
  const order = rows[0];
  if (!order) return null;
  const items = await db.select({ productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(eq(orderItems.orderId, order.id));
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    pickupBranch: order.pickupBranch,
    deliveryAddress: order.deliveryAddress,
    deliveryTrackingRef: order.deliveryTrackingRef,
    totalMnt: order.totalMnt,
    createdAt: order.createdAt,
    items,
  };
}

// 2026-09-07 (WordPress-parity admin editor rebuild): categoryIds/tagNames
// resolve into post_category_links/post_tag_links (see attachPostTaxonomy
// below); publishAt lets an admin schedule a future publish date instead of
// always auto-stamping "now" the moment isPublished flips true (see
// getPublishedPosts/getPublishedPostBySlug's `publishedAt <= NOW()` gate --
// this is the entire scheduling mechanism, no cron/job queue involved).
export type PostWriteInput = {
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImageUrl?: string | null;
  isPublished: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  format?: string;
  categoryIds?: number[];
  tagNames?: string[];
  publishAt?: Date | null;
};

type PostTaxonomy = { categories: { id: number; name: string; slug: string }[]; tags: { id: number; name: string; slug: string }[] };
const emptyTaxonomy: PostTaxonomy = { categories: [], tags: [] };

/**
 * Batch-loads categories/tags for a set of posts in 2 extra queries total
 * (not N+1) -- fine at this blog's scale, and avoids the duplicate-row
 * fan-out a single multi-join query would produce for posts with >1
 * category/tag.
 */
async function getPostTaxonomyMap(postIds: number[]): Promise<Map<number, PostTaxonomy>> {
  const map = new Map<number, PostTaxonomy>();
  if (postIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const [categoryRows, tagRows] = await Promise.all([
    db.select({ postId: postCategoryLinks.postId, id: postCategories.id, name: postCategories.name, slug: postCategories.slug })
      .from(postCategoryLinks).innerJoin(postCategories, eq(postCategoryLinks.categoryId, postCategories.id))
      .where(inArray(postCategoryLinks.postId, postIds)),
    db.select({ postId: postTagLinks.postId, id: postTags.id, name: postTags.name, slug: postTags.slug })
      .from(postTagLinks).innerJoin(postTags, eq(postTagLinks.tagId, postTags.id))
      .where(inArray(postTagLinks.postId, postIds)),
  ]);
  for (const row of categoryRows) {
    const entry = map.get(row.postId) ?? { categories: [], tags: [] };
    entry.categories.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.postId, entry);
  }
  for (const row of tagRows) {
    const entry = map.get(row.postId) ?? { categories: [], tags: [] };
    entry.tags.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.postId, entry);
  }
  return map;
}

/** Replaces (not merges) a post's category/tag links -- undefined means "leave as-is" (used by partial updates). */
async function attachPostTaxonomy(postId: number, categoryIds: number[] | undefined, tagNames: string[] | undefined) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (categoryIds !== undefined) {
    await db.delete(postCategoryLinks).where(eq(postCategoryLinks.postId, postId));
    if (categoryIds.length > 0) await db.insert(postCategoryLinks).values(categoryIds.map(categoryId => ({ postId, categoryId })));
  }
  if (tagNames !== undefined) {
    const tagIds = await resolveTagIdsByName(tagNames);
    await db.delete(postTagLinks).where(eq(postTagLinks.postId, postId));
    if (tagIds.length > 0) await db.insert(postTagLinks).values(tagIds.map(tagId => ({ postId, tagId })));
  }
}

/** Tags are created on the fly by name (matches WordPress's tag input) -- categories are not, they're picked from an admin-managed list. */
async function resolveTagIdsByName(names: string[]): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const uniqueNames = Array.from(new Set(names.map(name => name.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) return [];
  const existing = await db.select().from(postTags).where(inArray(postTags.name, uniqueNames));
  const existingByName = new Map(existing.map(tag => [tag.name, tag]));
  const ids: number[] = [];
  for (const name of uniqueNames) {
    const found = existingByName.get(name);
    if (found) { ids.push(found.id); continue; }
    const slug = slugify(name) || `tag-${Date.now()}`;
    const inserted = await db.insert(postTags).values({ name, slug });
    ids.push(Number(inserted[0].insertId));
  }
  return ids;
}

export async function getPublishedPosts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: posts.id, title: posts.title, slug: posts.slug, excerpt: posts.excerpt, coverImageUrl: posts.coverImageUrl, publishedAt: posts.publishedAt })
    .from(posts)
    // 2026-09-07: added `publishedAt <= NOW()` -- a post with isPublished
    // true but a future publishedAt (an admin-scheduled post) must stay
    // invisible here until that moment actually passes. No cron/worker
    // needed: this WHERE clause re-evaluates on every normal page-load
    // query, so a scheduled post simply starts appearing the next time
    // anyone loads a page after its publish time.
    .where(and(eq(posts.isPublished, true), isNull(posts.deletedAt), lte(posts.publishedAt, new Date())))
    .orderBy(desc(posts.publishedAt));
  const taxonomy = await getPostTaxonomyMap(rows.map(row => row.id));
  return rows.map(row => ({ ...row, ...(taxonomy.get(row.id) ?? emptyTaxonomy) }));
}

/**
 * `bypassGate`: used by content.bySlug when the requester is a signed-in
 * staff/admin, so "Preview" (see AdminPostsPanel.tsx) can open a real,
 * unpublished or not-yet-scheduled post's actual public URL. A trashed post
 * is never previewable this way -- deletedAt IS NULL always applies.
 */
export async function getPublishedPostBySlug(slug: string, options: { bypassGate?: boolean } = {}) {
  const db = await getDb();
  // 2026-09-07 (real, pre-existing bug found live via Playwright while
  // testing the new Preview/Trash flow -- not something this WordPress-
  // parity change introduced, but hit directly by it and fixed while here):
  // returning `undefined` for "no post found" made react-query itself throw
  // "Query data cannot be undefined" in the browser console on every single
  // not-found post slug, including the ordinary 404 case PostDetail.tsx
  // already handles via `!post`. `null` means exactly the same thing to
  // that check and is what react-query actually requires a query fn return.
  if (!db) return null;
  const conditions = [eq(posts.slug, slug), isNull(posts.deletedAt)];
  if (!options.bypassGate) conditions.push(eq(posts.isPublished, true), lte(posts.publishedAt, new Date()));
  const rows = await db.select().from(posts).where(and(...conditions)).limit(1);
  if (!rows[0]) return null;
  const taxonomy = (await getPostTaxonomyMap([rows[0].id])).get(rows[0].id) ?? emptyTaxonomy;
  return { ...rows[0], ...taxonomy };
}

/** Admin list -- every post regardless of published/draft/scheduled/trash status; the panel itself filters by tab. */
export async function getAdminPosts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt));
  const taxonomy = await getPostTaxonomyMap(rows.map(row => row.id));
  return rows.map(row => ({ ...row, ...(taxonomy.get(row.id) ?? emptyTaxonomy) }));
}

export async function postSlugExists(slug: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
  return Boolean(rows[0] && rows[0].id !== excludeId);
}

export async function createAdminPost(input: PostWriteInput & { createdByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { categoryIds, tagNames, publishAt, ...postFields } = input;
  const inserted = await db.insert(posts).values({
    ...postFields,
    content: sanitizePostContent(input.content),
    excerpt: input.excerpt ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    format: input.format ?? "standard",
    publishedAt: input.isPublished ? (publishAt ?? new Date()) : null,
  });
  const postId = Number(inserted[0].insertId);
  await attachPostTaxonomy(postId, categoryIds, tagNames);
  const created = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return { ...created[0], ...((await getPostTaxonomyMap([postId])).get(postId) ?? emptyTaxonomy) };
}

export async function updateAdminPost(input: { id: number } & Partial<PostWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(posts).where(eq(posts.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Пост олдсонгүй.");
  const { id, categoryIds, tagNames, publishAt, content, ...changes } = input;
  const willBePublished = input.isPublished ?? existing[0].isPublished;
  // An explicit publishAt always wins (admin is actively scheduling/
  // rescheduling); otherwise preserve the original "stamp now, once, on the
  // false->true transition" behavior so re-saving an already-published post
  // never resets its publish date.
  const nextPublishedAt = !willBePublished ? null
    : publishAt !== undefined ? publishAt
    : (input.isPublished === true && !existing[0].isPublished) ? new Date()
    : existing[0].publishedAt;
  await db.update(posts).set({
    ...changes,
    ...(content !== undefined ? { content: sanitizePostContent(content) } : {}),
    publishedAt: nextPublishedAt,
    updatedAt: new Date(),
  }).where(eq(posts.id, id));
  await attachPostTaxonomy(id, categoryIds, tagNames);
  const updated = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return { ...updated[0], ...((await getPostTaxonomyMap([id])).get(id) ?? emptyTaxonomy) };
}

/** Soft-delete (WordPress "Move to Trash") -- restorable via restoreAdminPost, not visible in getPublishedPosts/getAdminPosts's public-facing queries. */
export async function trashAdminPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, id));
  return { id };
}

export async function restoreAdminPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(posts).set({ deletedAt: null }).where(eq(posts.id, id));
  return { id };
}

/** WordPress's "Delete Permanently" -- only allowed on a post already in Trash, matching WP's own 2-step flow (no one-click permanent delete from the main list). */
export async function permanentlyDeleteAdminPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ deletedAt: posts.deletedAt }).from(posts).where(eq(posts.id, id)).limit(1);
  if (!existing[0]) throw new Error("Пост олдсонгүй.");
  if (!existing[0].deletedAt) throw new Error("Эхлээд постыг хогийн санд шилжүүлнэ үү.");
  await db.delete(posts).where(eq(posts.id, id));
  return { id };
}

// --- Post categories (WordPress-parity taxonomy; flat, no parent/child nesting) ---

export async function getAdminPostCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(postCategories).orderBy(asc(postCategories.name));
}

export async function postCategoryNameExists(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: postCategories.id }).from(postCategories).where(eq(postCategories.name, name)).limit(1);
  return Boolean(rows[0]);
}

export async function createAdminPostCategory(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const slug = slugify(name) || `category-${Date.now()}`;
  const inserted = await db.insert(postCategories).values({ name, slug });
  const created = await db.select().from(postCategories).where(eq(postCategories.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

// --- Media library (backs the new post editor's "Add Media" modal) ---

export async function getAdminMediaLibrary(options: { search?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const pageSize = Math.min(Math.max(options.pageSize ?? 24, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const whereClause = options.search ? like(mediaLibrary.fileName, `%${options.search}%`) : undefined;
  const [items, countRows] = await Promise.all([
    db.select().from(mediaLibrary).where(whereClause).orderBy(desc(mediaLibrary.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(mediaLibrary).where(whereClause),
  ]);
  return { items, total: Number(countRows[0]?.count ?? 0) };
}

export async function insertMediaLibraryItem(input: { key: string; url: string; fileName: string; contentType: string; sizeBytes: number; uploadedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(mediaLibrary).values(input);
  const created = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

// NEWVISION.md §5 "Топ брэндүүд" -- same CRUD shape as posts above.
export type FeaturedBrandWriteInput = { brandName: string; tagline?: string | null; photoUrl?: string | null; sortOrder?: number; isActive?: boolean };

/**
 * Public, customer-facing list -- active brands only, in admin-chosen
 * order. `photoUrl` falls back to the most recently added real, published,
 * imaged product carrying this brand when the admin hasn't uploaded a
 * dedicated brand photo, same "never show a broken/placeholder tile"
 * discipline as CategoryMasonry's per-category photo fallback.
 */
export async function getFeaturedBrands() {
  const db = await getDb();
  if (!db) return [];
  const brands = await db.select().from(featuredBrands).where(eq(featuredBrands.isActive, true)).orderBy(asc(featuredBrands.sortOrder));
  return Promise.all(brands.map(async brand => {
    if (brand.photoUrl) return brand;
    const fallbackPhoto = await db.select({ imageUrl: products.imageUrl }).from(products)
      .where(and(eq(products.brand, brand.brandName), eq(products.isPublished, true), sql`${products.imageUrl} IS NOT NULL`))
      .orderBy(desc(products.createdAt)).limit(1);
    return { ...brand, photoUrl: fallbackPhoto[0]?.imageUrl ?? null };
  }));
}

export async function getAdminFeaturedBrands() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(featuredBrands).orderBy(asc(featuredBrands.sortOrder));
}

/** Admin's "add a brand" dropdown -- real, currently-used products.brand
 *  values only (never free text), so a featured-brand tile can never point
 *  at zero real products. Counts help the admin judge which brands are
 *  actually worth featuring. */
export async function getDistinctRealBrands() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ brand: products.brand, count: sql<number>`count(*)` }).from(products)
    .where(and(eq(products.isPublished, true), sql`${products.brand} IS NOT NULL AND ${products.brand} <> ''`))
    .groupBy(products.brand)
    .orderBy(desc(sql`count(*)`));
}

export async function createFeaturedBrand(input: FeaturedBrandWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(featuredBrands).values({ ...input, tagline: input.tagline ?? null, photoUrl: input.photoUrl ?? null, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true });
  const created = await db.select().from(featuredBrands).where(eq(featuredBrands.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateFeaturedBrand(input: { id: number } & Partial<FeaturedBrandWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(featuredBrands).where(eq(featuredBrands.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Brand not found.");
  const { id, ...changes } = input;
  await db.update(featuredBrands).set({ ...changes, updatedAt: new Date() }).where(eq(featuredBrands.id, id));
  const updated = await db.select().from(featuredBrands).where(eq(featuredBrands.id, id)).limit(1);
  return updated[0];
}

export async function deleteFeaturedBrand(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(featuredBrands).where(eq(featuredBrands.id, id));
  return { id };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase J). Same
 * active-only/sortOrder-ordered shape as getFeaturedBrands, minus that
 * function's photo-fallback step (a branch's photo is optional decoration,
 * not the point of the record -- StoreLocatorSection already renders fine
 * with no photo at all).
 */
export async function getActiveBranches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.sortOrder));
}

export async function getAdminBranches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).orderBy(asc(branches.sortOrder));
}

export type BranchWriteInput = {
  name: string;
  slug: string;
  address: string;
  phone?: string | null;
  mapUrl?: string | null;
  photoUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isFulfillmentDefault?: boolean;
};

/** At most one branch can be the fulfillment default (Phase L reads exactly
 *  one row for UB-delivery stock decrements) -- setting one on clears it
 *  from every other row in the same write, so the admin toggle behaves like
 *  a radio button, not an independent checkbox per row. */
async function clearOtherFulfillmentDefaults(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, exceptId?: number) {
  const condition = exceptId ? and(eq(branches.isFulfillmentDefault, true), sql`${branches.id} <> ${exceptId}`) : eq(branches.isFulfillmentDefault, true);
  await db.update(branches).set({ isFulfillmentDefault: false, updatedAt: new Date() }).where(condition);
}

export async function createBranch(input: BranchWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(branches).values({
    name: input.name, slug: input.slug, address: input.address,
    phone: input.phone ?? null, mapUrl: input.mapUrl ?? null, photoUrl: input.photoUrl ?? null,
    sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true, isFulfillmentDefault: input.isFulfillmentDefault ?? false,
  });
  const id = Number(inserted[0].insertId);
  if (input.isFulfillmentDefault) await clearOtherFulfillmentDefaults(db, id);
  const created = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return created[0];
}

export async function updateBranch(input: { id: number } & Partial<BranchWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(branches).where(eq(branches.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Branch not found.");
  const { id, ...changes } = input;
  await db.update(branches).set({ ...changes, updatedAt: new Date() }).where(eq(branches.id, id));
  if (changes.isFulfillmentDefault) await clearOtherFulfillmentDefaults(db, id);
  const updated = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return updated[0];
}

export async function deleteBranch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(branches).where(eq(branches.id, id));
  return { id };
}

export async function getSiteMedia() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ slotKey: siteMedia.slotKey, imageUrl: siteMedia.imageUrl, altText: siteMedia.altText, updatedAt: siteMedia.updatedAt })
    .from(siteMedia)
    .orderBy(asc(siteMedia.slotKey));
}

export async function upsertSiteMedia(input: { slotKey: string; imageUrl: string; altText?: string | null; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalizedAltText = input.altText?.trim() || null;
  await db.insert(siteMedia).values({
    slotKey: input.slotKey,
    imageUrl: input.imageUrl,
    altText: normalizedAltText,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { imageUrl: input.imageUrl, altText: normalizedAltText, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(siteMedia).where(eq(siteMedia.slotKey, input.slotKey)).limit(1);
  return updated[0];
}

export async function deleteSiteMedia(slotKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteMedia).where(eq(siteMedia.slotKey, slotKey));
  return { slotKey };
}

/** Text-equivalent of the 3 functions above -- see drizzle/schema.ts's
 *  siteText table and shared/site-text.ts's slot registry. */
export async function getSiteText() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ slotKey: siteText.slotKey, textValue: siteText.textValue, updatedAt: siteText.updatedAt })
    .from(siteText)
    .orderBy(asc(siteText.slotKey));
}

export async function upsertSiteText(input: { slotKey: string; textValue: string; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(siteText).values({
    slotKey: input.slotKey,
    textValue: input.textValue,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { textValue: input.textValue, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(siteText).where(eq(siteText.slotKey, input.slotKey)).limit(1);
  return updated[0];
}

export async function deleteSiteText(slotKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteText).where(eq(siteText.slotKey, slotKey));
  return { slotKey };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase A): store_settings
 * -- same upsert-by-unique-key shape as site_media/site_text above, see
 * shared/store-settings.ts for the slot registry and drizzle/schema.ts for
 * the table. `getStoreSettingValue`/`getStoreSettingNumber` are the actual
 * "DB override, code fallback" read path every consumer (checkout, order
 * emails) calls -- a row absent for a key is never an error, just the
 * signal to use that slot's own fallbackValue, identical contract to
 * site_media/site_text's imageFor()/textFor().
 */
export async function getStoreSettings() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ settingKey: storeSettings.settingKey, settingValue: storeSettings.settingValue, updatedAt: storeSettings.updatedAt })
    .from(storeSettings)
    .orderBy(asc(storeSettings.settingKey));
}

export async function getStoreSettingValue(key: StoreSettingKey): Promise<string> {
  const db = await getDb();
  const fallback = getStoreSettingSlot(key).fallbackValue;
  if (!db) return fallback;
  const row = await db.select({ settingValue: storeSettings.settingValue }).from(storeSettings).where(eq(storeSettings.settingKey, key)).limit(1);
  return row[0]?.settingValue ?? fallback;
}

export async function getStoreSettingNumber(key: StoreSettingKey): Promise<number> {
  return Number(await getStoreSettingValue(key));
}

export async function upsertStoreSetting(input: { settingKey: string; settingValue: string; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(storeSettings).values({
    settingKey: input.settingKey,
    settingValue: input.settingValue,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { settingValue: input.settingValue, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(storeSettings).where(eq(storeSettings.settingKey, input.settingKey)).limit(1);
  return updated[0];
}

export async function deleteStoreSetting(settingKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(storeSettings).where(eq(storeSettings.settingKey, settingKey));
  return { settingKey };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase D): the read/write
 * pair server/_core/scheduler.ts calls -- kept here rather than having the
 * scheduler import getDb directly, matching this codebase's own convention
 * of routing all DB access through named functions in this file (see e.g.
 * server/_core/index.ts's `dbPing` import).
 */
export async function getScheduledJobLastRun(jobName: string): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.select({ lastRunAt: scheduledJobRuns.lastRunAt }).from(scheduledJobRuns).where(eq(scheduledJobRuns.jobName, jobName)).limit(1);
  return row[0]?.lastRunAt ?? null;
}

export async function markScheduledJobRun(jobName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scheduledJobRuns).values({ jobName, lastRunAt: new Date() }).onDuplicateKeyUpdate({ set: { lastRunAt: new Date() } });
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase E): the
 * abandoned-cart reminder job's own query -- reuses the EXACT same
 * staleness definition server/analytics.ts's getCartAbandonment already
 * established (item present, 24h+ inactive, not converted), so the
 * dashboard's abandonment number and what this job actually acts on can
 * never drift apart. Scoped, honestly, to carts belonging to a REGISTERED,
 * opted-in user with a real email on file -- a guest cart's `userId` is
 * null (guest identity is a cookie token, see CartOwner), so the inner join
 * on `users` already excludes every guest cart without a separate
 * condition; `reminderSentAt IS NULL` is what keeps a still-abandoned cart
 * from being reminded twice.
 */
export async function getAbandonedCartsNeedingReminder() {
  const db = await getDb();
  if (!db) return [];
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .selectDistinct({ cartId: carts.id, userId: users.id, email: users.email, name: users.name })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .innerJoin(users, eq(users.id, carts.userId))
    .where(and(
      eq(carts.status, "active"),
      lt(carts.updatedAt, staleCutoff),
      isNull(carts.reminderSentAt),
      eq(users.emailOptIn, true),
      isNotNull(users.email),
    ));
}

export async function markCartReminderSent(cartId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(carts).set({ reminderSentAt: new Date() }).where(eq(carts.id, cartId));
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase H/I): the one
 * write path for store credit -- an admin issuing/adjusting it (Phase H,
 * `actorUserId` set) and a checkout consuming it (Phase I, `actorUserId`
 * null, `orderId` set) both call this, so the ledger row and the cached
 * `users.storeCreditMnt` balance can never drift apart. `deltaMnt` is
 * signed: positive to add, negative to spend. The atomic `gte` guard below
 * is the same WHERE-guard + affectedRows race-proof idiom this file already
 * uses for stock decrements -- `storeCreditMnt >= -deltaMnt` is exactly
 * `storeCreditMnt + deltaMnt >= 0` rearranged, so a negative delta can never
 * push the balance below zero even under concurrent spends, and a positive
 * delta's guard is trivially always true (a balance is never negative to
 * begin with).
 */
export async function adjustStoreCredit(input: { userId: number; deltaMnt: number; reason: string; actorUserId: number | null; orderId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (input.deltaMnt === 0) throw new Error("Adjustment amount must not be zero.");
  return db.transaction(async tx => {
    const update = await tx.update(users)
      .set({ storeCreditMnt: sql`${users.storeCreditMnt} + ${input.deltaMnt}`, updatedAt: new Date() })
      .where(and(eq(users.id, input.userId), gte(users.storeCreditMnt, -input.deltaMnt)));
    if (Number(update[0].affectedRows ?? 0) !== 1) {
      throw new Error("Insufficient store credit balance for this adjustment.");
    }
    await tx.insert(storeCreditLedger).values({
      userId: input.userId, deltaMnt: input.deltaMnt, reason: input.reason,
      actorUserId: input.actorUserId, orderId: input.orderId ?? null,
    });
    const [updatedUser] = await tx.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, input.userId)).limit(1);
    return { userId: input.userId, storeCreditMnt: updatedUser?.storeCreditMnt ?? 0 };
  });
}

/** Checkout's own "apply my store credit" toggle -- the customer-facing
 *  read, distinct from getAdminUserDetail's admin-facing one above. */
export async function getUserStoreCreditBalance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.storeCreditMnt ?? 0;
}

export async function getStoreCreditLedger(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: storeCreditLedger.id, deltaMnt: storeCreditLedger.deltaMnt, reason: storeCreditLedger.reason,
    actorUserId: storeCreditLedger.actorUserId, actorEmail: users.email, orderId: storeCreditLedger.orderId,
    createdAt: storeCreditLedger.createdAt,
  }).from(storeCreditLedger)
    .leftJoin(users, eq(users.id, storeCreditLedger.actorUserId))
    .where(eq(storeCreditLedger.userId, userId))
    .orderBy(desc(storeCreditLedger.createdAt));
}

/** Tier F: CAC's one input. Same upsert-by-unique-key shape as
 *  upsertSiteMedia above. */
export async function getMarketingSpendRows(monthKeys: string[]) {
  const db = await getDb();
  if (!db || monthKeys.length === 0) return [];
  return db.select({ monthKey: marketingSpend.monthKey, spendMnt: marketingSpend.spendMnt }).from(marketingSpend).where(inArray(marketingSpend.monthKey, monthKeys));
}

export async function upsertMarketingSpend(input: { monthKey: string; spendMnt: number; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(marketingSpend).values({
    monthKey: input.monthKey,
    spendMnt: input.spendMnt,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { spendMnt: input.spendMnt, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(marketingSpend).where(eq(marketingSpend.monthKey, input.monthKey)).limit(1);
  return updated[0];
}

// Tier E: the industry-standard GA/Shopify-style "session" boundary -- a
// gap this long since the last pageview starts a new session, even if the
// cookie itself is still valid (the cookie's own lifetime is much longer;
// see the schema comment on visitorSessions and getVisitorSessionCookieOptions).
const VISITOR_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Resolves (or creates) the visitor_sessions row for one pageview beacon
 * call. Bumps lastSeenAt/pageViewCount on an existing, still-live session;
 * mints a fresh token and inserts a new row otherwise (no existing token,
 * an unrecognized token, or one that's gone stale past the 30-minute
 * window). Always returns a token — the router only writes the cookie back
 * when isNewToken is true, so an existing valid session's cookie is never
 * needlessly rewritten.
 */
export async function resolvePageviewSession(input: {
  existingToken?: string;
  path: string;
  trafficSource?: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
}): Promise<{ sessionToken: string; isNewToken: boolean }> {
  const db = await getDb();
  if (!db) return { sessionToken: randomBytes(24).toString("base64url"), isNewToken: true };
  if (input.existingToken) {
    const existing = await db.select().from(visitorSessions).where(eq(visitorSessions.sessionToken, input.existingToken)).limit(1);
    if (existing[0] && existing[0].lastSeenAt.getTime() >= Date.now() - VISITOR_SESSION_TIMEOUT_MS) {
      await db.update(visitorSessions).set({ lastSeenAt: new Date(), pageViewCount: sql`${visitorSessions.pageViewCount} + 1` }).where(eq(visitorSessions.id, existing[0].id));
      return { sessionToken: input.existingToken, isNewToken: false };
    }
  }
  const sessionToken = randomBytes(24).toString("base64url");
  await db.insert(visitorSessions).values({ sessionToken, landingPath: input.path, trafficSource: input.trafficSource ?? null, deviceType: input.deviceType });
  return { sessionToken, isNewToken: true };
}

/** Looks up the visitor_sessions.id for a session cookie value read at
 *  checkout — null for a missing/unrecognized/expired token (an order can
 *  always be placed with no session link; conversion tracking just won't
 *  count it, exactly like any order placed before Tier E shipped). */
export async function getVisitorSessionIdByToken(sessionToken: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: visitorSessions.id }).from(visitorSessions).where(eq(visitorSessions.sessionToken, sessionToken)).limit(1);
  return rows[0]?.id ?? null;
}

export async function logAdminAction(input: { actorUserId: number; action: string; entityType: string; entityId?: number | null; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuditLogs).values({ actorUserId: input.actorUserId, action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null });
}

// TIER 4: admin-only Audit Log viewer — every filter is optional/additive.
// entityType/entityId (2026-09-07, Project "SUGI Desk" Phase 4) reuse this
// same query for the new per-record History panel — same shape, same
// admin-only gate, just scoped to one record instead of the global feed.
export async function getAdminAuditLogs(filters: { action?: string; actorEmail?: string; dateFrom?: Date; dateTo?: Date; entityType?: string; entityId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    filters.action ? eq(adminAuditLogs.action, filters.action) : undefined,
    filters.actorEmail ? like(users.email, `%${filters.actorEmail}%`) : undefined,
    filters.dateFrom ? gte(adminAuditLogs.createdAt, filters.dateFrom) : undefined,
    filters.dateTo ? lte(adminAuditLogs.createdAt, filters.dateTo) : undefined,
    filters.entityType ? eq(adminAuditLogs.entityType, filters.entityType) : undefined,
    filters.entityId !== undefined ? eq(adminAuditLogs.entityId, filters.entityId) : undefined,
  ].filter(condition => condition !== undefined);

  return db.select({
    id: adminAuditLogs.id,
    actorUserId: adminAuditLogs.actorUserId,
    actorEmail: users.email,
    actorName: users.name,
    action: adminAuditLogs.action,
    entityType: adminAuditLogs.entityType,
    entityId: adminAuditLogs.entityId,
    metadataJson: adminAuditLogs.metadataJson,
    createdAt: adminAuditLogs.createdAt,
  })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.actorUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(Math.min(filters.limit ?? 100, 200));
}

// Best-effort: a DB hiccup while recording history should never be the
// reason a legitimate login fails, so this swallows its own errors (same
// pattern as the email/SMS senders in _core/notification.ts).
// NOTE (2026-09-05): the `email` column/param name predates login moving to
// phone+password -- it now holds whatever identifier was actually typed
// into the login form (a phone number, going forward). Left as `email`
// rather than renamed: this is a security/rate-limit audit log, not a real
// email address field, and a column rename here is a schema migration with
// no functional upside (same call as leaving staff_invitations in place).
export async function recordLoginAttempt(input: { email: string; userId: number | null; success: boolean; reason?: string | null; ipAddress: string | null }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(loginAttempts).values({ email: input.email, userId: input.userId, success: input.success, reason: input.reason ?? null, ipAddress: input.ipAddress });
  } catch (error) {
    console.error("[Login attempt] Failed to record:", error);
  }
}

// TIER 4: admin-only Login History viewer.
// Admin overhaul (2026-09-08, Phase M): real server-side pagination.
// login_attempts is a permanent table with no retention/cleanup job -- the
// actual gap this closes isn't rows disappearing, it's the UI hard-capping
// at 200 and making everything older invisible even though it's still
// sitting right there in the table.
export async function getLoginHistory(filters: { email?: string; success?: boolean; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { rows: [], totalCount: 0 };
  const conditions = [
    filters.email ? like(loginAttempts.email, `%${filters.email}%`) : undefined,
    filters.success !== undefined ? eq(loginAttempts.success, filters.success) : undefined,
  ].filter(condition => condition !== undefined);
  const where = conditions.length ? and(...conditions) : undefined;

  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db.select().from(loginAttempts)
      .where(where)
      .orderBy(desc(loginAttempts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(loginAttempts).where(where),
  ]);
  return { rows, totalCount: Number(totalCount) };
}

export async function getAdminCategories() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      slug: productCategories.slug,
      description: productCategories.description,
      imageUrl: productCategories.imageUrl,
      sortOrder: productCategories.sortOrder,
      isActive: productCategories.isActive,
      updatedAt: productCategories.updatedAt,
    })
    .from(productCategories)
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
}

export async function categoryExists(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.id, id)).limit(1);
  return Boolean(result[0]);
}

export async function getProductWriteConflicts(input: { slug?: string; sku?: string; excludeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db.select({ id: products.id, slug: products.slug, sku: products.sku }).from(products);
  const conflicts = rows.filter(row => row.id !== input.excludeId && (row.slug === input.slug || row.sku === input.sku));
  if (conflicts.length || !input.sku) return conflicts;

  // A product's sku shares the same global-uniqueness namespace as variant
  // skus (real barcodes are physically unique) — see variantSkuExists, which
  // enforces the same thing from the variant-write side. Only this product's
  // OWN variant is allowed to already carry this sku (that's just
  // syncSoleVariantFromProduct mirroring it back), so exclude that one.
  const variantConflict = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.sku, input.sku)).limit(1);
  if (variantConflict[0] && variantConflict[0].productId !== input.excludeId) {
    return [{ id: variantConflict[0].productId, slug: "", sku: input.sku }];
  }
  return conflicts;
}

export async function getCategoryWriteConflicts(input: { slug?: string; excludeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db.select({ id: productCategories.id, slug: productCategories.slug }).from(productCategories);
  return rows.filter(row => row.id !== input.excludeId && row.slug === input.slug);
}

export type ProductWriteInput = {
  categoryId: number;
  name: string;
  slug: string;
  brand?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  costMnt?: number | null;
  sku: string;
  imageUrl?: string | null;
  galleryJson?: string | null;
  stockQuantity: number;
  isPublished: boolean;
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns?: string | null;
  interiorStyle?: string | null;
  hairType?: "dry" | "oily" | "normal" | "damaged" | "color_treated" | null;
  hairConcerns?: string | null;
  fragrancePreference?: "unscented" | "light" | "floral" | "citrus" | null;
  wellnessInterests?: string | null;
};

// Admin overhaul (2026-09-08, Phase H): bulk CSV import's create-vs-update
// decision per row -- a bare id/sku lookup, not the full getAdminProducts()
// list, since a 500-row import shouldn't fetch and scan the whole 900+ row
// catalog per row.
export async function findProductBySku(sku: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
  return result[0] ?? null;
}

export async function createAdminProduct(input: ProductWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // PHASE 2 of product variants: every product needs at least one variant
  // for cart/checkout to resolve a default against (see addCartItem) — a
  // brand-new product gets its own matching "default" variant in the same
  // transaction, exactly mirroring what the 0030 migration backfilled for
  // every pre-existing product.
  const created = await db.transaction(async tx => {
    await tx.insert(products).values({
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      brand: input.brand ?? null,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      priceMnt: input.priceMnt,
      compareAtPriceMnt: input.compareAtPriceMnt ?? null,
      costMnt: input.costMnt ?? null,
      sku: input.sku,
      imageUrl: input.imageUrl ?? null,
      galleryJson: input.galleryJson ?? null,
      stockQuantity: input.stockQuantity,
      isPublished: input.isPublished,
      skinType: input.skinType ?? null,
      skinConcerns: input.skinConcerns ?? null,
      interiorStyle: input.interiorStyle ?? null,
      hairType: input.hairType ?? null,
      hairConcerns: input.hairConcerns ?? null,
      fragrancePreference: input.fragrancePreference ?? null,
      wellnessInterests: input.wellnessInterests ?? null,
    });
    const row = await tx.select().from(products).where(eq(products.slug, input.slug)).limit(1);
    if (row[0]) {
      const insertedVariant = await tx.insert(productVariants).values({
        productId: row[0].id,
        sku: input.sku,
        priceMnt: input.priceMnt,
        compareAtPriceMnt: input.compareAtPriceMnt ?? null,
        // Placeholder -- recomputed immediately below from branch_stock
        // (Phase K/L: seedBranchStockForNewVariant enrolls it there instead
        // of writing this field directly, same as createAdminProductVariant).
        stockQuantity: 0,
        imageUrl: input.imageUrl ?? null,
        isDefault: true,
      });
      await seedBranchStockForNewVariant(tx, Number(insertedVariant[0].insertId), input.stockQuantity);
    }
    return row;
  });
  return created[0];
}

/** Cheap "what was the stock before this write" lookup — used by
 *  admin.updateProduct (server/routers.ts) to detect a 0 -> >0 restock and
 *  fire wishlist back-in-stock notifications. */
export async function getProductStockQuantity(id: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const found = await db.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, id)).limit(1);
  return found[0]?.stockQuantity ?? null;
}

/**
 * PHASE 2 of product variants: keeps the common single-variant case in sync
 * so admin.updateProduct's existing price/stock/sku fields stay the one
 * place to edit a simple product — the moment a product actually has more
 * than one variant, this deliberately does nothing (ambiguous which variant
 * a product-level edit should apply to; the admin manages variants directly
 * at that point via updateAdminProductVariant).
 */
/**
 * "Controls everything" admin overhaul (2026-09-08, Phase K/L): the one
 * write path for "set this variant's stock at the fulfillment-default
 * branch to exactly N" -- what every pre-existing single-number stock
 * field (the product form, the variant composer) now means, sugar over the
 * real per-branch table rather than a competing direct write. Upserts the
 * branch_stock row (a variant may not have one yet -- e.g. created before
 * this branch existed) then recomputes the cached total/product mirror.
 * Falls back to writing the variant's aggregate directly only when NO
 * branch is marked isFulfillmentDefault at all (broken config -- there's
 * nowhere real to attribute the number to), matching pre-Phase-K behavior
 * for that edge case.
 */
async function setFulfillmentBranchStock(db: DbOrTx, variantId: number, quantity: number) {
  const [fulfillmentBranch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.isFulfillmentDefault, true)).limit(1);
  if (!fulfillmentBranch) {
    await db.update(productVariants).set({ stockQuantity: quantity, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
    return;
  }
  const updated = await db.update(branchStock).set({ stockQuantity: quantity, updatedAt: new Date() }).where(and(eq(branchStock.branchId, fulfillmentBranch.id), eq(branchStock.variantId, variantId)));
  if (Number(updated[0].affectedRows ?? 0) === 0) {
    await db.insert(branchStock).values({ branchId: fulfillmentBranch.id, variantId, stockQuantity: quantity });
  }
  await recomputeVariantStockTotal(db, variantId);
}

async function syncSoleVariantFromProduct(productId: number, changes: { priceMnt?: number; compareAtPriceMnt?: number | null; sku?: string; stockQuantity?: number; imageUrl?: string | null }) {
  const db = await getDb();
  if (!db) return;
  const patch: Record<string, unknown> = {};
  if (changes.priceMnt !== undefined) patch.priceMnt = changes.priceMnt;
  if (changes.compareAtPriceMnt !== undefined) patch.compareAtPriceMnt = changes.compareAtPriceMnt;
  if (changes.sku !== undefined) patch.sku = changes.sku;
  if (changes.imageUrl !== undefined) patch.imageUrl = changes.imageUrl;
  // stockQuantity is handled separately below (Phase K: routes through
  // branch_stock via setFulfillmentBranchStock, not a direct field write).

  const variants = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
  if (variants.length !== 1) return;
  const soleVariantId = variants[0].id;

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(productVariants).set(patch).where(eq(productVariants.id, soleVariantId));
  }
  if (changes.stockQuantity !== undefined) await setFulfillmentBranchStock(db, soleVariantId, changes.stockQuantity);
}

export async function updateAdminProduct(input: { id: number } & Partial<ProductWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const changes: Partial<InsertProduct> = { updatedAt: new Date() };
  if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
  if (input.name !== undefined) changes.name = input.name;
  if (input.slug !== undefined) changes.slug = input.slug;
  if (input.brand !== undefined) changes.brand = input.brand;
  if (input.shortDescription !== undefined) changes.shortDescription = input.shortDescription;
  if (input.description !== undefined) changes.description = input.description;
  if (input.priceMnt !== undefined) changes.priceMnt = input.priceMnt;
  if (input.compareAtPriceMnt !== undefined) changes.compareAtPriceMnt = input.compareAtPriceMnt;
  if (input.costMnt !== undefined) changes.costMnt = input.costMnt;
  if (input.sku !== undefined) changes.sku = input.sku;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.galleryJson !== undefined) changes.galleryJson = input.galleryJson;
  if (input.stockQuantity !== undefined) changes.stockQuantity = input.stockQuantity;
  if (input.isPublished !== undefined) changes.isPublished = input.isPublished;
  if (input.skinType !== undefined) changes.skinType = input.skinType;
  if (input.skinConcerns !== undefined) changes.skinConcerns = input.skinConcerns;
  if (input.interiorStyle !== undefined) changes.interiorStyle = input.interiorStyle;
  if (input.hairType !== undefined) changes.hairType = input.hairType;
  if (input.hairConcerns !== undefined) changes.hairConcerns = input.hairConcerns;
  if (input.fragrancePreference !== undefined) changes.fragrancePreference = input.fragrancePreference;
  if (input.wellnessInterests !== undefined) changes.wellnessInterests = input.wellnessInterests;

  await db.update(products).set(changes).where(eq(products.id, input.id));
  await syncSoleVariantFromProduct(input.id, input);
  const updated = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
  return updated[0];
}

export async function deleteAdminProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.delete(products).where(eq(products.id, id));
  return { id };
}

export type CategoryWriteInput = {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function createAdminCategory(input: CategoryWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.insert(productCategories).values({
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });

  const created = await db.select().from(productCategories).where(eq(productCategories.slug, input.slug)).limit(1);
  return created[0];
}

export async function updateAdminCategory(input: { id: number } & Partial<CategoryWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const changes: Partial<InsertProductCategory> = { updatedAt: new Date() };
  if (input.name !== undefined) changes.name = input.name;
  if (input.slug !== undefined) changes.slug = input.slug;
  if (input.description !== undefined) changes.description = input.description;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  await db.update(productCategories).set(changes).where(eq(productCategories.id, input.id));
  const updated = await db.select().from(productCategories).where(eq(productCategories.id, input.id)).limit(1);
  return updated[0];
}

export async function getAdminUsers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
}

// Admin overhaul (2026-09-08, Phase J): the campaign composer always sends
// to an explicit, already-resolved userIds[] (never a server-side "resolve
// this filter at send time") -- this is the one place that list gets turned
// back into real contact info + opt-in flags, right before actually
// sending, so what was previewed is exactly who gets messaged.
export async function getUsersForCampaignSend(userIds: number[]) {
  const db = await getDb();
  if (!db || userIds.length === 0) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, emailOptIn: users.emailOptIn, smsOptIn: users.smsOptIn }).from(users).where(inArray(users.id, userIds));
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
    }).from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)),
    db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), eq(orders.paymentStatus, "paid"))),
  ]);

  const onlineSpendMnt = Number(spendRow?.total ?? 0);
  const totalSpendMnt = onlineSpendMnt + user.loyaltyManualAdjustmentMnt;
  return {
    ...user,
    orders: userOrders,
    totalSpentMnt: onlineSpendMnt, // kept for the existing admin panel display
    loyalty: { onlineSpendMnt, totalSpendMnt, manualAdjustmentMnt: user.loyaltyManualAdjustmentMnt, currentTier: getLoyaltyTier(totalSpendMnt), nextTier: getNextLoyaltyTier(totalSpendMnt) },
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
  const [spendRow] = await db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), eq(orders.paymentStatus, "paid")));
  const onlineSpendMnt = Number(spendRow?.total ?? 0);
  const totalSpendMnt = onlineSpendMnt + user.loyaltyManualAdjustmentMnt;
  const nextTier = getNextLoyaltyTier(totalSpendMnt);
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
  const [savingsRow] = await db.select({ total: sql<number>`coalesce(sum(${orders.loyaltyDiscountMnt}), 0)` }).from(orders).where(and(eq(orders.userId, userId), eq(orders.paymentStatus, "paid")));
  const totalLoyaltySavingsMnt = Number(savingsRow?.total ?? 0);
  return {
    cardNumber: user.phone,
    onlineSpendMnt,
    manualAdjustmentMnt: user.loyaltyManualAdjustmentMnt,
    totalSpendMnt,
    totalLoyaltySavingsMnt,
    currentTier: getLoyaltyTier(totalSpendMnt),
    nextTier,
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
export async function validateDiscountCode(rawCode: string, amountMnt: number) {
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
  const discountMnt = record.type === "percent"
    ? Math.round(amountMnt * (record.percentValue ?? 0) / 100)
    : Math.min(record.fixedAmountMnt ?? 0, amountMnt);
  if (discountMnt <= 0) throw new Error("Энэ код одоогийн сагсанд хямдрал өгөхгүй байна.");
  return { id: record.id, code: record.code, discountMnt };
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
  const existing = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  if (!existing[0]) throw new Error("Discount code not found.");
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

export async function suspendUser(input: { userId: number; reason?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!current[0]) throw new Error("User not found.");
  await db.update(users).set({ suspendedAt: new Date(), suspendedReason: input.reason?.trim() || null, updatedAt: new Date() }).where(eq(users.id, input.userId));
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
  return { ...user[0], phone: input.phone };
}

/**
 * Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
 * card/eBuuhia courier — see integrationConfigs in drizzle/schema.ts).
 * QPay is deliberately not part of this: it already works end-to-end from
 * process.env (server/qpay.ts) and isn't retrofitted here.
 */
const INTEGRATION_PROVIDERS = ["ebarimt", "storepay", "card_golomt", "courier_ebuuhia"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/** Never returns decrypted credential values to the caller — only which
 *  keys are set (`configuredKeys`), so the admin UI can show "3 талбар
 *  тохируулагдсан" without ever re-exposing a saved secret. Credential
 *  edits are write-only, the same principle as a password field. */
export async function getAdminIntegrations() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(integrationConfigs);
  const byProvider = new Map(rows.map(row => [row.provider, row]));
  return INTEGRATION_PROVIDERS.map(provider => {
    const row = byProvider.get(provider);
    let configuredKeys: string[] = [];
    if (row?.encryptedConfig) {
      try { configuredKeys = Object.keys(decryptJson(row.encryptedConfig)); } catch { configuredKeys = ["(тайлж чадсангүй)"]; }
    }
    return {
      provider,
      isActive: row?.isActive ?? false,
      hasCredentials: Boolean(row?.encryptedConfig),
      configuredKeys,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function updateAdminIntegration(input: { provider: IntegrationProvider; isActive?: boolean; config?: Record<string, string> }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: integrationConfigs.id }).from(integrationConfigs).where(eq(integrationConfigs.provider, input.provider)).limit(1);
  // Empty object from the client means "no new credentials typed this time"
  // — leave whatever's already encrypted-and-stored untouched rather than
  // wiping it, so toggling isActive alone never accidentally erases saved keys.
  const encryptedConfig = input.config && Object.keys(input.config).length > 0 ? encryptJson(input.config) : undefined;
  if (existing[0]) {
    const patch: { isActive?: boolean; encryptedConfig?: string; updatedByUserId: number; updatedAt: Date } = { updatedByUserId, updatedAt: new Date() };
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (encryptedConfig !== undefined) patch.encryptedConfig = encryptedConfig;
    await db.update(integrationConfigs).set(patch).where(eq(integrationConfigs.id, existing[0].id));
  } else {
    await db.insert(integrationConfigs).values({ provider: input.provider, isActive: input.isActive ?? false, encryptedConfig: encryptedConfig ?? null, updatedByUserId });
  }
  const [result] = await getAdminIntegrations().then(rows => rows.filter(row => row.provider === input.provider));
  return result;
}

/**
 * Product variants (see the long comment on productVariants in
 * drizzle/schema.ts). PHASE 2: cart/checkout/orders now read this table —
 * see addCartItem/createOrderFromActiveCart below.
 */
export async function getAdminProductVariants(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(desc(productVariants.isDefault), asc(productVariants.id));
}

/**
 * Public (storefront) read of a published product's variants, for the
 * ProductDetail/QuickView variant picker. Nothing sensitive here — price and
 * stock are already public via catalog.list/bySlug, this just exposes the
 * same numbers per-option instead of only for the default one. Returns []
 * for an unpublished/unknown product rather than throwing, since the caller
 * (catalog.variants) is a publicProcedure and a picker with no options is a
 * normal, silent no-op on the client (the product simply has one option).
 */
export async function getPublicProductVariants(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const product = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.isPublished, true))).limit(1);
  if (!product[0]) return [];
  return db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      attributesJson: productVariants.attributesJson,
      priceMnt: productVariants.priceMnt,
      compareAtPriceMnt: productVariants.compareAtPriceMnt,
      stockQuantity: productVariants.stockQuantity,
      imageUrl: productVariants.imageUrl,
      isDefault: productVariants.isDefault,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(desc(productVariants.isDefault), asc(productVariants.id));
}

/** A variant SKU must be globally unique across the whole catalog (real
 *  barcodes are physically unique) — checked against both this table and
 *  products.sku, not just sibling variants. */
export async function variantSkuExists(sku: string, excludeVariantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const productConflict = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
  if (productConflict[0]) return true;
  const variantConflict = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
  return Boolean(variantConflict[0] && variantConflict[0].id !== excludeVariantId);
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase L): the admin
 * per-branch stock editor's data source -- one row per ACTIVE branch (a
 * deactivated branch's shelf isn't sellable, so it's not shown here either),
 * LEFT JOINed so a branch that never got a branch_stock row for this
 * variant (e.g. a branch created after this variant already existed) shows
 * as 0 rather than being silently missing from the list.
 */
export async function getBranchStockForVariant(variantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    branchId: branches.id,
    branchName: branches.name,
    isFulfillmentDefault: branches.isFulfillmentDefault,
    stockQuantity: sql<number>`COALESCE(${branchStock.stockQuantity}, 0)`,
  }).from(branches)
    .leftJoin(branchStock, and(eq(branchStock.branchId, branches.id), eq(branchStock.variantId, variantId)))
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.sortOrder));
}

/** Sets one specific branch's stock for one specific variant to an exact
 *  number (not a delta) -- the admin per-branch editor's one write
 *  operation, distinct from setFulfillmentBranchStock (which always targets
 *  whichever branch is the fulfillment default) since this lets an admin
 *  edit ANY branch, not just the default one. */
export async function setBranchStock(branchId: number, variantId: number, quantity: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (quantity < 0) throw new Error("Stock quantity cannot be negative.");
  await db.transaction(async tx => {
    const updated = await tx.update(branchStock).set({ stockQuantity: quantity, updatedAt: new Date() }).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId)));
    if (Number(updated[0].affectedRows ?? 0) === 0) {
      await tx.insert(branchStock).values({ branchId, variantId, stockQuantity: quantity });
    }
    await recomputeVariantStockTotal(tx, variantId);
  });
  return getBranchStockForVariant(variantId);
}

export type ProductVariantWriteInput = {
  productId: number;
  sku: string;
  attributes?: Record<string, string> | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  stockQuantity: number;
  imageUrl?: string | null;
  isDefault?: boolean;
};

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase K/L): the one
 * place a BRAND-NEW variant gets enrolled into per-branch stock -- called
 * by every path that can create one (createAdminProduct's default variant,
 * createAdminProductVariant's additional ones). Same honest starting split
 * scripts/backfill-branch-stock.ts uses for every pre-existing variant: all
 * of the typed stock at the fulfillment-default branch, 0 everywhere else
 * (no real per-branch data exists for a brand-new variant either). Falls
 * back to writing the aggregate directly only if no active branches exist
 * at all (broken config) -- there's nowhere real to seed rows into.
 */
async function seedBranchStockForNewVariant(tx: OrderTx, variantId: number, initialStockQuantity: number) {
  const activeBranches = await tx.select().from(branches).where(eq(branches.isActive, true));
  if (!activeBranches.length) {
    await tx.update(productVariants).set({ stockQuantity: initialStockQuantity }).where(eq(productVariants.id, variantId));
    return;
  }
  const fulfillmentBranchId = activeBranches.find(b => b.isFulfillmentDefault)?.id;
  await tx.insert(branchStock).values(activeBranches.map(branch => ({
    branchId: branch.id, variantId,
    stockQuantity: branch.id === fulfillmentBranchId ? initialStockQuantity : 0,
  })));
  await recomputeVariantStockTotal(tx, variantId);
}

export async function createAdminProductVariant(input: ProductVariantWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    if (input.isDefault) await tx.update(productVariants).set({ isDefault: false }).where(eq(productVariants.productId, input.productId));
    const inserted = await tx.insert(productVariants).values({
      productId: input.productId,
      sku: input.sku,
      attributesJson: input.attributes ? JSON.stringify(input.attributes) : null,
      priceMnt: input.priceMnt,
      compareAtPriceMnt: input.compareAtPriceMnt ?? null,
      // Placeholder -- recomputed immediately below from branch_stock, the
      // real source of truth now (Phase K).
      stockQuantity: 0,
      imageUrl: input.imageUrl ?? null,
      isDefault: input.isDefault ?? false,
    });
    await seedBranchStockForNewVariant(tx, Number(inserted[0].insertId), input.stockQuantity);
  });
  return getAdminProductVariants(input.productId);
}

export async function updateAdminProductVariant(input: { id: number } & Partial<ProductVariantWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(productVariants).where(eq(productVariants.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Variant not found.");
  const productId = input.productId ?? existing[0].productId;
  await db.transaction(async tx => {
    if (input.isDefault) await tx.update(productVariants).set({ isDefault: false }).where(and(eq(productVariants.productId, productId), sql`${productVariants.id} != ${input.id}`));
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.sku !== undefined) patch.sku = input.sku;
    if (input.attributes !== undefined) patch.attributesJson = input.attributes ? JSON.stringify(input.attributes) : null;
    if (input.priceMnt !== undefined) patch.priceMnt = input.priceMnt;
    if (input.compareAtPriceMnt !== undefined) patch.compareAtPriceMnt = input.compareAtPriceMnt;
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    // stockQuantity is handled separately below (Phase K: routes through
    // branch_stock via setFulfillmentBranchStock, not a direct field write).
    if (Object.keys(patch).length > 1) await tx.update(productVariants).set(patch).where(eq(productVariants.id, input.id));
    if (input.stockQuantity !== undefined) await setFulfillmentBranchStock(tx, input.id, input.stockQuantity);
  });
  return getAdminProductVariants(productId);
}

// ---------------------------------------------------------------------------
// Admin face gate (2026-09-08). See server/faceAuth.ts for the flow and
// drizzle/schema.ts for what is and is not stored (a 128-number descriptor,
// never a photograph).
// ---------------------------------------------------------------------------

export async function getFaceEnrollment(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, userId)).limit(1);
  return rows[0];
}

/** Upsert rather than insert: re-enrolling (new glasses, a beard, a better
 *  camera) must replace the reference vector in place, not accumulate stale
 *  rows that could later be compared against. */
export async function upsertFaceEnrollment(input: {
  userId: number;
  descriptor: number[];
  sampleCount: number;
  modelVersion: string;
  /** Per-pose descriptors from the guided enrollment (centre/left/right).
   *  Optional so older callers and older enrollments keep working. */
  poses?: { pose: string; descriptor: number[] }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const descriptorJson = JSON.stringify(input.descriptor);
  const posesJson = input.poses?.length ? JSON.stringify(input.poses) : null;
  const existing = await getFaceEnrollment(input.userId);
  if (existing) {
    await db.update(faceEnrollments)
      .set({ descriptorJson, posesJson, sampleCount: input.sampleCount, modelVersion: input.modelVersion })
      .where(eq(faceEnrollments.userId, input.userId));
    return;
  }
  await db.insert(faceEnrollments).values({
    userId: input.userId,
    descriptorJson,
    posesJson,
    sampleCount: input.sampleCount,
    modelVersion: input.modelVersion,
    consentedAt: new Date(),
  });
}

/** Break-glass: clears one person's enrolled face so they re-enroll on their
 *  next /admin visit. The per-user counterpart to the ADMIN_FACE_GATE_ENABLED
 *  kill switch, for when one camera/face is the problem rather than the whole
 *  feature. */
export async function deleteFaceEnrollment(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(faceEnrollments).where(eq(faceEnrollments.userId, userId));
  await db.update(users).set({ faceVerifiedAt: null }).where(eq(users.id, userId));
}

export async function createFaceChallenge(input: { userId: number; action: "blink" | "turn_left" | "turn_right" | "open_mouth"; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(faceChallenges).values({ userId: input.userId, action: input.action, expiresAt: input.expiresAt });
  return Number(inserted[0].insertId);
}

/**
 * Claims a challenge for single use and returns it, or undefined if it was
 * already used / expired / belongs to someone else.
 *
 * Uses the same atomic WHERE-guard + affectedRows idiom as
 * resetPasswordViaPhoneSession above (audit finding BUG-003, 2026-09-06):
 * reading `consumedAt` and then writing it would let two concurrent
 * submissions both pass the read before either wrote.
 */
export async function consumeFaceChallenge(input: { id: number; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(faceChallenges).where(eq(faceChallenges.id, input.id)).limit(1);
  const challenge = rows[0];
  if (!challenge) return undefined;
  if (challenge.userId !== input.userId) return undefined;
  if (challenge.expiresAt.getTime() <= Date.now()) return undefined;

  const claimed = await db.update(faceChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(faceChallenges.id, challenge.id), isNull(faceChallenges.consumedAt)));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) return undefined;
  return challenge;
}

export async function recordFaceAttempt(input: {
  userId: number | null;
  outcome: "enrolled" | "verified" | "no_match" | "liveness_failed" | "error";
  distance?: number | null;
  detail?: string | null;
  ip?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  // Never let audit-logging failure break the flow it is observing -- a full
  // disk or a locked table should not lock staff out of /admin.
  try {
    await db.insert(faceAttempts).values({
      userId: input.userId,
      outcome: input.outcome,
      distance: input.distance ?? null,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
    });
  } catch {
    // Intentionally swallowed; see comment above.
  }
}

export async function touchFaceVerified(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ faceVerifiedAt: new Date() }).where(eq(users.id, userId));
}

/** Powers the Security Center's face-gate tab. Joined to users so the table
 *  can show who each attempt belonged to, mirroring the login-history tab. */
export async function getFaceAttempts(input: { limit?: number; userId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db
    .select({
      id: faceAttempts.id,
      userId: faceAttempts.userId,
      outcome: faceAttempts.outcome,
      distance: faceAttempts.distance,
      detail: faceAttempts.detail,
      ip: faceAttempts.ip,
      createdAt: faceAttempts.createdAt,
      userName: users.name,
      userPhone: users.phone,
      userRole: users.role,
    })
    .from(faceAttempts)
    .leftJoin(users, eq(faceAttempts.userId, users.id))
    .where(input.userId ? eq(faceAttempts.userId, input.userId) : undefined)
    .orderBy(desc(faceAttempts.createdAt))
    .limit(limit);
  return rows;
}

/** Refuses to delete a product's last remaining variant — every product
 *  must keep at least one (Phase 2 will need a default to fall back to). */
export async function deleteAdminProductVariant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
  if (!existing[0]) throw new Error("Variant not found.");
  const siblings = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, existing[0].productId));
  if (siblings.length <= 1) throw new Error("Барааны сүүлийн variant-ыг устгах боломжгүй — бараа наад зах нь нэг variant-тай байх ёстой.");
  await db.delete(productVariants).where(eq(productVariants.id, id));
  if (existing[0].isDefault) {
    const [nextDefault] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, existing[0].productId)).orderBy(asc(productVariants.id)).limit(1);
    if (nextDefault) await db.update(productVariants).set({ isDefault: true }).where(eq(productVariants.id, nextDefault.id));
  }
  return { id };
}
