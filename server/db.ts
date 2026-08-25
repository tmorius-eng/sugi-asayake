import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { adminAuditLogs, cartItems, carts, emailVerificationTokens, InsertProduct, InsertProductCategory, InsertUser, loginAttempts, orderItems, orders, passwordResetTokens, paymentAttempts, posts, productCategories, productReviews, products, routines, routineSteps, siteMedia, staffInvitations, userAddresses, users, wishlistItems } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getInventoryReservationFailure, shouldRestoreStock } from "./commerce-lifecycle";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

export async function createUserWithPassword(input: { email: string; passwordHash: string; name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const email = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("An account with this email already exists.");

  // The very first account on a fresh deployment, or an email that matches
  // OWNER_EMAIL, is granted admin automatically — this replaces the old
  // "openId === ENV.ownerOpenId" bootstrap rule.
  const [{ userCount }] = await db.select({ userCount: sql<number>`count(*)` }).from(users);
  const isFirstUser = Number(userCount) === 0;
  const isOwnerEmail = Boolean(ENV.ownerEmail) && email === ENV.ownerEmail;
  const role: "user" | "admin" = isFirstUser || isOwnerEmail ? "admin" : "user";

  const inserted = await db.insert(users).values({
    email,
    passwordHash: input.passwordHash,
    name: input.name ?? null,
    role,
    lastSignedIn: new Date(),
  });
  const created = await getUserById(Number(inserted[0].insertId));
  if (!created) throw new Error("Unable to create the account.");
  return created;
}

// Re-submitting the register form with an email that already has an
// unconfirmed (emailVerifiedAt is null) account refreshes that account's
// credentials instead of hard-failing on the email uniqueness constraint —
// see auth.register in server/routers.ts for the caller-side guard that
// makes sure this never touches an already-verified account.
export async function updatePendingRegistration(input: { userId: number; passwordHash: string; name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash: input.passwordHash, ...(input.name !== undefined ? { name: input.name } : {}), updatedAt: new Date() }).where(eq(users.id, input.userId));
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

export async function createUserAddress(userId: number, input: { label: string; recipientName: string; phone: string; addressLine: string; isDefault?: boolean }) {
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
    isDefault: makeDefault,
  });
  const created = await db.select().from(userAddresses).where(eq(userAddresses.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateUserAddress(userId: number, addressId: number, input: { label?: string; recipientName?: string; phone?: string; addressLine?: string; isDefault?: boolean }) {
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
export async function updateUserPreferences(userId: number, input: { skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | null; skinConcerns?: string | null; interiorStyle?: string | null }) {
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

// --- Password reset (TIER 0: this was entirely missing before — a user who
// forgot their password had no way back into their account) ---------------

// Failed-code guesses allowed against a single OTP row before it's burned
// (usedAt set) regardless of remaining time-to-expiry — a second line of
// defense against brute force beyond the IP-based rate limit on the
// procedures that call these, since a 6-digit code only has 1e6 possibilities.
const MAX_CODE_ATTEMPTS = 5;

export async function createPasswordResetCode(input: { userId: number; codeHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // Requesting a new code invalidates any still-pending one for the same
  // user, so only the most recently issued code can ever be used.
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, input.userId), sql`${passwordResetTokens.usedAt} is null`));
  await db.insert(passwordResetTokens).values({ userId: input.userId, tokenHash: input.codeHash, expiresAt: input.expiresAt });
}

export async function resetPasswordWithCode(input: { userId: number; codeHash: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const found = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.userId, input.userId), sql`${passwordResetTokens.usedAt} is null`)).orderBy(desc(passwordResetTokens.createdAt)).limit(1);
  const token = found[0];
  if (!token) throw new Error("Идэвхтэй код олдсонгүй. Дахин нууц үг сэргээх хүсэлт илгээнэ үү.");
  if (token.expiresAt.getTime() <= Date.now()) throw new Error("Кодны хугацаа дууссан байна. Дахин нууц үг сэргээх хүсэлт илгээнэ үү.");
  if (token.tokenHash !== input.codeHash) {
    const attempts = token.attempts + 1;
    const exhausted = attempts >= MAX_CODE_ATTEMPTS;
    await db.update(passwordResetTokens).set({ attempts, ...(exhausted ? { usedAt: new Date() } : {}) }).where(eq(passwordResetTokens.id, token.id));
    throw new Error(exhausted ? "Оролдлогын хязгаарт хүрлээ. Дахин нууц үг сэргээх хүсэлт илгээнэ үү." : `Код буруу байна. ${MAX_CODE_ATTEMPTS - attempts} оролдлого үлдлээ.`);
  }

  // Bumping sessionVersion in the same update invalidates every session
  // token issued before the reset — if the account was ever compromised, the
  // attacker's existing cookie stops working the moment the password changes.
  await db.update(users).set({ passwordHash: input.passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, token.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, token.id));
  return { userId: token.userId };
}

