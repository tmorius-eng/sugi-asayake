// server/db/reviews.ts — Сэтгэгдэл, хариулт, like, moderation, эрх.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { isAdminPanelRole } from "../../shared/face-auth";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { productReviews, productReviewReplies, productReviewLikes, products, users } from "../../drizzle/schema";
import { getOrSetCached, invalidateCachedByPrefix } from "../_core/ttlCache";
import { getDb } from "./connection";
import { findVerifyingOrderId } from "./customer-orders";
import { STOREFRONT_CACHE_TTL_MS } from "./site";

export async function createProductReview(input: { userId: number; productId: number; rating: number; comment: string | null; imageUrl?: string | null }) {
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
    imageUrl: input.imageUrl ?? null,
  });
  const created = await db.select().from(productReviews).where(eq(productReviews.id, Number(inserted[0].insertId))).limit(1);
  invalidateCachedByPrefix("storefront:featuredReviews:");
  return created[0];
}

/** Public, approved-only reviews for a product page — newest first. */
/**
 * Reviews for a product page as a THREAD (2026-09-13): each review with its
 * author's avatar and role, its like count, whether the viewer liked it, and
 * its approved replies in posting order. Three queries, not N+1: reviews,
 * then likes and replies for exactly those review ids.
 */
/** Хуудаслалт (2026-09-21): `limit` (анхдагч 20, дээд 50) + `cursor` = хамгийн сүүлд
 *  авсан мөрийн `id` (түүнээс бага id-ууд). Эрэмбэ `id DESC` — createdAt-тай ижил
 *  дараалал (autoincrement) боловч секундын нарийвчлалын тэнцэл байхгүй (дүрэм:
 *  хуудаслалттай query бүрт тогтвортой тэнцвэр). Клиент нь бүтэн хуудас (= limit)
 *  ирвэл сүүлийн id-г дараагийн cursor болгоно. */
export async function getProductReviews(productId: number, viewerUserId: number | null = null, page: { limit?: number; cursor?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(page.limit ?? 20, 1), 50);
  const reviews = await db
    .select({
      id: productReviews.id,
      rating: productReviews.rating,
      comment: productReviews.comment,
      imageUrl: productReviews.imageUrl,
      createdAt: productReviews.createdAt,
      reviewerName: users.name,
      reviewerAvatarUrl: users.avatarUrl,
      reviewerRole: users.role,
      reviewerUserId: users.id,
    })
    .from(productReviews)
    .innerJoin(users, eq(users.id, productReviews.userId))
    .where(and(eq(productReviews.productId, productId), eq(productReviews.isApproved, true), page.cursor ? lt(productReviews.id, page.cursor) : undefined))
    .orderBy(desc(productReviews.id))
    .limit(limit);
  if (reviews.length === 0) return [];
  const ids = reviews.map(r => r.id);

  const likeRows = await db
    .select({ reviewId: productReviewLikes.reviewId, count: sql<number>`count(*)`, mine: sql<number>`sum(case when ${productReviewLikes.userId} = ${viewerUserId ?? -1} then 1 else 0 end)` })
    .from(productReviewLikes)
    .where(inArray(productReviewLikes.reviewId, ids))
    .groupBy(productReviewLikes.reviewId);
  const likes = new Map(likeRows.map(row => [row.reviewId, { count: Number(row.count), mine: Number(row.mine) > 0 }]));

  const replyRows = await db
    .select({
      id: productReviewReplies.id,
      reviewId: productReviewReplies.reviewId,
      body: productReviewReplies.body,
      createdAt: productReviewReplies.createdAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
      authorUserId: users.id,
    })
    .from(productReviewReplies)
    .innerJoin(users, eq(users.id, productReviewReplies.userId))
    .where(and(inArray(productReviewReplies.reviewId, ids), eq(productReviewReplies.isApproved, true)))
    .orderBy(asc(productReviewReplies.createdAt));
  const replies = new Map<number, typeof replyRows>();
  for (const reply of replyRows) replies.set(reply.reviewId, [...(replies.get(reply.reviewId) ?? []), reply]);

  return reviews.map(review => ({
    ...review,
    // Staff answering for the shop get a badge; customers do not expose roles.
    reviewerIsStaff: isAdminPanelRole(review.reviewerRole),
    reviewerRole: undefined,
    likeCount: likes.get(review.id)?.count ?? 0,
    likedByMe: likes.get(review.id)?.mine ?? false,
    replies: (replies.get(review.id) ?? []).map(reply => ({ ...reply, authorIsStaff: isAdminPanelRole(reply.authorRole), authorRole: undefined })),
  }));
}

/**
 * Who may reply under a review: the review's author, panel staff answering
 * for the shop, or another verified buyer of the same product. Anyone else
 * (a signed-in browser who never bought it) cannot -- the same purchase
 * gate that keeps the reviews themselves honest.
 */
