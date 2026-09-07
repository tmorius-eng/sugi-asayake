import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { cartItems, carts, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { createOrderFromActiveCart, getAdminProducts, getDb, getPublishedCatalog, updateAdminOrder } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function staffContext(): TrpcContext {
  return {
    user: {
      id: 1, email: "staff-test@example.com", name: "Phase 2 Test Staff", role: "staff",
      emailVerifiedAt: null, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {}, ip: "198.51.100.9", socket: { remoteAddress: "198.51.100.9" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as TrpcContext["res"],
  };
}

// This suite mutates an isolated, timestamp-tagged data set and removes it in afterAll.
// It is intentionally opt-in because it requires a configured development database.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("commerce database integration", () => {
  const marker = `commerce-test-${Date.now()}`;
  let userId = 0;
  let categoryId = 0;
  let publishedProductId = 0;
  let unpublishedProductId = 0;
  let publishedVariantId = 0;
  let createdOrderId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for commerce database integration tests.");

    const userResult = await db.insert(users).values({
      name: "Commerce integration test",
      email: `${marker}@example.invalid`,
      passwordHash: "test:test",
      role: "user",
    });
    userId = Number(userResult[0].insertId);

    const categoryResult = await db.insert(productCategories).values({
      name: "Integration test category",
      slug: `${marker}-category`,
      sortOrder: 99999,
      isActive: true,
    });
    categoryId = Number(categoryResult[0].insertId);

    const publishedResult = await db.insert(products).values({
      categoryId,
      name: "Published integration product",
      slug: `${marker}-published`,
      sku: `${marker}-PUB`,
      priceMnt: 1000,
      stockQuantity: 4,
      isPublished: true,
    });
    publishedProductId = Number(publishedResult[0].insertId);
    // PHASE 2 of product variants: this test bypasses createAdminProduct (it
    // inserts straight into `products`), so it has to create its own default
    // variant too -- that's the row cart/checkout stock actually lives on now.
    const variantResult = await db.insert(productVariants).values({
      productId: publishedProductId,
      sku: `${marker}-PUB`,
      priceMnt: 1000,
      stockQuantity: 4,
      isDefault: true,
    });
    publishedVariantId = Number(variantResult[0].insertId);

    const unpublishedResult = await db.insert(products).values({
      categoryId,
      name: "Unpublished integration product",
      slug: `${marker}-unpublished`,
      sku: `${marker}-UNPUB`,
      priceMnt: 1000,
      stockQuantity: 4,
      isPublished: false,
    });
    unpublishedProductId = Number(unpublishedResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdOrderId) await db.delete(orderItems).where(eq(orderItems.orderId, createdOrderId));
    if (createdOrderId) await db.delete(orders).where(eq(orders.id, createdOrderId));
    if (userId) {
      const testCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId));
      if (testCarts.length) await db.delete(cartItems).where(inArray(cartItems.cartId, testCarts.map(cart => cart.id)));
      await db.delete(carts).where(eq(carts.userId, userId));
    }
    if (publishedProductId || unpublishedProductId) await db.delete(products).where(inArray(products.id, [publishedProductId, unpublishedProductId].filter(Boolean)));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("only exposes published products through the live catalog query", async () => {
    const catalog = await getPublishedCatalog();
    expect(catalog.some(product => product.id === publishedProductId)).toBe(true);
    expect(catalog.some(product => product.id === unpublishedProductId)).toBe(false);
  });

  it("decrements stock on checkout and restores it only once on cancellation", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const cartResult = await db.insert(carts).values({ userId, status: "active" });
    const cartId = Number(cartResult[0].insertId);
    await db.insert(cartItems).values({ cartId, variantId: publishedVariantId, quantity: 2 });

    const order = await createOrderFromActiveCart({
      owner: { userId },
      customerName: "Integration test",
      customerPhone: "00000000",
      deliveryMethod: "store_pickup",
      pickupBranch: "Integration test branch",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderId = order!.id;

    // PHASE 2 of product variants: stock now lives on product_variants, not
    // products -- see createOrderFromActiveCart / the order-cancel restore
    // path in updateAdminOrder.
    const afterCheckout = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, publishedVariantId)).limit(1);
    expect(afterCheckout[0]?.stockQuantity).toBe(2);

    await updateAdminOrder({ id: createdOrderId, status: "cancelled" });
    const afterCancellation = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, publishedVariantId)).limit(1);
    expect(afterCancellation[0]?.stockQuantity).toBe(4);

    await expect(updateAdminOrder({ id: createdOrderId, status: "cancelled" })).rejects.toThrow("closed order");
    const afterRepeatedCancellation = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, publishedVariantId)).limit(1);
    expect(afterRepeatedCancellation[0]?.stockQuantity).toBe(4);
  });

  // Audit finding BUG-004 (2026-09-06): addCartItem already checks
  // isPublished at add-to-cart time, but nothing re-checked it at the
  // actual moment of purchase -- a product added while published, then
  // unpublished by an admin (recalled/mispriced/discontinued) before the
  // shopper checks out, could still be bought successfully. This exercises
  // the exact real-world sequence: add to cart while published -> admin
  // unpublishes -> checkout must fail and leave stock untouched.
  it("refuses to check out a product that was unpublished after it was added to the cart", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const productResult = await db.insert(products).values({
      categoryId,
      name: "Unpublished-mid-cart integration product",
      slug: `${marker}-unpublish-race`,
      sku: `${marker}-UNPUB-RACE`,
      priceMnt: 1000,
      stockQuantity: 4,
      isPublished: true,
    });
    const productId = Number(productResult[0].insertId);
    const variantResult = await db.insert(productVariants).values({
      productId,
      sku: `${marker}-UNPUB-RACE`,
      priceMnt: 1000,
      stockQuantity: 4,
      isDefault: true,
    });
    const variantId = Number(variantResult[0].insertId);

    try {
      const cartResult = await db.insert(carts).values({ userId, status: "active" });
      const cartId = Number(cartResult[0].insertId);
      await db.insert(cartItems).values({ cartId, variantId, quantity: 1 });

      // Simulates an admin pulling the product from sale after it's already
      // sitting in this shopper's cart.
      await db.update(products).set({ isPublished: false }).where(eq(products.id, productId));

      await expect(createOrderFromActiveCart({
        owner: { userId },
        customerName: "Integration test",
        customerPhone: "00000000",
        deliveryMethod: "store_pickup",
        pickupBranch: "Integration test branch",
        paymentMethod: "cash_on_delivery",
      })).rejects.toThrow("no longer available");

      const afterAttempt = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
      expect(afterAttempt[0]?.stockQuantity).toBe(4);
    } finally {
      await db.delete(cartItems).where(eq(cartItems.variantId, variantId));
      const testCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId));
      if (testCarts.length) await db.delete(carts).where(inArray(carts.id, testCarts.map(cart => cart.id)));
      await db.delete(productVariants).where(eq(productVariants.id, variantId));
      await db.delete(products).where(eq(products.id, productId));
    }
  });

  // Project "SUGI Desk" Phase 2 (2026-09-07): field-level permission,
  // end-to-end. commerce.router.test.ts's version of this can't assert
  // persistence (it targets a nonexistent id to avoid a real write) --
  // this is the real create -> staff-edit-with-costMnt -> read-back cycle
  // against a throwaway product, proving the router's `delete
  // input.costMnt` for non-admin callers actually preserves the DB value
  // rather than just type-checking.
  it("preserves a product's admin-set costMnt when a staff session edits the product without permission to touch that field", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const productResult = await db.insert(products).values({
      categoryId,
      name: "Cost-permission integration product",
      slug: `${marker}-cost-permission`,
      sku: `${marker}-COST`,
      priceMnt: 5000,
      costMnt: 3000,
      stockQuantity: 1,
      isPublished: true,
    });
    const productId = Number(productResult[0].insertId);

    try {
      // Staff never sees the real value (admin.products redacts it)...
      const staffCaller = appRouter.createCaller(staffContext());
      const staffView = await staffCaller.admin.products();
      const staffRow = staffView.find(product => product.id === productId);
      expect(staffRow?.costMnt).toBeNull();

      // ...and even an explicit attempt to set one is silently ignored,
      // rather than overwriting the real number admin already entered.
      await staffCaller.admin.updateProduct({ id: productId, costMnt: 999999, name: "Cost-permission integration product (edited)" });

      const afterStaffEdit = await getAdminProducts();
      const persistedRow = afterStaffEdit.find(product => product.id === productId);
      expect(persistedRow?.name).toBe("Cost-permission integration product (edited)"); // the legitimate field DID save
      expect(persistedRow?.costMnt).toBe(3000); // the admin-only field did NOT change
    } finally {
      await db.delete(products).where(eq(products.id, productId));
    }
  });
});