// --- Email verification (TIER 0: optional, but good practice) -------------

export async function createEmailVerificationCode(input: { userId: number; codeHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, input.userId), sql`${emailVerificationTokens.usedAt} is null`));
  await db.insert(emailVerificationTokens).values({ userId: input.userId, tokenHash: input.codeHash, expiresAt: input.expiresAt });
}

export async function verifyEmailWithCode(input: { userId: number; codeHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const found = await db.select().from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId, input.userId), sql`${emailVerificationTokens.usedAt} is null`)).orderBy(desc(emailVerificationTokens.createdAt)).limit(1);
  const token = found[0];
  if (!token) throw new Error("Идэвхтэй код олдсонгүй. Шинэ код илгээнэ үү.");
  if (token.expiresAt.getTime() <= Date.now()) throw new Error("Кодны хугацаа дууссан байна. Шинэ код илгээнэ үү.");
  if (token.tokenHash !== input.codeHash) {
    const attempts = token.attempts + 1;
    const exhausted = attempts >= MAX_CODE_ATTEMPTS;
    await db.update(emailVerificationTokens).set({ attempts, ...(exhausted ? { usedAt: new Date() } : {}) }).where(eq(emailVerificationTokens.id, token.id));
    throw new Error(exhausted ? "Оролдлогын хязгаарт хүрлээ. Шинэ код илгээнэ үү." : `Код буруу байна. ${MAX_CODE_ATTEMPTS - attempts} оролдлого үлдлээ.`);
  }

  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, token.userId));
  await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, token.id));
  return { userId: token.userId };
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

export async function getPublishedCatalog() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      priceMnt: products.priceMnt,
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
    .where(eq(products.isPublished, true))
    .groupBy(products.id, productCategories.id)
    .orderBy(asc(productCategories.sortOrder), desc(products.createdAt));
}