export async function canReplyToReview(userId: number, role: string | null, reviewId: number): Promise<{ ok: true; productId: number } | { ok: false; reason: string }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Database is not available" };
  const [review] = await db.select({ id: productReviews.id, productId: productReviews.productId, userId: productReviews.userId, isApproved: productReviews.isApproved }).from(productReviews).where(eq(productReviews.id, reviewId)).limit(1);
  if (!review || !review.isApproved) return { ok: false, reason: "Сэтгэгдэл олдсонгүй." };
  if (review.userId === userId || isAdminPanelRole(role)) return { ok: true, productId: review.productId };
  if (await findVerifyingOrderId(userId, review.productId)) return { ok: true, productId: review.productId };
  return { ok: false, reason: "Зөвхөн энэ бүтээгдэхүүнийг захиалсан хэрэглэгч хариулах боломжтой." };
}

export async function createReviewReply(input: { reviewId: number; userId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(productReviewReplies).values({ reviewId: input.reviewId, userId: input.userId, body: input.body });
  const [created] = await db.select().from(productReviewReplies).where(eq(productReviewReplies.id, Number(inserted[0].insertId))).limit(1);
  return created;
}

/** Toggle. Returns the new state and count so the UI needs no refetch. */
export async function toggleReviewLike(reviewId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [review] = await db.select({ id: productReviews.id }).from(productReviews).where(and(eq(productReviews.id, reviewId), eq(productReviews.isApproved, true))).limit(1);
  if (!review) throw new Error("Сэтгэгдэл олдсонгүй.");
  const [existing] = await db.select({ reviewId: productReviewLikes.reviewId }).from(productReviewLikes).where(and(eq(productReviewLikes.reviewId, reviewId), eq(productReviewLikes.userId, userId))).limit(1);
  if (existing) await db.delete(productReviewLikes).where(and(eq(productReviewLikes.reviewId, reviewId), eq(productReviewLikes.userId, userId)));
  else await db.insert(productReviewLikes).values({ reviewId, userId });
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(productReviewLikes).where(eq(productReviewLikes.reviewId, reviewId));
  return { liked: !existing, likeCount: Number(count?.n ?? 0) };
}

/** Admin edit of a review's own text/rating (Tom, 2026-09-13: manage
 *  comments from /admin -- edit and delete). */
export async function updateAdminReview(input: { id: number; rating?: number; comment?: string | null; imageUrl?: null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const patch: Partial<typeof productReviews.$inferInsert> = { updatedAt: new Date() };
  if (input.rating !== undefined) patch.rating = input.rating;
  if (input.comment !== undefined) patch.comment = input.comment;
  // Moderation (2026-09-21): only removal -- an admin never sets someone else's photo.
  if (input.imageUrl === null) patch.imageUrl = null;
  await db.update(productReviews).set(patch).where(eq(productReviews.id, input.id));
  invalidateCachedByPrefix("storefront:featuredReviews:");
  const [row] = await db.select().from(productReviews).where(eq(productReviews.id, input.id)).limit(1);
  return row ?? null;
}

export async function getAdminReviewReplies(reviewId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: productReviewReplies.id, body: productReviewReplies.body, isApproved: productReviewReplies.isApproved, createdAt: productReviewReplies.createdAt, authorName: users.name, authorUserId: users.id })
    .from(productReviewReplies)
    .innerJoin(users, eq(users.id, productReviewReplies.userId))
    .where(eq(productReviewReplies.reviewId, reviewId))
    .orderBy(asc(productReviewReplies.createdAt));
}

export async function updateAdminReviewReply(input: { id: number; body?: string; isApproved?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const patch: Partial<typeof productReviewReplies.$inferInsert> = { updatedAt: new Date() };
  if (input.body !== undefined) patch.body = input.body;
  if (input.isApproved !== undefined) patch.isApproved = input.isApproved;
  await db.update(productReviewReplies).set(patch).where(eq(productReviewReplies.id, input.id));
  return { id: input.id };
}

export async function deleteAdminReviewReply(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(productReviewReplies).where(eq(productReviewReplies.id, id));
  return { id };
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
  // Ачааллын бэлтгэл (2026-09-16): энэ нь нүүр хуудсыг нээх бүрт дуудагддаг
  // атлаа бусад storefront уншилтуудаас (bestsellers, брэнд, site_media …)
  // ялгаатай нь кэшлэгдээгүй ганц нь байв — 3 хүснэгтийн JOIN бүхий query
  // зочин бүрт DB рүү очиж байсан. Ижил TTL, ижил хүчингүй болголтын загвар.
  return getOrSetCached(`storefront:featuredReviews:${limit}`, STOREFRONT_CACHE_TTL_MS, async () => {
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
  });
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
      imageUrl: productReviews.imageUrl,
      isApproved: productReviews.isApproved,
      createdAt: productReviews.createdAt,
      productId: productReviews.productId,
      productName: products.name,
      productSlug: products.slug,
      reviewerName: users.name,
      reviewerEmail: users.email,
      replyCount: sql<number>`(select count(*) from ${productReviewReplies} where ${productReviewReplies.reviewId} = ${productReviews.id})`,
      likeCount: sql<number>`(select count(*) from ${productReviewLikes} where ${productReviewLikes.reviewId} = ${productReviews.id})`,
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
  invalidateCachedByPrefix("storefront:featuredReviews:");
  return { id, isApproved };
}

export async function deleteAdminReview(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(productReviews).where(eq(productReviews.id, id));
  invalidateCachedByPrefix("storefront:featuredReviews:");
  return { id };
}
