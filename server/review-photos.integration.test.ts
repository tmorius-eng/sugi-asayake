import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, productReviews, products, users } from "../drizzle/schema";
import { testSessionUser } from "./_test-helpers";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Сэтгэгдлийн зураг (2026-09-21, migration 0093). Nudity screen-ийг mock хийнэ —
// загварыг ачаалахгүй, "татгалзах" салааг тогтвортой шалгахын тулд.
const safety = vi.hoisted(() => ({ allowed: true }));
vi.mock("./_core/imageSafety", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/imageSafety")>()),
  classifyImageSafety: vi.fn(async () => (safety.allowed
    ? { allowed: true, scores: { Porn: 0, Hentai: 0, Sexy: 0, Neutral: 1, Drawing: 0 } }
    : { allowed: false, reason: "porn", scores: { Porn: 0.99, Hentai: 0, Sexy: 0, Neutral: 0.01, Drawing: 0 } })),
}));

import { appRouter } from "./routers";
import { getDb } from "./db";
import { REVIEW_IMAGE_SAFETY_REJECT_MESSAGE } from "./_core/imageSafety";

const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const hasStorage = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
// 4x4 PNG (profile.integration.test.ts-тэй ижил) — sharp уншиж чадна.
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWM4IWf0HxkzkC4AAGuYIXGU5TmSAAAAAElFTkSuQmCC";

function callerFor(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.115.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.115.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("review photos", () => {
  const marker = `review-photo-test-${Date.now()}`;
  let categoryId = 0;
  let productId = 0;
  let buyerId = 0;
  let strangerId = 0;
  let marketingId = 0;
  let orderId = 0;
  const buyer = () => callerFor(testSessionUser({ id: buyerId, email: `${marker}-buyer@example.invalid`, name: "Photo Buyer", role: "user" }));
  const stranger = () => callerFor(testSessionUser({ id: strangerId, email: `${marker}-stranger@example.invalid`, name: "Photo Stranger", role: "user" }));
  const marketing = () => callerFor(testSessionUser({ id: marketingId, email: `${marker}-marketing@example.invalid`, name: "Photo Marketing", role: "marketing" }));
  const upload = (caller: ReturnType<typeof callerFor>) => caller.reviews.uploadImage({ productId, fileName: "shot.png", contentType: "image/png", dataBase64: TINY_PNG });

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for review photo integration tests.");
    const passwordHash = await hashPassword("Passw0rd!123");
    const insertUser = async (suffix: string, role: "user" | "marketing") => Number((await db.insert(users).values({ email: `${marker}-${suffix}@example.invalid`, passwordHash, name: `Photo ${suffix}`, role }))[0].insertId);
    buyerId = await insertUser("buyer", "user");
    strangerId = await insertUser("stranger", "user");
    marketingId = await insertUser("marketing", "marketing");
    categoryId = Number((await db.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "Review Photo Product", slug: `${marker}-product`, sku: `${marker}-sku`, priceMnt: 5_000, stockQuantity: 5, isPublished: true }))[0].insertId);
    orderId = Number((await db.insert(orders).values({
      userId: buyerId, orderNumber: `RP${Date.now()}`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
      deliveryMethod: "store_pickup", pickupBranch: "Test", customerName: "Photo Buyer", customerPhone: "99001122", subtotalMnt: 5_000, totalMnt: 5_000,
    }))[0].insertId);
    await db.insert(orderItems).values({ orderId, productId, productName: "Review Photo Product", sku: `${marker}-sku`, unitPriceMnt: 5_000, quantity: 1 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(productReviews).where(eq(productReviews.productId, productId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, marketingId));
    await db.delete(users).where(inArray(users.id, [buyerId, strangerId, marketingId]));
  });

  it("refuses an upload from someone who cannot review this product", async () => {
    await expect(upload(stranger())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.skipIf(!hasStorage)("refuses an image the nudity screen rejects, with the review wording", async () => {
    safety.allowed = false;
    try {
      await expect(upload(buyer())).rejects.toMatchObject({ code: "BAD_REQUEST", message: REVIEW_IMAGE_SAFETY_REJECT_MESSAGE });
    } finally {
      safety.allowed = true;
    }
  });

  it("will not attach another user's (or an outside) image to a review", async () => {
    await expect(buyer().reviews.create({ productId, rating: 5, comment: null, imageUrl: `/cdn/reviews/${strangerId}/x.webp` })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(buyer().reviews.create({ productId, rating: 5, comment: null, imageUrl: "https://example.com/x.webp" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.skipIf(!hasStorage)("stores the buyer's photo with the review, shows it publicly, and lets moderation remove only the photo", async () => {
    const { url } = await upload(buyer());
    expect(url).toMatch(new RegExp(`^/cdn/reviews/${buyerId}/`));
    await buyer().reviews.create({ productId, rating: 4, comment: "Сайн бараа", imageUrl: url });

    const [review] = await buyer().reviews.list({ productId });
    expect(review).toMatchObject({ comment: "Сайн бараа", imageUrl: url });

    await marketing().admin.updateReview({ id: review.id, imageUrl: null });
    const [after] = await buyer().reviews.list({ productId });
    expect(after).toMatchObject({ comment: "Сайн бараа", rating: 4, imageUrl: null });
  });
});