// PREMIUM-FEATURES.md TIER 1: "recommended for you", scored by how many of
// the shopper's saved Beauty & Home preferences (server/routers.ts
// profile.updatePreferences) a product's own tags match. Matching happens
// in JS rather than SQL — the catalog is small enough that this is simpler
// and more obviously correct than a fragile FIND_IN_SET/LIKE query over the
// free-form skinConcerns string. Returns [] (not an error) for a shopper who
// hasn't set any preferences yet — there's nothing to match against.
export async function getRecommendedProducts(userId: number, limit = 8) {
  const db = await getDb();
  if (!db) return [];

  const userRows = await db.select({ skinType: users.skinType, skinConcerns: users.skinConcerns, interiorStyle: users.interiorStyle }).from(users).where(eq(users.id, userId)).limit(1);
  const preferences = userRows[0];
  if (!preferences || (!preferences.skinType && !preferences.skinConcerns && !preferences.interiorStyle)) return [];

  const userConcerns = new Set((preferences.skinConcerns ?? "").split(",").map(value => value.trim()).filter(Boolean));

  const candidates = await db.select({
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
    skinType: products.skinType,
    skinConcerns: products.skinConcerns,
    interiorStyle: products.interiorStyle,
  }).from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), gte(products.stockQuantity, 1)));

  const scored = candidates
    .map(product => {
      let score = 0;
      if (preferences.skinType && product.skinType === preferences.skinType) score += 2;
      if (preferences.interiorStyle && product.interiorStyle && product.interiorStyle === preferences.interiorStyle) score += 2;
      if (product.skinConcerns) {
        const productConcerns = product.skinConcerns.split(",").map(value => value.trim()).filter(Boolean);
        score += productConcerns.filter(concern => userConcerns.has(concern)).length;
      }
      return { product, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(entry => entry.product);
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
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      name: products.name,
      slug: products.slug,
      priceMnt: products.priceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
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

export async function addCartItem(input: { owner: CartOwner; productId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const product = await db.select({ id: products.id, stockQuantity: products.stockQuantity, isPublished: products.isPublished }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]?.isPublished) throw new Error("This product is not currently available for ordering.");

  const cart = await getOrCreateActiveCart(input.owner);

  // Read-modify-write on the existing quantity used to happen outside any
  // lock: two concurrent "add to cart" calls for the same product (a double
  // click, two open tabs, guest-cart merge racing a manual add) could both
  // read the same starting quantity and clobber each other's increment. The
  // cart-row lock below serializes every addItem for this cart so that can't
  // happen, while still throwing the same "not enough stock" error as before.
  await db.transaction(async tx => {
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cart.id)).for("update");
    const existing = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, input.productId))).limit(1);
    const quantity = (existing[0]?.quantity ?? 0) + input.quantity;
    if (quantity > product[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");

    if (existing[0]) {
      await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing[0].id));
    } else {
      await tx.insert(cartItems).values({ cartId: cart.id, productId: input.productId, quantity });
    }
  });
  return getActiveCartForOwner(input.owner);
}

