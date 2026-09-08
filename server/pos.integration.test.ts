import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { branches, branchStock, orderItems, orders, productCategories, products, productVariants } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// "Controls everything" admin overhaul (2026-09-08, Phase M). Same
// marker-prefixed-throwaway-row convention as every other integration
// suite in this project.
const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;

function callerFor(role: "warehouse" | "admin" | "marketing" | "finance"): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: {
      id: 1, email: "pos-test@example.invalid", name: "POS Test User", role,
      emailVerifiedAt: null, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

maybeDescribe("POS in-person sale integration", () => {
  const warehouseCaller = callerFor("warehouse");
  const adminCaller = callerFor("admin");
  const marker = `pos-test-${Date.now()}`;
  let branchId = 0;
  let otherBranchId = 0;
  let categoryId = 0;
  let publishedProductId = 0;
  let publishedVariantId = 0;
  let unpublishedProductId = 0;
  let unpublishedVariantId = 0;
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");

    const branch = await adminCaller.admin.createBranch({ name: `${marker} Branch`, slug: `${marker}-branch`, address: "Test POS address", isActive: true });
    branchId = branch.id;
    const otherBranch = await adminCaller.admin.createBranch({ name: `${marker} Other Branch`, slug: `${marker}-other-branch`, address: "Test other address", isActive: true });
    otherBranchId = otherBranch.id;

    const categoryResult = await db.insert(productCategories).values({ name: "POS test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);

    const publishedProduct = await db.insert(products).values({ categoryId, name: "POS test product (published)", slug: `${marker}-published`, sku: `${marker}-PUB`, priceMnt: 12_000, stockQuantity: 0, isPublished: true });
    publishedProductId = Number(publishedProduct[0].insertId);
    const publishedVariant = await db.insert(productVariants).values({ productId: publishedProductId, sku: `${marker}-PUB`, priceMnt: 12_000, stockQuantity: 0, isDefault: true });
    publishedVariantId = Number(publishedVariant[0].insertId);
    await db.insert(branchStock).values([
      { branchId, variantId: publishedVariantId, stockQuantity: 5 },
      { branchId: otherBranchId, variantId: publishedVariantId, stockQuantity: 9 },
    ]);

    // Unpublished on purpose -- proves POS can sell a physical shelf item
    // regardless of its online-publish flag (unlike checkout).
    const unpublishedProduct = await db.insert(products).values({ categoryId, name: "POS test product (unpublished)", slug: `${marker}-unpublished`, sku: `${marker}-UNPUB`, priceMnt: 8_000, stockQuantity: 0, isPublished: false });
    unpublishedProductId = Number(unpublishedProduct[0].insertId);
    const unpublishedVariant = await db.insert(productVariants).values({ productId: unpublishedProductId, sku: `${marker}-UNPUB`, priceMnt: 8_000, stockQuantity: 0, isDefault: true });
    unpublishedVariantId = Number(unpublishedVariant[0].insertId);
    await db.insert(branchStock).values({ branchId, variantId: unpublishedVariantId, stockQuantity: 3 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (publishedProductId) await db.delete(products).where(eq(products.id, publishedProductId));
    if (unpublishedProductId) await db.delete(products).where(eq(products.id, unpublishedProductId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (branchId) await db.delete(branches).where(eq(branches.id, branchId));
    if (otherBranchId) await db.delete(branches).where(eq(branches.id, otherBranchId));
  });

  it("records a real, queryable order with correct line items/total, and decrements the exact branch's stock only", async () => {
    const order = await warehouseCaller.admin.recordInStoreSale({
      branchId,
      items: [{ variantId: publishedVariantId, quantity: 2 }],
      customerName: "POS Test Walk-in",
    });
    createdOrderIds.push(order.id);

    expect(order.paymentMethod).toBe("in_store");
    expect(order.paymentStatus).toBe("paid");
    expect(order.status).toBe("completed");
    expect(order.salesChannel).toBe("in_store");
    expect(order.fulfillingBranchId).toBe(branchId);
    expect(order.totalMnt).toBe(24_000); // 12,000 x 2

    const items = await warehouseCaller.admin.orders();
    const persisted = items.find(o => o.id === order.id);
    expect(persisted).toBeTruthy();

    const stockRows = await warehouseCaller.admin.branchStock({ variantId: publishedVariantId });
    expect(stockRows.find(row => row.branchId === branchId)?.stockQuantity).toBe(3); // 5 - 2
    expect(stockRows.find(row => row.branchId === otherBranchId)?.stockQuantity).toBe(9); // untouched
  });

  it("sells an unpublished product's real physical stock (unlike checkout, which would reject it)", async () => {
    const order = await warehouseCaller.admin.recordInStoreSale({
      branchId,
      items: [{ variantId: unpublishedVariantId, quantity: 1 }],
    });
    createdOrderIds.push(order.id);
    expect(order.totalMnt).toBe(8_000);

    const stockRows = await warehouseCaller.admin.branchStock({ variantId: unpublishedVariantId });
    expect(stockRows.find(row => row.branchId === branchId)?.stockQuantity).toBe(2); // 3 - 1
  });

  it("rejects a sale that exceeds the branch's real stock", async () => {
    await expect(warehouseCaller.admin.recordInStoreSale({
      branchId,
      items: [{ variantId: publishedVariantId, quantity: 999 }],
    })).rejects.toThrow(/no longer available/i);
  });

  it("keeps recording sales warehouse/admin-only -- marketing and finance are forbidden", async () => {
    await expect(callerFor("marketing").admin.recordInStoreSale({ branchId, items: [{ variantId: publishedVariantId, quantity: 1 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("finance").admin.recordInStoreSale({ branchId, items: [{ variantId: publishedVariantId, quantity: 1 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("marketing").admin.posSearchVariants({ branchId, search: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
