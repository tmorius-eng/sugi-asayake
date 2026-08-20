import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { adminAuditLogs, cartItems, carts, emailVerificationTokens, InsertProduct, InsertProductCategory, InsertUser, orderItems, orders, passwordResetTokens, paymentAttempts, posts, productCategories, products, siteMedia, staffInvitations, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getInventoryReservationFailure, shouldRestoreStock } from "./commerce-lifecycle";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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

export async function touchUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
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

export async function createPasswordResetToken(input: { userId: number; tokenHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // Requesting a new reset link invalidates any still-pending ones for the
  // same user, so only the most recently issued link can ever be used.
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, input.userId), sql`${passwordResetTokens.usedAt} is null`));
  await db.insert(passwordResetTokens).values(input);
}

export async function resetPasswordWithToken(input: { tokenHash: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const found = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, input.tokenHash)).limit(1);
  const token = found[0];
  if (!token) throw new Error("Энэ холбоос хүчингүй байна. Дахин нууц үг сэргээх хүсэлт илгээнэ үү.");
  if (token.usedAt) throw new Error("Энэ холбоос аль хэдийн ашиглагдсан байна. Дахин нууц үг сэргээх хүсэлт илгээнэ үү.");
  if (token.expiresAt.getTime() <= Date.now()) throw new Error("Энэ холбоосны хугацаа дууссан байна. Дахин нууц үг сэргээх хүсэлт илгээнэ үү.");

  // Bumping sessionVersion in the same update invalidates every session
  // token issued before the reset — if the account was ever compromised, the
  // attacker's existing cookie stops working the moment the password changes.
  await db.update(users).set({ passwordHash: input.passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, token.userId));
  // Mark this token used, and invalidate any other outstanding tokens for
  // this user so an older, still-unread email can't reset the password again.
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, token.userId), sql`${passwordResetTokens.usedAt} is null`));
  return { userId: token.userId };
}

// --- Email verification (TIER 0: optional, but good practice) -------------

export async function createEmailVerificationToken(input: { userId: number; tokenHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, input.userId), sql`${emailVerificationTokens.usedAt} is null`));
  await db.insert(emailVerificationTokens).values(input);
}

export async function verifyEmailWithToken(input: { tokenHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const found = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, input.tokenHash)).limit(1);
  const token = found[0];
  if (!token) throw new Error("Энэ баталгаажуулах холбоос хүчингүй байна.");
  if (token.usedAt) throw new Error("Энэ имэйл хаяг аль хэдийн баталгаажсан байна.");
  if (token.expiresAt.getTime() <= Date.now()) throw new Error("Энэ баталгаажуулах холбоосны хугацаа дууссан байна. Шинэ холбоос илгээлгэнэ үү.");

  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, token.userId));
  await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, token.id));
  return { userId: token.userId };
}

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
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(products.isPublished, true))
    .orderBy(asc(productCategories.sortOrder), desc(products.createdAt));
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
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.slug, slug), eq(products.isPublished, true)))
    .limit(1);

  return result[0] ?? null;
}

export async function getActiveCartForUser(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const cart = await db
    .select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt })
    .from(carts)
    .where(and(eq(carts.userId, userId), eq(carts.status, "active")))
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

async function getOrCreateActiveCart(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const active = await getActiveCartForUser(userId);
  if (active) return active;
  const inserted = await db.insert(carts).values({ userId, status: "active" });
  const created = await db.select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt }).from(carts).where(eq(carts.id, Number(inserted[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Unable to create an active cart.");
  return { ...created[0], items: [] };
}

export async function addCartItem(input: { userId: number; productId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const product = await db.select({ id: products.id, stockQuantity: products.stockQuantity, isPublished: products.isPublished }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]?.isPublished) throw new Error("This product is not currently available for ordering.");

  const cart = await getOrCreateActiveCart(input.userId);
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, input.productId))).limit(1);
  const quantity = (existing[0]?.quantity ?? 0) + input.quantity;
  if (quantity > product[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");

  if (existing[0]) {
    await db.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing[0].id));
  } else {
    await db.insert(cartItems).values({ cartId: cart.id, productId: input.productId, quantity });
  }
  return getActiveCartForUser(input.userId);
}

export async function updateCartItemQuantity(input: { userId: number; itemId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = await db
    .select({ itemId: cartItems.id, cartId: carts.id, productId: products.id, stockQuantity: products.stockQuantity })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.id, input.itemId), eq(carts.userId, input.userId), eq(carts.status, "active")))
    .limit(1);
  if (!row[0]) throw new Error("Cart item not found.");
  if (input.quantity === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, row[0].itemId));
  } else {
    if (input.quantity > row[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");
    await db.update(cartItems).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(cartItems.id, row[0].itemId));
  }
  return getActiveCartForUser(input.userId);
}

export async function createOrderFromActiveCart(input: {
  userId: number;
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
  const cart = await getActiveCartForUser(input.userId);
  if (!cart?.items.length) throw new Error("Your cart is empty.");
  const availabilityFailure = getInventoryReservationFailure(cart.items);
  if (availabilityFailure) throw new Error(availabilityFailure);

  const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  const deliveryFeeMnt = input.deliveryMethod === "ub_delivery" ? 5000 : 0;
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
      userId: input.userId,
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
      totalMnt: subtotalMnt + deliveryFeeMnt,
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
  return order[0];
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
  const lineItems = await db.select({ orderId: orderItems.orderId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems);
  return orderRows.map(order => ({ ...order, items: lineItems.filter(item => item.orderId === order.id) }));
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
  });

  const created = await db.select().from(products).where(eq(products.slug, input.slug)).limit(1);
  return created[0];
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
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
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

export async function createStaffInvitation(input: { email: string; role: "user" | "admin"; tokenHash: string; invitedByUserId: number; expiresAt: Date }) {
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

export async function updateAdminUserRole(input: { userId: number; role: "user" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user[0]) throw new Error("User not found.");
  await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
  return { ...user[0], role: input.role };
}