export async function updateCartItemQuantity(input: { owner: CartOwner; itemId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = await db
    .select({ itemId: cartItems.id, cartId: carts.id, productId: products.id, stockQuantity: products.stockQuantity })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .innerJoin(products, eq(cartItems.productId, products.id))
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
      await addCartItem({ owner: { userId }, productId: item.productId, quantity: item.quantity });
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
  pickupBranch?: string | null;
  paymentMethod: "qpay" | "bank_transfer" | "card" | "cash_on_delivery";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const cart = await getActiveCartForOwner(input.owner);
  if (!cart?.items.length) throw new Error("Your cart is empty.");
  const availabilityFailure = getInventoryReservationFailure(cart.items);
  if (availabilityFailure) throw new Error(availabilityFailure);

  const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  const deliveryFeeMnt = input.deliveryMethod === "ub_delivery" ? 5000 : 0;
  // PREMIUM-FEATURES.md TIER 4: computed from the cart's real contents right
  // now, not a client-supplied amount — see getApplicableRoutineDiscount.
  const routineDiscount = await getApplicableRoutineDiscount(cart.items);
  const discountMnt = routineDiscount?.discountMnt ?? 0;
  const orderNumber = `SA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  let orderId = 0;
  await db.transaction(async tx => {
    for (const item of cart.items) {
      const update = await tx.update(products).set({
        stockQuantity: sql`${products.stockQuantity} - ${item.quantity}`,
        updatedAt: new Date(),
      }).where(and(eq(products.id, item.productId), gte(products.stockQuantity, item.quantity)));
      if (Number(update[0].affectedRows ?? 0) !== 1) {
        throw new Error(`${item.name} is no longer available in the requested quantity. Please refresh your cart.`);
      }
    }
    const inserted = await tx.insert(orders).values({
      userId: input.owner.userId ?? null,
      orderNumber,
      paymentMethod: input.paymentMethod,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      pickupBranch: input.pickupBranch ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      subtotalMnt,
      deliveryFeeMnt,
      discountMnt,
      appliedRoutineId: routineDiscount?.routineId ?? null,
      totalMnt: subtotalMnt + deliveryFeeMnt - discountMnt,
    });
    orderId = Number(inserted[0].insertId);
    await tx.insert(orderItems).values(cart.items.map(item => ({
      orderId,
      productId: item.productId,
      productName: item.name,
      sku: item.slug,
      unitPriceMnt: item.priceMnt,
      quantity: item.quantity,
    })));
    await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, cart.id));
  });

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  // The cart's items are already in memory (loaded above, before the stock
  // decrement) — reuse them here instead of a redundant order_items query,
  // so the caller (checkout.createOrder) can build a confirmation email
  // without a second round trip.
  return { ...order[0], items: cart.items.map(item => ({ name: item.name, quantity: item.quantity, priceMnt: item.priceMnt })), routineName: routineDiscount?.routineName ?? null };
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
      imageUrl: products.imageUrl,
      galleryJson: products.galleryJson,
      stockQuantity: products.stockQuantity,
      isPublished: products.isPublished,
      updatedAt: products.updatedAt,
      categoryName: productCategories.name,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .orderBy(desc(products.updatedAt));
}

export async function getAdminOrders() {
  const db = await getDb();
  if (!db) return [];
  const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt));
  const lineItems = await db.select({ orderId: orderItems.orderId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems);
  return orderRows.map(order => ({ ...order, items: lineItems.filter(item => item.orderId === order.id) }));
}

const LOW_STOCK_THRESHOLD = 5;

export async function getAdminDashboardSummary() {
  const db = await getDb();
  if (!db) {
    return { totalOrders: 0, totalRevenueMnt: 0, activeUsers: 0, recentOrders: [], lowStockProducts: [], failedPayments: [] };
  }

  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [[orderCountRow], [revenueRow], [activeUserRow], recentOrders, lowStockProducts, failedPayments] = await Promise.all([
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
    db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      stockQuantity: products.stockQuantity,
    }).from(products).where(and(eq(products.isPublished, true), sql`${products.stockQuantity} <= ${LOW_STOCK_THRESHOLD}`)).orderBy(asc(products.stockQuantity)).limit(10),
    db.select({
      id: paymentAttempts.id,
      orderId: paymentAttempts.orderId,
      orderNumber: orders.orderNumber,
      provider: paymentAttempts.provider,
      createdAt: paymentAttempts.createdAt,
    }).from(paymentAttempts).leftJoin(orders, eq(paymentAttempts.orderId, orders.id)).where(eq(paymentAttempts.status, "failed")).orderBy(desc(paymentAttempts.createdAt)).limit(10),
  ]);

  return {
    totalOrders: Number(orderCountRow?.count ?? 0),
    totalRevenueMnt: Number(revenueRow?.total ?? 0),
    activeUsers: Number(activeUserRow?.count ?? 0),
    recentOrders,
    lowStockProducts,
    failedPayments,
  };
}

export async function adminGlobalSearch(queryText: string) {
  const db = await getDb();
  if (!db) return { products: [], orders: [], users: [] };
  const term = `%${queryText}%`;

  const [productRows, orderRows, userRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, sku: products.sku, slug: products.slug })
      .from(products)
      .where(or(like(products.name, term), like(products.sku, term)))
      .limit(5),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, customerPhone: orders.customerPhone, totalMnt: orders.totalMnt, status: orders.status })
      .from(orders)
      .where(or(like(orders.orderNumber, term), like(orders.customerName, term), like(orders.customerPhone, term)))
      .limit(5),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(or(like(users.name, term), like(users.email, term)))
      .limit(5),
  ]);

  return { products: productRows, orders: orderRows, users: userRows };
}

const orderStatusRank = { pending: 0, confirmed: 1, packed: 2, out_for_delivery: 3, completed: 4 } as const;
export type FulfilmentStatus = keyof typeof orderStatusRank | "cancelled";

export async function updateAdminOrder(input: { id: number; status?: FulfilmentStatus; deliveryTrackingRef?: string | null; adminNote?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current[0]) throw new Error("Order not found.");
  if (input.status) {
    const currentStatus = current[0].status;
    if (currentStatus === "cancelled" || currentStatus === "completed") throw new Error("This closed order cannot be changed.");
    if (input.status !== "cancelled" && orderStatusRank[input.status] < orderStatusRank[currentStatus as keyof typeof orderStatusRank]) {
      throw new Error("Order fulfilment cannot move backward.");
    }
  }
  await db.transaction(async tx => {
    if (shouldRestoreStock(current[0].status as FulfilmentStatus, input.status)) {
      const lineItems = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, input.id));
      for (const item of lineItems) {
        if (item.productId === null) continue;
        await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(eq(products.id, item.productId));
      }
    }
    await tx.update(orders).set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.deliveryTrackingRef !== undefined ? { deliveryTrackingRef: input.deliveryTrackingRef } : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      updatedAt: new Date(),
    }).where(eq(orders.id, input.id));
  });
  const updated = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  return updated[0];
}

export type PostWriteInput = { title: string; slug: string; excerpt?: string | null; content: string; coverImageUrl?: string | null; isPublished: boolean };

export async function getPublishedPosts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: posts.id, title: posts.title, slug: posts.slug, excerpt: posts.excerpt, coverImageUrl: posts.coverImageUrl, publishedAt: posts.publishedAt }).from(posts).where(eq(posts.isPublished, true)).orderBy(desc(posts.publishedAt));
}

export async function getPublishedPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(posts).where(and(eq(posts.slug, slug), eq(posts.isPublished, true))).limit(1);
  return rows[0];
}

export async function getAdminPosts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(posts).orderBy(desc(posts.updatedAt));
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
  const inserted = await db.insert(posts).values({ ...input, excerpt: input.excerpt ?? null, coverImageUrl: input.coverImageUrl ?? null, publishedAt: input.isPublished ? new Date() : null });
  const created = await db.select().from(posts).where(eq(posts.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminPost(input: { id: number } & Partial<PostWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(posts).where(eq(posts.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Post not found.");
  const { id, ...changes } = input;
  await db.update(posts).set({ ...changes, publishedAt: input.isPublished === true && !existing[0].isPublished ? new Date() : existing[0].publishedAt, updatedAt: new Date() }).where(eq(posts.id, id));
  const updated = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(posts).where(eq(posts.id, id));
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

export async function logAdminAction(input: { actorUserId: number; action: string; entityType: string; entityId?: number | null; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuditLogs).values({ actorUserId: input.actorUserId, action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null });
}

// TIER 4: admin-only Audit Log viewer — every filter is optional/additive.
export async function getAdminAuditLogs(filters: { action?: string; actorEmail?: string; dateFrom?: Date; dateTo?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    filters.action ? eq(adminAuditLogs.action, filters.action) : undefined,
    filters.actorEmail ? like(users.email, `%${filters.actorEmail}%`) : undefined,
    filters.dateFrom ? gte(adminAuditLogs.createdAt, filters.dateFrom) : undefined,
    filters.dateTo ? lte(adminAuditLogs.createdAt, filters.dateTo) : undefined,
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
export async function getLoginHistory(filters: { email?: string; success?: boolean; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    filters.email ? like(loginAttempts.email, `%${filters.email}%`) : undefined,
    filters.success !== undefined ? eq(loginAttempts.success, filters.success) : undefined,
  ].filter(condition => condition !== undefined);

  return db.select().from(loginAttempts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(loginAttempts.createdAt))
    .limit(Math.min(filters.limit ?? 100, 200));
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
  return rows.filter(row => row.id !== input.excludeId && (row.slug === input.slug || row.sku === input.sku));
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
  sku: string;
  imageUrl?: string | null;
  galleryJson?: string | null;
  stockQuantity: number;
  isPublished: boolean;
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns?: string | null;
  interiorStyle?: string | null;
};

export async function createAdminProduct(input: ProductWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.insert(products).values({
    categoryId: input.categoryId,
    name: input.name,
    slug: input.slug,
    brand: input.brand ?? null,
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    priceMnt: input.priceMnt,
    compareAtPriceMnt: input.compareAtPriceMnt ?? null,
    sku: input.sku,
    imageUrl: input.imageUrl ?? null,
    galleryJson: input.galleryJson ?? null,
    stockQuantity: input.stockQuantity,
    isPublished: input.isPublished,
    skinType: input.skinType ?? null,
    skinConcerns: input.skinConcerns ?? null,
    interiorStyle: input.interiorStyle ?? null,
  });

  const created = await db.select().from(products).where(eq(products.slug, input.slug)).limit(1);
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
  if (input.sku !== undefined) changes.sku = input.sku;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.galleryJson !== undefined) changes.galleryJson = input.galleryJson;
  if (input.stockQuantity !== undefined) changes.stockQuantity = input.stockQuantity;
  if (input.isPublished !== undefined) changes.isPublished = input.isPublished;
  if (input.skinType !== undefined) changes.skinType = input.skinType;
  if (input.skinConcerns !== undefined) changes.skinConcerns = input.skinConcerns;
  if (input.interiorStyle !== undefined) changes.interiorStyle = input.interiorStyle;

  await db.update(products).set(changes).where(eq(products.id, input.id));
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
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
}

export async function getAdminUserDetail(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
    suspendedAt: users.suspendedAt,
    suspendedReason: users.suspendedReason,
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

  return { ...user, orders: userOrders, totalSpentMnt: Number(spendRow?.total ?? 0) };
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

export async function getAdminStaffInvitations() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      role: staffInvitations.role,
      status: staffInvitations.status,
      expiresAt: staffInvitations.expiresAt,
      acceptedAt: staffInvitations.acceptedAt,
      createdAt: staffInvitations.createdAt,
    })
    .from(staffInvitations)
    .orderBy(desc(staffInvitations.createdAt));
}

export async function createStaffInvitation(input: { email: string; role: "user" | "staff" | "admin"; tokenHash: string; invitedByUserId: number; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const email = input.email.trim().toLocaleLowerCase();

  await db.update(staffInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(staffInvitations.email, email), eq(staffInvitations.status, "pending")));
  const inserted = await db.insert(staffInvitations).values({ ...input, email });
  const invitation = await db.select().from(staffInvitations).where(eq(staffInvitations.id, Number(inserted[0].insertId))).limit(1);
  if (!invitation[0]) throw new Error("Unable to create the staff invitation.");
  return invitation[0];
}

export async function getStaffInvitationByTokenHash(tokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const invitation = await db.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, tokenHash)).limit(1);
  return invitation[0];
}

export async function acceptStaffInvitation(input: { tokenHash: string; userId: number; userEmail: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const invitation = await getStaffInvitationByTokenHash(input.tokenHash);
  if (!invitation) throw new Error("This staff invitation is not valid.");
  if (invitation.status !== "pending") throw new Error("This staff invitation is no longer active.");
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await db.update(staffInvitations).set({ status: "expired", updatedAt: new Date() }).where(eq(staffInvitations.id, invitation.id));
    throw new Error("This staff invitation has expired.");
  }
  if (invitation.email.toLocaleLowerCase() !== input.userEmail.trim().toLocaleLowerCase()) {
    throw new Error("Please sign in with the email address that received this invitation.");
  }

  await db.update(users).set({ role: invitation.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
  await db.update(staffInvitations).set({ status: "accepted", acceptedAt: new Date(), acceptedUserId: input.userId, updatedAt: new Date() }).where(eq(staffInvitations.id, invitation.id));
  return { role: invitation.role, email: invitation.email };
}

export async function revokeStaffInvitation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(staffInvitations.id, id), eq(staffInvitations.status, "pending")));
  return { id };
}

export async function updateAdminUserRole(input: { userId: number; role: "user" | "staff" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user[0]) throw new Error("User not found.");
  await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
  return { ...user[0], role: input.role };
}
