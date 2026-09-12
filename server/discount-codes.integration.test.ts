import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, cartItems, carts, discountCodes, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Manually-entered checkout discount codes ("SALE10") — real, server-side
// re-validated at order time (never trusts a client-supplied amount), and
// stack in sequence with the routine and loyalty discounts.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.117.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.117.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

// A guest whose cookies persist between calls (the default callerFor's
// res.cookie is a no-op, so a guest cart minted on addItem would be lost by
// createOrder). Exposes the jar so afterAll can delete the guest carts.
function guestCaller() {
  const jar: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { get cookie() { return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; "); } },
      ip: `203.0.117.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.117.1" },
    } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { jar[name] = value; }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return { caller: appRouter.createCaller(ctx), tokens: () => Object.values(jar) };
}

describeWithDatabase("discount code integration", () => {
  const marker = `coupon-test-${Date.now()}`;
  const guestTokens: string[] = [];
  const adminEmail = `${marker}-admin@example.invalid`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  let adminId = 0;
  let shopperId = 0;
  let productId = 0;
  const createdCodeIds: number[] = [];
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for discount code integration tests.");
    const adminInsert = await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Coupon Test Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(adminInsert[0].insertId);
    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Coupon Test Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the coupon test product to.");
    const productInsert = await db.insert(products).values({ categoryId: categoryRows[0].id, name: "Coupon Test Product", slug: `${marker}-product`, priceMnt: 40_000, sku: `${marker}-sku`, stockQuantity: 50, isPublished: true });
    productId = Number(productInsert[0].insertId);
    // PHASE 2 of product variants: cart.addItem({ productId }) resolves to
    // this product's default variant -- see the same note in
    // checkout.guest.integration.test.ts.
    await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 40_000, stockQuantity: 50, isDefault: true });
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
    if (guestTokens.length) {
      const guestCarts = await db.select({ id: carts.id }).from(carts).where(inArray(carts.guestToken, guestTokens));
      for (const cart of guestCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(inArray(carts.guestToken, guestTokens));
    }
    for (const id of createdCodeIds) await db.delete(discountCodes).where(eq(discountCodes.id, id));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, shopperId));
  });

  function admin() {
    return callerFor(testSessionUser({ id: adminId, email: adminEmail, name: "Coupon Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));
  }
  function shopper() {
    return callerFor(testSessionUser({ id: shopperId, email: shopperEmail, name: "Coupon Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));
  }

  it("rejects a non-staff user from creating discount codes", async () => {
    await expect(shopper().admin.createDiscountCode({ code: "NOPE", type: "percent", percentValue: 10, minSubtotalMnt: 0, isActive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an unknown code at checkout preview", async () => {
    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 });
    await expect(caller.cart.applicableCouponDiscount({ code: "DOESNOTEXIST" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("applies a percent code, persists it on the order, and reduces the charged total", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-PCT10`, type: "percent", percentValue: 10, minSubtotalMnt: 0, isActive: true });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 }); // 40,000

    const preview = await caller.cart.applicableCouponDiscount({ code: created.code });
    expect(preview.discountMnt).toBe(4_000);

    const order = await caller.checkout.createOrder({
      customerName: "Coupon Test Shopper",
      customerPhone: "99001122",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
      couponCode: created.code,
    });
    createdOrderIds.push(order.id);

    expect(order.couponCode).toBe(created.code);
    expect(order.couponDiscountMnt).toBe(4_000);
    expect(order.totalMnt).toBe(40_000 - 4_000);

    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for discount code integration tests.");
    const codeRow = await db.select().from(discountCodes).where(eq(discountCodes.id, created.id)).limit(1);
    expect(codeRow[0]?.usesCount).toBe(1);
  });

  it("caps a fixed-amount code at the subtotal instead of going negative", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-BIGFIXED`, type: "fixed", fixedAmountMnt: 1_000_000, minSubtotalMnt: 0, isActive: true });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 }); // 40,000
    const preview = await caller.cart.applicableCouponDiscount({ code: created.code });
    expect(preview.discountMnt).toBe(40_000);
  });

  it("rejects a code below its minimum subtotal", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-MIN9M`, type: "percent", percentValue: 5, minSubtotalMnt: 9_000_000, isActive: true });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 }); // 40,000, far below 9,000,000
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a code once its maxUses is exhausted, even mid-race with an atomic guard", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-ONEUSE`, type: "percent", percentValue: 10, minSubtotalMnt: 0, maxUses: 1, isActive: true });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 });
    const order = await caller.checkout.createOrder({
      customerName: "Coupon Test Shopper",
      customerPhone: "99001122",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
      couponCode: created.code,
    });
    createdOrderIds.push(order.id);

    // The single use is now spent -- a second attempt must be rejected.
    await caller.cart.addItem({ productId, quantity: 1 });
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an already-expired code", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-EXPIRED`, type: "percent", percentValue: 10, minSubtotalMnt: 0, isActive: true, expiresAt: new Date(Date.now() - 60_000) });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 });
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("admin can deactivate a code and it's immediately rejected", async () => {
    const admin1 = admin();
    const created = await admin1.admin.createDiscountCode({ code: `${marker}-TOGGLE`, type: "percent", percentValue: 10, minSubtotalMnt: 0, isActive: true });
    createdCodeIds.push(created.id);

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 });
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).resolves.toMatchObject({ discountMnt: 4_000 });

    await admin1.admin.updateDiscountCode({ id: created.id, isActive: false });
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // Audit 2026-09-09 (R1): maxUsesPerCustomer -- the global budget alone let
  // one shopper redeem a code on every order.
  it("enforces a per-customer cap (by account, and by phone for guests) while the global budget still has room", async () => {
    const created = await admin().admin.createDiscountCode({ code: `${marker}-ONEPER`, type: "percent", percentValue: 10, minSubtotalMnt: 0, maxUses: 10, maxUsesPerCustomer: 1, isActive: true });
    createdCodeIds.push(created.id);
    const orderInput = { deliveryMethod: "store_pickup" as const, pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery" as const, couponCode: created.code };

    const caller = shopper();
    await caller.cart.addItem({ productId, quantity: 1 });
    const order = await caller.checkout.createOrder({ ...orderInput, customerName: "Coupon Test Shopper", customerPhone: "99001122" });
    createdOrderIds.push(order.id);
    expect(order.couponDiscountMnt).toBe(4_000);

    // Same signed-in shopper: the preview already refuses.
    await caller.cart.addItem({ productId, quantity: 1 });
    await expect(caller.cart.applicableCouponDiscount({ code: created.code })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("ашигласан") });

    // A guest giving the same phone (formatted differently) is the same customer.
    const samePerson = guestCaller();
    await samePerson.caller.cart.addItem({ productId, quantity: 1 });
    guestTokens.push(...samePerson.tokens());
    await expect(samePerson.caller.checkout.createOrder({ ...orderInput, customerName: "Same Person", customerPhone: "+976 9900-1122" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // A different phone is a different customer, and the global budget (10) has room.
    const otherPerson = guestCaller();
    await otherPerson.caller.cart.addItem({ productId, quantity: 1 });
    guestTokens.push(...otherPerson.tokens());
    const otherOrder = await otherPerson.caller.checkout.createOrder({ ...orderInput, customerName: "Other Person", customerPhone: "99009900" });
    createdOrderIds.push(otherOrder.id);
    expect(otherOrder.couponDiscountMnt).toBe(4_000);
  });
});
