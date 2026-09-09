import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { GUEST_CART_COOKIE_NAME } from "../shared/const";
import { branches, branchStock, orderItems, orders, productCategories, products, productVariants } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// "Controls everything" admin overhaul (2026-09-08, Phase K/L). Proves the
// real per-branch split: writing to one branch's stock updates the
// variant's cached total correctly, a pickup order against a branch with
// insufficient BRANCH-LEVEL stock is rejected even though the aggregate
// total would cover it, and a delivery order only ever touches the
// fulfillment-default branch.
const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1, email: "owner@example.com", name: "Branch Stock Integration Admin", role: "admin",
      emailVerifiedAt: null, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function makeGuestContext(existingGuestToken?: string): { ctx: TrpcContext; cookiesSet: Record<string, string> } {
  const cookiesSet: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: { cookie: existingGuestToken ? `${GUEST_CART_COOKIE_NAME}=${existingGuestToken}` : "" }, ip: `203.${Math.floor(Math.random() * 200) + 10}.118.9`, socket: { remoteAddress: "203.0.118.9" } } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { cookiesSet[name] = value; }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return { ctx, cookiesSet };
}

maybeDescribe("branch stock integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const marker = `branch-stock-test-${Date.now()}`;
  let branchAId = 0; // fulfillment default
  let branchBId = 0; // secondary, pickup-only
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const createdOrderIds: number[] = [];
  // Snapshot-and-restore (same discipline as site-text.integration.test.ts
  // and branches.integration.test.ts's own "keeps isFulfillmentDefault
  // exclusive" test): creating branchA below with isFulfillmentDefault:true
  // clears that flag from every OTHER real branch too (that's the actual
  // production behavior, exactly what's under test here) -- so whichever
  // real branch currently holds it must be captured now and restored in
  // afterAll, or this suite would silently break real checkout/fulfilment
  // routing for the shared dev database (this exact bug happened once
  // already during this session and had to be manually repaired on Aiven).
  let previousRealDefaultBranchId: number | null = null;

  async function placeOrder(deliveryMethod: "ub_delivery" | "store_pickup", pickupBranchName?: string) {
    const addCtx = makeGuestContext();
    await appRouter.createCaller(addCtx.ctx).cart.addItem({ productId, quantity: 1 });
    const guestToken = addCtx.cookiesSet[GUEST_CART_COOKIE_NAME];
    const checkoutCtx = makeGuestContext(guestToken);
    return appRouter.createCaller(checkoutCtx.ctx).checkout.createOrder({
      customerName: "Branch Stock Test Shopper", customerPhone: "88110004", customerEmail: "branch-stock-test@example.invalid",
      paymentMethod: "cash_on_delivery", deliveryMethod,
      deliveryAddress: deliveryMethod === "ub_delivery" ? "Test address 1" : null,
      pickupBranch: deliveryMethod === "store_pickup" ? pickupBranchName : null,
    });
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const beforeBranches = await adminCaller.admin.branches();
    previousRealDefaultBranchId = beforeBranches.find(b => b.isFulfillmentDefault)?.id ?? null;

    const branchA = await adminCaller.admin.createBranch({ name: `${marker} Branch A (fulfillment)`, slug: `${marker}-a`, address: "Test address A", isActive: true, isFulfillmentDefault: true });
    branchAId = branchA.id;
    const branchB = await adminCaller.admin.createBranch({ name: `${marker} Branch B (pickup only)`, slug: `${marker}-b`, address: "Test address B", isActive: true, isFulfillmentDefault: false });
    branchBId = branchB.id;

    const categoryResult = await db.insert(productCategories).values({ name: "Branch stock test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    // Created via the real admin write path (not a raw db.insert) so this
    // variant gets branch_stock rows seeded across every active branch --
    // including the 2 throwaway branches just created above -- exactly
    // like a real admin adding a new product would.
    const created = await adminCaller.admin.createProduct({
      categoryId, name: "Branch stock test product", slug: `${marker}-product`, sku: `${marker}-SKU`,
      priceMnt: 10_000, stockQuantity: 10, isPublished: true,
    });
    productId = created.id;
    const variants = await adminCaller.admin.productVariants({ productId });
    variantId = variants[0].id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (branchAId) await db.delete(branches).where(eq(branches.id, branchAId));
    if (branchBId) await db.delete(branches).where(eq(branches.id, branchBId));
    // Restore whichever real branch was the fulfillment default before this
    // suite ever ran -- see the beforeAll comment above.
    if (previousRealDefaultBranchId) await adminCaller.admin.updateBranch({ id: previousRealDefaultBranchId, isFulfillmentDefault: true });
  });

  it("creating a product via the real admin path seeds branch_stock across every active branch, all at the fulfillment-default branch", async () => {
    const stockRows = await adminCaller.admin.branchStock({ variantId });
    const branchARow = stockRows.find(row => row.branchId === branchAId);
    const branchBRow = stockRows.find(row => row.branchId === branchBId);
    expect(branchARow?.stockQuantity).toBe(10);
    expect(branchBRow?.stockQuantity).toBe(0);
  });

  it("writing to one branch's stock updates the variant's cached total (and the single-variant product's mirror) correctly", async () => {
    await adminCaller.admin.setBranchStock({ branchId: branchBId, variantId, quantity: 4 });
    const stockRows = await adminCaller.admin.branchStock({ variantId });
    expect(stockRows.find(row => row.branchId === branchBId)?.stockQuantity).toBe(4);

    const variants = await adminCaller.admin.productVariants({ productId });
    expect(variants[0].stockQuantity).toBe(14); // 10 (branch A) + 4 (branch B)

    const productRow = await adminCaller.admin.products();
    expect(productRow.find(p => p.id === productId)?.stockQuantity).toBe(14);
  });

  it("rejects a pickup order at a branch with insufficient BRANCH-LEVEL stock, even though the aggregate total covers it", async () => {
    // Branch B currently has 4 (from the previous test); branch A has 10 --
    // aggregate is 14, plenty for a 1-unit order, but asking for MORE than
    // branch B's own 4 at branch B specifically must still fail.
    await adminCaller.admin.setBranchStock({ branchId: branchBId, variantId, quantity: 0 });
    await expect(placeOrder("store_pickup", `${marker} Branch B (pickup only)`)).rejects.toThrow(/at the selected branch/i);

    // The aggregate must be untouched by the rejected attempt.
    const variants = await adminCaller.admin.productVariants({ productId });
    expect(variants[0].stockQuantity).toBe(10); // 10 (branch A) + 0 (branch B)
  });

  it("a delivery order only ever decrements the fulfillment-default branch, never the pickup-only one", async () => {
    await adminCaller.admin.setBranchStock({ branchId: branchBId, variantId, quantity: 3 });
    const order = await placeOrder("ub_delivery");
    createdOrderIds.push(order.id);
    expect(order.fulfillingBranchId).toBe(branchAId);

    const stockRows = await adminCaller.admin.branchStock({ variantId });
    expect(stockRows.find(row => row.branchId === branchAId)?.stockQuantity).toBe(9); // 10 - 1
    expect(stockRows.find(row => row.branchId === branchBId)?.stockQuantity).toBe(3); // untouched
  });

  it("a pickup order at a branch with enough stock succeeds and decrements ONLY that branch", async () => {
    const order = await placeOrder("store_pickup", `${marker} Branch B (pickup only)`);
    createdOrderIds.push(order.id);
    expect(order.fulfillingBranchId).toBe(branchBId);

    const stockRows = await adminCaller.admin.branchStock({ variantId });
    expect(stockRows.find(row => row.branchId === branchAId)?.stockQuantity).toBe(9); // untouched by this order
    expect(stockRows.find(row => row.branchId === branchBId)?.stockQuantity).toBe(2); // 3 - 1
  });

  it("cancelling an order restores stock to the SPECIFIC branch it was actually taken from, not the current fulfillment default", async () => {
    // Reassign the fulfillment default to branch B, THEN cancel the
    // delivery order that was originally fulfilled from branch A -- if
    // restoration re-derived "the current default" instead of reading the
    // order's own captured fulfillingBranchId, this would incorrectly
    // credit branch B instead of branch A.
    await adminCaller.admin.updateBranch({ id: branchAId, isFulfillmentDefault: false });
    await adminCaller.admin.updateBranch({ id: branchBId, isFulfillmentDefault: true });
    try {
      const deliveryOrderId = createdOrderIds[0]; // the ub_delivery order from branch A
      await adminCaller.admin.updateOrder({ id: deliveryOrderId, status: "cancelled" });
      const stockRows = await adminCaller.admin.branchStock({ variantId });
      expect(stockRows.find(row => row.branchId === branchAId)?.stockQuantity).toBe(10); // 9 + 1 restored, back to original
      expect(stockRows.find(row => row.branchId === branchBId)?.stockQuantity).toBe(2); // untouched by this restore
    } finally {
      await adminCaller.admin.updateBranch({ id: branchAId, isFulfillmentDefault: true });
      await adminCaller.admin.updateBranch({ id: branchBId, isFulfillmentDefault: false });
    }
  });
});
