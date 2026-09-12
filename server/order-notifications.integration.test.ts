import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// ROADMAP.md TIER 2: order confirmation + status-change emails (Brevo).
// Same opt-in convention as the other commerce integration suites — this
// needs a real cart/product/order round trip, not just mocked functions.
// No BREVO_API_KEY is set for this test run, so every send falls back to a
// `console.log` line (see server/_core/notification.ts) — that's the
// observable signal these tests assert on.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "198.51.100.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("order notification integration", () => {
  const marker = `order-notify-${Date.now()}`;
  let adminUserId = 0;
  let shopperUserId = 0;
  let categoryId = 0;
  let productId = 0;
  let orderId = 0;
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let shopperCaller: ReturnType<typeof appRouter.createCaller>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order notification integration tests.");

    const adminInsert = await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Order Notify Admin", role: "admin", emailVerifiedAt: new Date() });
    adminUserId = Number(adminInsert[0].insertId);
    adminCaller = callerFor(testSessionUser({ id: adminUserId, email: `${marker}-admin@example.invalid`, name: "Order Notify Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));

    // A stable logged-in identity (not an anonymous guest) so the two
    // separate calls below (cart.addItem, then checkout.createOrder) agree
    // on whose cart it is — an anonymous caller's identity comes from a
    // cookie captured off `res.cookie`, which this minimal caller stub
    // discards (see checkout.guest.integration.test.ts for the real
    // cookie-capturing version guest checkout itself needs).
    const shopperInsert = await db.insert(users).values({ email: `${marker}-shopper@example.invalid`, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Order Notify Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperUserId = Number(shopperInsert[0].insertId);
    shopperCaller = callerFor(testSessionUser({ id: shopperUserId, email: `${marker}-shopper@example.invalid`, name: "Order Notify Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));

    const categoryInsert = await db.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category` });
    categoryId = Number(categoryInsert[0].insertId);
    const productInsert = await db.insert(products).values({ categoryId, name: "Order Notify Test Product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isPublished: true });
    productId = Number(productInsert[0].insertId);
    // PHASE 2 of product variants: cart.addItem({ productId }) resolves to
    // this product's default variant -- see the same note in
    // checkout.guest.integration.test.ts.
    await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isDefault: true });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderId) { await db.delete(orderItems).where(eq(orderItems.orderId, orderId)); await db.delete(orders).where(eq(orders.id, orderId)); }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (adminUserId) { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminUserId)); await db.delete(users).where(eq(users.id, adminUserId)); }
    if (shopperUserId) await db.delete(users).where(eq(users.id, shopperUserId));
  });

  beforeEach(() => { logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined); });
  afterEach(() => { logSpy.mockRestore(); });

  it("logs an order confirmation email (customer email present) right after checkout", async () => {
    await shopperCaller.cart.addItem({ productId, quantity: 3 });
    const order = await shopperCaller.checkout.createOrder({
      customerName: "Notify Test Customer",
      customerPhone: "88119900",
      customerEmail: "notify-test-customer@example.invalid",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    orderId = order.id;

    // PHASE 2 of product variants: order.items now also carries attributesJson
    // (null here -- this fixture's variant has none) for the confirmation
    // email/OrderConfirmation page to show which option was bought.
    expect(order.items).toEqual([{ name: "Order Notify Test Product", quantity: 3, priceMnt: 15_000, attributesJson: null }]);

    const logged = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(logged).toContain("notify-test-customer@example.invalid");
    expect(logged).toContain(order.orderNumber);
    expect(logged).toContain("Order Notify Test Product"); // itemized in the email body
  });

  it("skips the confirmation email entirely when checkout has no customer email (common for guests)", async () => {
    await shopperCaller.cart.addItem({ productId, quantity: 1 });
    logSpy.mockClear();
    const order = await shopperCaller.checkout.createOrder({
      customerName: "No Email Customer",
      customerPhone: "88119901",
      customerEmail: null,
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });

    const logged = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(logged).not.toContain("[Email]");

    const db = await getDb();
    await db!.delete(orderItems).where(eq(orderItems.orderId, order.id));
    await db!.delete(orders).where(eq(orders.id, order.id));
  });

  it("logs a status-change email when an admin moves the order forward, but not on a tracking-ref-only edit", async () => {
    logSpy.mockClear();
    const confirmed = await adminCaller.admin.updateOrder({ id: orderId, status: "confirmed" });
    expect(confirmed.status).toBe("confirmed");
    const afterStatusChange = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(afterStatusChange).toContain("notify-test-customer@example.invalid");
    expect(afterStatusChange).toContain("баталгаажууллаа");

    logSpy.mockClear();
    await adminCaller.admin.updateOrder({ id: orderId, deliveryTrackingRef: "TRACK-123" });
    const afterTrackingOnlyChange = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(afterTrackingOnlyChange).not.toContain("[Email]");
  });

  it("bulk status change also sends a per-order status email", async () => {
    logSpy.mockClear();
    const result = await adminCaller.admin.bulkUpdateOrderStatus({ ids: [orderId], status: "packed" });
    expect(result.succeeded).toEqual([orderId]);
    const logged = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(logged).toContain("бэлтгэж дууслаа");
  });
});
