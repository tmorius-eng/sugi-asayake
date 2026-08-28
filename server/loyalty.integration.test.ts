import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, cartItems, carts, orderItems, orders, productCategories, productVariants, products, routineSteps, routines, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// PREMIUM-FEATURES.md TIER 5: the loyalty tier discount is computed from a
// shopper's real cumulative *paid* spend (plus any admin-credited manual
// adjustment) at order-creation time and actually subtracted — same
// discipline as the TIER 4 routine discount, verified the same way.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.116.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.116.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("loyalty tier discount integration", () => {
  const marker = `loyalty-test-${Date.now()}`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  const adminEmail = `${marker}-admin@example.invalid`;
  let shopperId = 0;
  let adminId = 0;
  let productId = 0;
  let createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");

    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Loyalty Test Shopper", phone: "99112233", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
    const adminInsert = await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Loyalty Test Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(adminInsert[0].insertId);

    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the loyalty test product to.");
    const productInsert = await db.insert(products).values({ categoryId: categoryRows[0].id, name: "Loyalty Test Product", slug: `${marker}-product`, priceMnt: 100_000, sku: `${marker}-sku`, stockQuantity: 50, isPublished: true });
    productId = Number(productInsert[0].insertId);
    // PHASE 2 of product variants: cart.addItem({ productId }) resolves to
    // this product's default variant -- see the same note in
    // checkout.guest.integration.test.ts.
    await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 100_000, stockQuantity: 50, isDefault: true });
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    const cartRows = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, shopperId));
    for (const cart of cartRows) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.userId, shopperId));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const orderId of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(users).where(eq(users.id, shopperId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  function shopper() {
    return callerFor({ id: shopperId, email: shopperEmail, name: "Loyalty Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function admin() {
    return callerFor({ id: adminId, email: adminEmail, name: "Loyalty Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }

  it("starts every shopper at the zero-discount Стандарт tier with no orders", async () => {
    const status = await shopper().loyalty.myStatus();
    expect(status).toMatchObject({ cardNumber: "99112233", totalSpendMnt: 0, currentTier: { name: "Стандарт", discountPercent: 0 }, nextTier: { name: "Хүрэл", minSpendMnt: 500_000 } });
  });

  it("a guest checkout never gets a loyalty discount, even hypothetically", async () => {
    const anon = callerFor(null);
    // Guests can't call loyalty.myStatus (protectedProcedure) at all — the
    // membership card is tied to a registered account, same as the physical
    // one is tied to a phone number on file.
    await expect(anon.loyalty.myStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("admin can credit known in-store history, moving the shopper into the Хүрэл (3%) tier", async () => {
    const updated = await admin().admin.updateUserLoyaltyAdjustment({ userId: shopperId, adjustmentMnt: 600_000 });
    expect(updated.loyalty).toMatchObject({ totalSpendMnt: 600_000, currentTier: { name: "Хүрэл", discountPercent: 3 } });

    const status = await shopper().loyalty.myStatus();
    expect(status).toMatchObject({ manualAdjustmentMnt: 600_000, totalSpendMnt: 600_000, currentTier: { name: "Хүрэл", discountPercent: 3 } });
  });

  it("actually discounts the order total once the shopper is in a paying tier, and records the tier on the order", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 }); // 100,000₮

    const order = await caller.checkout.createOrder({
      customerName: "Loyalty Test Shopper",
      customerPhone: "99112233",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order.id);

    expect(order.subtotalMnt).toBe(100_000);
    expect(order.loyaltyDiscountMnt).toBe(3_000); // 3% of 100,000, from the 600k manual credit above
    expect(order.appliedLoyaltyTierName).toBe("Хүрэл");
    expect(order.totalMnt).toBe(100_000 - 3_000);

    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");
    const persisted = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(persisted[0]?.loyaltyDiscountMnt).toBe(3_000);
    expect(persisted[0]?.totalMnt).toBe(97_000);
  });

  it("cart.applicableLoyaltyDiscount previews the exact amount checkout.createOrder actually charges", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 }); // 100,000₮, still Хүрэл (3%) from the credit above

    const preview = await caller.cart.applicableLoyaltyDiscount({ couponCode: null });
    expect(preview).toMatchObject({ tierName: "Хүрэл", discountPercent: 3, discountMnt: 3_000 });

    const order = await caller.checkout.createOrder({
      customerName: "Loyalty Test Shopper",
      customerPhone: "99112233",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order.id);
    expect(order.loyaltyDiscountMnt).toBe(preview!.discountMnt);
  });

  it("climbs to a higher tier once real paid spend crosses the next threshold", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");
    // Simulate a large *paid* historical order directly (an admin marking an
    // order paid, or a QPay callback, is what would set this in real life).
    const bigOrderInsert = await db.insert(orders).values({
      userId: shopperId, orderNumber: `LOYPAID${Date.now().toString(36).toUpperCase()}`, status: "completed", paymentStatus: "paid",
      paymentMethod: "cash_on_delivery", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар",
      customerName: "Loyalty Test Shopper", customerPhone: "99112233", subtotalMnt: 500_000, totalMnt: 500_000,
    });
    const bigOrderId = Number(bigOrderInsert[0].insertId);
    createdOrderIds.push(bigOrderId);

    // online 500,000 (paid) + 600,000 (manual adjustment) = 1,100,000 -> Мөнгөн (5%)
    const status = await shopper().loyalty.myStatus();
    expect(status).toMatchObject({ onlineSpendMnt: 500_000, totalSpendMnt: 1_100_000, currentTier: { name: "Мөнгөн", discountPercent: 5 }, nextTier: { name: "Алтан", minSpendMnt: 10_000_000 } });
  });

  it("stacks on top of a routine discount, applied to the post-routine-discount amount", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");
    const routineInsert = await db.insert(routines).values({ name: "Loyalty Stack Test Routine", slug: `${marker}-routine`, discountPercent: 10, isPublished: true });
    const routineId = Number(routineInsert[0].insertId);
    await db.insert(routineSteps).values([{ routineId, productId, stepNumber: 1, stepLabel: "Тест" }]);

    try {
      const caller = shopper();
      await caller.cart.addItem({ productId, quantity: 1 }); // 100,000₮

      const order = await caller.checkout.createOrder({
        customerName: "Loyalty Test Shopper",
        customerPhone: "99112233",
        deliveryMethod: "store_pickup",
        pickupBranch: "Орос элчингийн салбар",
        paymentMethod: "cash_on_delivery",
      });
      createdOrderIds.push(order.id);

      // Shopper is in Мөнгөн (5%) from the previous test's paid history.
      // Routine: 10% of 100,000 = 10,000 -> 90,000 remaining.
      // Loyalty: 5% of 90,000 = 4,500.
      expect(order.discountMnt).toBe(10_000);
      expect(order.loyaltyDiscountMnt).toBe(4_500);
      expect(order.totalMnt).toBe(100_000 - 10_000 - 4_500);
    } finally {
      await db.delete(routines).where(eq(routines.id, routineId)); // cascades routine_steps
    }
  });
});

// Home redesign Quick Stats section: getUserLoyaltyStatus's new
// totalLoyaltySavingsMnt field (server/db.ts) -- lifetime money actually
// saved via the loyalty discount, kept separate from spend/tier/discount%.
// A dedicated describe block with its own shopper (rather than appending
// onto the sequential-state shopper above) so each scenario below asserts
// an exact, independently-reasoned total instead of a running cumulative
// value threaded through the tests above.
describeWithDatabase("loyalty total savings (Quick Stats totalLoyaltySavingsMnt)", () => {
  const marker = `loyalty-savings-test-${Date.now()}`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  let shopperId = 0;
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");
    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Loyalty Savings Test Shopper", phone: "99334455", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const orderId of createdOrderIds) await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(users).where(eq(users.id, shopperId));
  });

  function shopper() {
    return callerFor({ id: shopperId, email: shopperEmail, name: "Loyalty Savings Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }

  // Direct inserts (same technique the "climbs to a higher tier" test above
  // uses) rather than a real checkout flow -- lets each scenario set an
  // exact paymentStatus/loyaltyDiscountMnt/couponDiscountMnt combination
  // without needing a real coupon code or cart round-trip.
  async function insertOrder(overrides: Partial<typeof orders.$inferInsert>) {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for loyalty integration tests.");
    const insert = await db.insert(orders).values({
      userId: shopperId,
      orderNumber: `LOYSAVE${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 10_000)}`,
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "cash_on_delivery",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      customerName: "Loyalty Savings Test Shopper",
      customerPhone: "99334455",
      subtotalMnt: 100_000,
      totalMnt: 100_000,
      loyaltyDiscountMnt: 0,
      couponDiscountMnt: 0,
      ...overrides,
    });
    const orderId = Number(insert[0].insertId);
    createdOrderIds.push(orderId);
    return orderId;
  }

  it("is 0, not an error, for a shopper with zero orders", async () => {
    const status = await shopper().loyalty.myStatus();
    expect(status).toMatchObject({ totalLoyaltySavingsMnt: 0 });
  });

  it("counts only the loyalty portion, excluding a coupon discount on the same order", async () => {
    await insertOrder({ loyaltyDiscountMnt: 5_000, couponDiscountMnt: 2_000, totalMnt: 93_000 });
    const status = await shopper().loyalty.myStatus();
    expect(status?.totalLoyaltySavingsMnt).toBe(5_000);
  });

  it("excludes an unpaid order's loyalty discount", async () => {
    await insertOrder({ paymentStatus: "unpaid", loyaltyDiscountMnt: 9_000, totalMnt: 91_000 });
    const status = await shopper().loyalty.myStatus();
    expect(status?.totalLoyaltySavingsMnt).toBe(5_000); // unchanged -- the unpaid order above is excluded
  });

  it("accumulates across multiple paid orders", async () => {
    await insertOrder({ loyaltyDiscountMnt: 1_000, totalMnt: 99_000 });
    await insertOrder({ loyaltyDiscountMnt: 2_000, totalMnt: 98_000 });
    const status = await shopper().loyalty.myStatus();
    expect(status?.totalLoyaltySavingsMnt).toBe(5_000 + 1_000 + 2_000); // 8,000
  });
});
