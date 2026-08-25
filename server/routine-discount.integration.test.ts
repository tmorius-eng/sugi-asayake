import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cartItems, carts, orderItems, orders, productCategories, products, routineSteps, routines, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// PREMIUM-FEATURES.md TIER 4: the routine bundle discount is computed from
// real cart contents and actually subtracted from the order total — this
// exercises the full path against a real database rather than trusting the
// arithmetic in isolation, since it's real money.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.115.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.115.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("routine bundle discount integration", () => {
  const marker = `routine-test-${Date.now()}`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  let shopperId = 0;
  let cleanserProductId = 0;
  let tonerProductId = 0;
  let unrelatedProductId = 0;
  let routineId = 0;
  let createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for routine discount integration tests.");

    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Routine Test Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);

    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the routine test products to.");
    const categoryId = categoryRows[0].id;

    const cleanserInsert = await db.insert(products).values({ categoryId, name: "Routine Test Cleanser", slug: `${marker}-cleanser`, priceMnt: 20_000, sku: `${marker}-cleanser-sku`, stockQuantity: 10, isPublished: true });
    cleanserProductId = Number(cleanserInsert[0].insertId);
    const tonerInsert = await db.insert(products).values({ categoryId, name: "Routine Test Toner", slug: `${marker}-toner`, priceMnt: 30_000, sku: `${marker}-toner-sku`, stockQuantity: 10, isPublished: true });
    tonerProductId = Number(tonerInsert[0].insertId);
    const unrelatedInsert = await db.insert(products).values({ categoryId, name: "Routine Test Unrelated Item", slug: `${marker}-unrelated`, priceMnt: 5_000, sku: `${marker}-unrelated-sku`, stockQuantity: 10, isPublished: true });
    unrelatedProductId = Number(unrelatedInsert[0].insertId);

    const routineInsert = await db.insert(routines).values({ name: "Routine Test Basic Routine", slug: `${marker}-routine`, discountPercent: 20, isPublished: true });
    routineId = Number(routineInsert[0].insertId);
    await db.insert(routineSteps).values([
      { routineId, productId: cleanserProductId, stepNumber: 1, stepLabel: "Цэвэрлэгч" },
      { routineId, productId: tonerProductId, stepNumber: 2, stepLabel: "Тонер" },
    ]);
  });

  afterEach(async () => {
    // Reset the shopper's cart between sub-tests so each starts from empty.
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
    await db.delete(routines).where(eq(routines.id, routineId)); // cascades routine_steps
    await db.delete(products).where(eq(products.id, cleanserProductId));
    await db.delete(products).where(eq(products.id, tonerProductId));
    await db.delete(products).where(eq(products.id, unrelatedProductId));
    await db.delete(users).where(eq(users.id, shopperId));
  });

  function shopper() {
    return callerFor({ id: shopperId, email: shopperEmail, name: "Routine Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }

  it("applies no discount when the cart has only part of the routine", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId: cleanserProductId, quantity: 1 });
    const discount = await caller.cart.applicableRoutineDiscount();
    expect(discount).toBeNull();
  });

  it("applies the discount once the full routine is in the cart, and it actually reduces the charged total", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId: cleanserProductId, quantity: 1 });
    await caller.cart.addItem({ productId: tonerProductId, quantity: 1 });

    const preview = await caller.cart.applicableRoutineDiscount();
    expect(preview).toMatchObject({ routineId, discountPercent: 20, discountMnt: 10_000 }); // 20% of (20,000 + 30,000)

    const order = await caller.checkout.createOrder({
      customerName: "Routine Test Shopper",
      customerPhone: "99001122",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order.id);

    expect(order.subtotalMnt).toBe(50_000);
    expect(order.discountMnt).toBe(10_000);
    expect(order.appliedRoutineId).toBe(routineId);
    expect(order.totalMnt).toBe(50_000 - 10_000 + 0); // store pickup: no delivery fee

    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for routine discount integration tests.");
    const persisted = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(persisted[0]?.discountMnt).toBe(10_000);
    expect(persisted[0]?.appliedRoutineId).toBe(routineId);
    expect(persisted[0]?.totalMnt).toBe(40_000);
  });

  it("only discounts the routine's own products, ignoring an unrelated item also in the cart", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId: cleanserProductId, quantity: 1 });
    await caller.cart.addItem({ productId: tonerProductId, quantity: 1 });
    await caller.cart.addItem({ productId: unrelatedProductId, quantity: 1 });

    const preview = await caller.cart.applicableRoutineDiscount();
    // Still only 20% of the routine's own 50,000 — the unrelated 5,000 item
    // must not inflate (or deflate) the discount base.
    expect(preview).toMatchObject({ discountMnt: 10_000 });

    const order = await caller.checkout.createOrder({
      customerName: "Routine Test Shopper",
      customerPhone: "99001122",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order.id);
    expect(order.subtotalMnt).toBe(55_000);
    expect(order.discountMnt).toBe(10_000);
    expect(order.totalMnt).toBe(45_000);
  });
});
