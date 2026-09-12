import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, productReviews, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// PREMIUM-FEATURES.md TIER 2: verified-purchase reviews against a real
// database — commerce.router.test.ts already covers the RBAC boundary
// in-memory; this covers the actual purchase-gate query, the duplicate
// unique-index behaviour, the catalog rating aggregate, and moderation
// hide/delete actually changing what's visible. Opt-in like the other
// *.integration.test.ts suites (needs a configured dev database).
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.114.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.114.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function userRecord(id: number, email: string, name: string, role: "user" | "marketing"): NonNullable<TrpcContext["user"]> {
  return testSessionUser({ id, email, name, role });
}

describeWithDatabase("product reviews integration", () => {
  const marker = `reviews-test-${Date.now()}`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  // Admin overhaul (2026-09-08, Phase B): review moderation moved from
  // staffProcedure to marketingProcedure -- this fixture was "staff" when
  // staff still owned it; renamed to match.
  const marketingEmail = `${marker}-marketing@example.invalid`;
  let shopperId = 0;
  let marketingId = 0;
  let productId = 0;
  let orderId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for product reviews integration tests.");

    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Reviews Test Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
    const marketingInsert = await db.insert(users).values({ email: marketingEmail, passwordHash: await hashPassword("MarketingPassw0rd!"), name: "Reviews Test Marketing", role: "marketing", emailVerifiedAt: new Date() });
    marketingId = Number(marketingInsert[0].insertId);

    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the reviews test product to.");

    const productInsert = await db.insert(products).values({
      categoryId: categoryRows[0].id,
      name: "Reviews Test Product",
      slug: `${marker}-product`,
      priceMnt: 10_000,
      sku: `${marker}-sku`,
      stockQuantity: 10,
      isPublished: true,
    });
    productId = Number(productInsert[0].insertId);

    // A completed, non-cancelled order containing this product is what makes
    // the shopper eligible — see findVerifyingOrderId in server/db.ts.
    const orderInsert = await db.insert(orders).values({
      userId: shopperId,
      orderNumber: `${marker}-order`,
      status: "completed",
      paymentMethod: "cash_on_delivery",
      paymentStatus: "paid",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      customerName: "Reviews Test Shopper",
      customerPhone: "99001122",
      subtotalMnt: 10_000,
      totalMnt: 10_000,
    });
    orderId = Number(orderInsert[0].insertId);
    await db.insert(orderItems).values({ orderId, productId, productName: "Reviews Test Product", sku: `${marker}-sku`, unitPriceMnt: 10_000, quantity: 1 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(productReviews).where(eq(productReviews.productId, productId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(products).where(eq(products.id, productId));
    // Marketing's admin.updateReviewApproval/deleteReview calls above wrote
    // admin_audit_logs rows (RESTRICT on actorUserId) — must go before the user.
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, marketingId));
    await db.delete(users).where(eq(users.id, shopperId));
    await db.delete(users).where(eq(users.id, marketingId));
  });

  it("lets a verified purchaser leave exactly one review, updates the catalog rating, and moderation controls visibility", async () => {
    const shopper = callerFor(userRecord(shopperId, shopperEmail, "Reviews Test Shopper", "user"));
    const marketing = callerFor(userRecord(marketingId, marketingEmail, "Reviews Test Marketing", "marketing"));

    const eligibility = await shopper.reviews.eligibility({ productId });
    expect(eligibility).toEqual({ canReview: true, alreadyReviewed: false });

    const review = await shopper.reviews.create({ productId, rating: 4, comment: "Full end-to-end integration test review." });
    expect(review.orderId).toBe(orderId);
    expect(review.isApproved).toBe(true);

    // Duplicate: the unique (userId, productId) index and the app-level
    // pre-check both guard this — either would do, this exercises the real path.
    await expect(shopper.reviews.create({ productId, rating: 1, comment: "duplicate" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const eligibilityAfter = await shopper.reviews.eligibility({ productId });
    expect(eligibilityAfter).toEqual({ canReview: false, alreadyReviewed: true });

    const publicList = await shopper.reviews.list({ productId });
    expect(publicList).toHaveLength(1);
    expect(publicList[0]).toMatchObject({ rating: 4, reviewerName: "Reviews Test Shopper" });

    // Frontend performance audit (2026-09-02): catalog.list is now
    // paginated (see getPublishedCatalogPage), so it no longer reliably
    // surfaces one specific product by id on its default first page --
    // catalog.byIds (added for Shop.tsx's "recently viewed" rail) is the
    // right tool for "look up this exact product from the public catalog
    // surface", same as bySlug just below.
    const catalogEntry = (await shopper.catalog.byIds({ ids: [productId] }))[0];
    expect(catalogEntry?.avgRating).toBe(4);
    expect(catalogEntry?.reviewCount).toBe(1);
    const bySlug = await shopper.catalog.bySlug({ slug: `${marker}-product` });
    expect(bySlug?.avgRating).toBe(4);

    // Marketing (not just admin) can moderate.
    await marketing.admin.updateReviewApproval({ id: review.id, isApproved: false });
    expect(await shopper.reviews.list({ productId })).toHaveLength(0);
    const catalogAfterHide = (await shopper.catalog.byIds({ ids: [productId] }))[0];
    expect(catalogAfterHide?.avgRating).toBeNull();
    expect(catalogAfterHide?.reviewCount).toBe(0);

    await marketing.admin.updateReviewApproval({ id: review.id, isApproved: true });
    expect(await shopper.reviews.list({ productId })).toHaveLength(1);

    await marketing.admin.deleteReview({ id: review.id });
    expect(await shopper.reviews.list({ productId })).toHaveLength(0);
    // Deleting the review frees the shopper to review again.
    expect(await shopper.reviews.eligibility({ productId })).toEqual({ canReview: true, alreadyReviewed: false });
  });

  it("refuses a review from a shopper with no qualifying order for that product", async () => {
    const shopper = callerFor(userRecord(shopperId, shopperEmail, "Reviews Test Shopper", "user"));
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for product reviews integration tests.");
    const otherCategory = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    const otherProductInsert = await db.insert(products).values({
      categoryId: otherCategory[0].id,
      name: "Reviews Test Product (never purchased)",
      slug: `${marker}-unpurchased`,
      priceMnt: 5_000,
      sku: `${marker}-unpurchased-sku`,
      stockQuantity: 5,
      isPublished: true,
    });
    const otherProductId = Number(otherProductInsert[0].insertId);
    try {
      const eligibility = await shopper.reviews.eligibility({ productId: otherProductId });
      expect(eligibility).toEqual({ canReview: false, alreadyReviewed: false });
      await expect(shopper.reviews.create({ productId: otherProductId, rating: 5, comment: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await db.delete(products).where(eq(products.id, otherProductId));
    }
  });
});
