import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { GUEST_CART_COOKIE_NAME } from "../shared/const";
import { orderItems, orders, productCategories, products, productVariants } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// "Controls everything" admin overhaul (2026-09-08, Phase A). Same
// snapshot-and-restore discipline as site-text.integration.test.ts --
// delivery-fee-ub-mnt is a REAL, admin-editable production slot (Phase B's
// checkout wiring reads it), not a throwaway fixture.
const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;
const numberKey = "delivery-fee-ub-mnt" as const;
const textKey = "email-order-status-confirmed" as const;

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      email: "owner@example.com",
      name: "Store Settings Integration Admin",
      role: "admin",
      emailVerifiedAt: null,
      sessionVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

maybeDescribe("managed store-settings integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const publicCaller = appRouter.createCaller({ ...createAdminContext(), user: null });

  let originalNumberValue: string | undefined;

  beforeEach(async () => {
    const before = await adminCaller.admin.storeSettings();
    originalNumberValue = before.find(row => row.settingKey === numberKey)?.settingValue;
  });

  afterEach(async () => {
    if (originalNumberValue !== undefined) {
      await adminCaller.admin.updateStoreSetting({ settingKey: numberKey, settingValue: originalNumberValue }).catch(() => undefined);
    } else {
      await adminCaller.admin.clearStoreSetting({ settingKey: numberKey }).catch(() => undefined);
    }
    await adminCaller.admin.clearStoreSetting({ settingKey: textKey }).catch(() => undefined);
  });

  it("saves an admin override, exposes it via the public query, and removes it on reset", async () => {
    await adminCaller.admin.updateStoreSetting({ settingKey: numberKey, settingValue: "15000" });
    const publicSettings = await publicCaller.content.storeSettings();
    expect(publicSettings.find(row => row.settingKey === numberKey)).toMatchObject({ settingValue: "15000" });

    await adminCaller.admin.clearStoreSetting({ settingKey: numberKey });
    const resetSettings = await publicCaller.content.storeSettings();
    expect(resetSettings.find(row => row.settingKey === numberKey)).toBeUndefined();
  });

  it("rejects a non-numeric value for a number-typed setting, but allows the same string for a text-typed one", async () => {
    await expect(adminCaller.admin.updateStoreSetting({ settingKey: numberKey, settingValue: "not-a-number" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(adminCaller.admin.updateStoreSetting({ settingKey: textKey, settingValue: "not-a-number" })).resolves.toMatchObject({ settingValue: "not-a-number" });
  });

  it("rejects an unknown setting key and an empty value", async () => {
    await expect(
      // @ts-expect-error -- deliberately invalid settingKey to verify the zod enum rejects it
      adminCaller.admin.updateStoreSetting({ settingKey: "not-a-real-setting", settingValue: "x" }),
    ).rejects.toThrow();
    await expect(adminCaller.admin.updateStoreSetting({ settingKey: numberKey, settingValue: "   " })).rejects.toThrow();
  });

  it("rejects a non-staff caller", async () => {
    await expect(publicCaller.admin.updateStoreSetting({ settingKey: numberKey, settingValue: "12000" })).rejects.toThrow();
  });
});

// Phase B: the actual checkout-wiring half of the plan -- proves the
// override isn't just stored, it changes what a REAL guest checkout
// charges. Gated on both flags since it touches products/carts/orders
// (COMMERCE_INTEGRATION_TESTS) as well as store_settings.
const runCheckoutWiring = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1";
const maybeDescribeCheckout = runCheckoutWiring ? describe : describe.skip;

// Mirrors checkout.guest.integration.test.ts's own guest-cookie-threading
// pattern exactly: add-to-cart mints a guest cookie via `res.cookie`, and
// checkout must replay that same cookie on the next request to see the item
// that was just added -- two brand-new, cookie-less contexts would each get
// their own empty cart and "Your cart is empty." on checkout.
function makeGuestContext(existingGuestToken?: string): { ctx: TrpcContext; cookiesSet: Record<string, string> } {
  const cookiesSet: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { cookie: existingGuestToken ? `${GUEST_CART_COOKIE_NAME}=${existingGuestToken}` : "" },
      ip: `203.${Math.floor(Math.random() * 200) + 10}.114.9`,
      socket: { remoteAddress: "203.0.114.9" },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => { cookiesSet[name] = value; },
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookiesSet };
}

/** Adds one unit of the throwaway test product to a fresh guest cart, then
 *  places an order against that same cart -- the real 2-request shape a
 *  browser goes through, not a single call. */
async function placeGuestOrder(productId: number, deliveryMethod: "ub_delivery" | "store_pickup") {
  const addCtx = makeGuestContext();
  await appRouter.createCaller(addCtx.ctx).cart.addItem({ productId, quantity: 1 });
  const guestToken = addCtx.cookiesSet[GUEST_CART_COOKIE_NAME];
  const checkoutCtx = makeGuestContext(guestToken);
  return appRouter.createCaller(checkoutCtx.ctx).checkout.createOrder({
    customerName: "Store Settings Test Shopper", customerPhone: "88110001", customerEmail: "store-settings-test@example.invalid", paymentMethod: "cash_on_delivery",
    deliveryMethod, deliveryAddress: deliveryMethod === "ub_delivery" ? "Test address 1" : null, pickupBranch: deliveryMethod === "store_pickup" ? "Орос элчингийн салбар" : null,
  });
}

maybeDescribeCheckout("store-settings checkout wiring integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const marker = `store-settings-checkout-test-${Date.now()}`;
  let categoryId = 0;
  let productId = 0;
  let originalDeliveryFee: string | undefined;
  let originalThreshold: string | undefined;
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const categoryResult = await db.insert(productCategories).values({ name: "Store settings checkout test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Store settings checkout test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 20_000, stockQuantity: 10, isPublished: true });
    productId = Number(productResult[0].insertId);
    await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 20_000, stockQuantity: 10, isDefault: true });

    const before = await adminCaller.admin.storeSettings();
    originalDeliveryFee = before.find(row => row.settingKey === "delivery-fee-ub-mnt")?.settingValue;
    originalThreshold = before.find(row => row.settingKey === "free-shipping-threshold-mnt")?.settingValue;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (originalDeliveryFee !== undefined) await adminCaller.admin.updateStoreSetting({ settingKey: "delivery-fee-ub-mnt", settingValue: originalDeliveryFee });
    else await adminCaller.admin.clearStoreSetting({ settingKey: "delivery-fee-ub-mnt" });
    if (originalThreshold !== undefined) await adminCaller.admin.updateStoreSetting({ settingKey: "free-shipping-threshold-mnt", settingValue: originalThreshold });
    else await adminCaller.admin.clearStoreSetting({ settingKey: "free-shipping-threshold-mnt" });
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  });

  it("charges the admin-overridden delivery fee on a real order, and reverts to the fallback once cleared", async () => {
    await adminCaller.admin.updateStoreSetting({ settingKey: "delivery-fee-ub-mnt", settingValue: "7777" });
    const overriddenOrder = await placeGuestOrder(productId, "ub_delivery");
    createdOrderIds.push(overriddenOrder.id);
    expect(overriddenOrder.deliveryFeeMnt).toBe(7777);
    expect(overriddenOrder.totalMnt).toBe(20_000 + 7777);

    await adminCaller.admin.clearStoreSetting({ settingKey: "delivery-fee-ub-mnt" });
    const fallbackOrder = await placeGuestOrder(productId, "ub_delivery");
    createdOrderIds.push(fallbackOrder.id);
    expect(fallbackOrder.deliveryFeeMnt).toBe(10_000);
  });

  it("zeroes the delivery fee once the subtotal reaches the configured free-shipping threshold", async () => {
    await adminCaller.admin.updateStoreSetting({ settingKey: "free-shipping-threshold-mnt", settingValue: "20000" });
    const order = await placeGuestOrder(productId, "ub_delivery");
    createdOrderIds.push(order.id);
    expect(order.deliveryFeeMnt).toBe(0);
    expect(order.totalMnt).toBe(20_000);
  });

  // Phase C: the confirmation-email + status-message prose is admin-editable
  // too -- proven the same way order-notifications.integration.test.ts
  // proves email content, by spying on console.log (no BREVO_API_KEY in this
  // test run, so every send falls back to a logged line).
  it("sends the admin-overridden confirmation closing line and status message, and reverts to today's wording once cleared", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await adminCaller.admin.updateStoreSetting({ settingKey: "email-order-confirmation-closing", settingValue: "QA OVERRIDE CLOSING LINE" });
      await adminCaller.admin.updateStoreSetting({ settingKey: "email-order-status-confirmed", settingValue: "QA OVERRIDE STATUS MESSAGE" });

      const order = await placeGuestOrder(productId, "store_pickup");
      createdOrderIds.push(order.id);
      const afterConfirmationEmail = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
      expect(afterConfirmationEmail).toContain("QA OVERRIDE CLOSING LINE");
      logSpy.mockClear();

      await adminCaller.admin.updateOrder({ id: order.id, status: "confirmed" });
      const afterStatusEmail = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
      expect(afterStatusEmail).toContain("QA OVERRIDE STATUS MESSAGE");
      logSpy.mockClear();

      await adminCaller.admin.clearStoreSetting({ settingKey: "email-order-confirmation-closing" });
      await adminCaller.admin.clearStoreSetting({ settingKey: "email-order-status-confirmed" });
      const secondOrder = await placeGuestOrder(productId, "store_pickup");
      createdOrderIds.push(secondOrder.id);
      const afterReset = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
      expect(afterReset).toContain("Захиалгынхаа явцыг веб сайтаас харах боломжтой. Худалдан авалт хийсэнд баярлалаа!");
      expect(afterReset).not.toContain("QA OVERRIDE");
    } finally {
      logSpy.mockRestore();
      await adminCaller.admin.clearStoreSetting({ settingKey: "email-order-confirmation-closing" }).catch(() => undefined);
      await adminCaller.admin.clearStoreSetting({ settingKey: "email-order-status-confirmed" }).catch(() => undefined);
    }
  });
});
