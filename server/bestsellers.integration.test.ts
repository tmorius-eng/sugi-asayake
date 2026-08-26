import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, productCategories, products } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// Home.tsx "Их зарагддаг бараа" rail (matsukiyococokara-online.com-оос
// санаа авсан bestseller ranking, 2026-08-26) — getBestsellingProducts.
// Opt-in against a real database, same convention as
// catalog-search.integration.test.ts: real order/order_items aggregation
// can only be verified against real MySQL, not mocked.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: "203.0.113.44", socket: { remoteAddress: "203.0.113.44" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("bestselling products integration", () => {
  const marker = `bstlr-${Date.now().toString(36)}`;
  let categoryId = 0;
  let bigSellerId = 0;
  let smallSellerId = 0;
  let unpaidOnlyId = 0;
  let unpublishedBestsellerId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for bestseller integration tests.");

    const categoryResult = await db.insert(productCategories).values({ name: "Bestseller test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);

    const insertProduct = async (suffix: string, isPublished: boolean) => {
      const inserted = await db.insert(products).values({
        categoryId, name: `Bestseller Test Product ${suffix}`, slug: `${marker}-${suffix}`, sku: `${marker}-SKU-${suffix}`,
        priceMnt: 10_000, stockQuantity: 50, isPublished,
      });
      return Number(inserted[0].insertId);
    };
    bigSellerId = await insertProduct("big", true);
    smallSellerId = await insertProduct("small", true);
    unpaidOnlyId = await insertProduct("unpaid", true);
    unpublishedBestsellerId = await insertProduct("hidden", false);

    const insertPaidOrder = async (suffix: string, productId: number, quantity: number) => {
      const orderInsert = await db.insert(orders).values({
        orderNumber: `${marker}-${suffix}`, status: "completed", paymentStatus: "paid", paymentMethod: "cash_on_delivery",
        deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Bestseller Test Shopper",
        customerPhone: "99001122", subtotalMnt: 10_000 * quantity, totalMnt: 10_000 * quantity,
      });
      const orderId = Number(orderInsert[0].insertId);
      orderIds.push(orderId);
      await db.insert(orderItems).values({ orderId, productId, productName: "Bestseller Test Product", sku: `${marker}-sku-${suffix}`, unitPriceMnt: 10_000, quantity });
      return orderId;
    };

    // Big seller: 5 + 4 = 9 units across two separate paid orders (also
    // proves quantities are summed across orders, not just taken from one).
    await insertPaidOrder("big-1", bigSellerId, 5);
    await insertPaidOrder("big-2", bigSellerId, 4);
    // Small seller: 1 unit, one paid order.
    await insertPaidOrder("small-1", smallSellerId, 1);
    // Unpublished product outsells everything, but must never surface.
    await insertPaidOrder("hidden-1", unpublishedBestsellerId, 20);

    // Unpaid order for a product with no paid history at all — must not count.
    const unpaidOrderInsert = await db.insert(orders).values({
      orderNumber: `${marker}-unpaid`, status: "pending", paymentStatus: "unpaid", paymentMethod: "cash_on_delivery",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Bestseller Test Shopper",
      customerPhone: "99001122", subtotalMnt: 30_000, totalMnt: 30_000,
    });
    const unpaidOrderId = Number(unpaidOrderInsert[0].insertId);
    orderIds.push(unpaidOrderId);
    await db.insert(orderItems).values({ orderId: unpaidOrderId, productId: unpaidOnlyId, productName: "Bestseller Test Product", sku: `${marker}-sku-unpaid`, unitPriceMnt: 10_000, quantity: 3 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const orderId of orderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    for (const id of [bigSellerId, smallSellerId, unpaidOnlyId, unpublishedBestsellerId]) {
      if (id) await db.delete(products).where(eq(products.id, id));
    }
    // Belt-and-suspenders: delete by categoryId too, not just the 4 known
    // ids above -- under the full test suite (many files hitting the same
    // MySQL instance concurrently) the category delete below intermittently
    // hit products_categoryId_product_categories_id_fk even though every id
    // above had already been deleted one line up, which this can't explain
    // away but does make moot: nothing can still reference categoryId by the
    // time this runs, so the delete after it is never blocked.
    if (categoryId) await db.delete(products).where(eq(products.categoryId, categoryId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  });

  it("ranks a product with more paid units sold above one with fewer, summed across separate orders", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.bestsellers();
    const big = results.find(item => item.id === bigSellerId);
    const small = results.find(item => item.id === smallSellerId);
    expect(big).toBeDefined();
    expect(big?.soldQuantity).toBe(9);
    expect(small?.soldQuantity).toBe(1);
    expect(results.findIndex(item => item.id === bigSellerId)).toBeLessThan(results.findIndex(item => item.id === smallSellerId));
  });

  it("never counts quantity from an unpaid order", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.bestsellers();
    expect(results.map(item => item.id)).not.toContain(unpaidOnlyId);
  });

  it("never surfaces an unpublished product, no matter how many paid units it sold", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.bestsellers();
    expect(results.map(item => item.id)).not.toContain(unpublishedBestsellerId);
  });
});
