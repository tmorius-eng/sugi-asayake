import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { cartItems, carts, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { createOrderFromActiveCart, getDb, getPublishedCatalog, updateAdminOrder } from "./db";

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
});
