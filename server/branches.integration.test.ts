import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, inArray, like } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { GUEST_CART_COOKIE_NAME } from "../shared/const";
import { branches, orderItems, orders, productCategories, products, productVariants } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// "Controls everything" admin overhaul (2026-09-08, Phase J). Same marker-
// prefixed-throwaway-row convention as every other integration suite here.
const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;

function createAdminContext(): TrpcContext {
  return {
    user: testSessionUser({
      id: 1, email: "owner@example.com", name: "Branches Integration Admin", role: "admin",
      emailVerifiedAt: null, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    }),
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

maybeDescribe("managed branches integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const publicCaller = appRouter.createCaller({ ...createAdminContext(), user: null });
  const marker = `branches-test-${Date.now()}`;
  const createdIds: number[] = [];

  afterEach(async () => {
    // Each test creates its own throwaway rows and cleans them up itself
    // (see individual `it` blocks) -- this only catches anything left
    // behind by a failed assertion mid-test.
    const db = await getDb();
    if (!db || !createdIds.length) return;
    await db.delete(branches).where(inArray(branches.id, createdIds));
    createdIds.length = 0;
  });

  it("creates a branch, exposes it via the public query (active) or hides it (inactive), and removes it on delete", async () => {
    const created = await adminCaller.admin.createBranch({ name: `${marker} Branch A`, slug: `${marker}-a`, address: "Test address 1", isActive: true });
    createdIds.push(created.id);
    const activePublicList = await publicCaller.content.branches();
    expect(activePublicList.some(row => row.id === created.id)).toBe(true);

    const updated = await adminCaller.admin.updateBranch({ id: created.id, isActive: false });
    expect(updated.isActive).toBe(false);
    const afterDeactivatePublicList = await publicCaller.content.branches();
    expect(afterDeactivatePublicList.some(row => row.id === created.id)).toBe(false);
    // But the admin list still sees it (inactive branches stay manageable).
    const adminList = await adminCaller.admin.branches();
    expect(adminList.some(row => row.id === created.id)).toBe(true);

    await adminCaller.admin.deleteBranch({ id: created.id });
    createdIds.splice(createdIds.indexOf(created.id), 1);
    const afterDeleteAdminList = await adminCaller.admin.branches();
    expect(afterDeleteAdminList.some(row => row.id === created.id)).toBe(false);
  });

  it("keeps isFulfillmentDefault exclusive to at most one branch", async () => {
    // Snapshot-and-restore (site-text.integration.test.ts's own discipline):
    // setting isFulfillmentDefault:true on a throwaway branch clears it from
    // EVERY other real branch row too (that's the exact behavior under
    // test) -- so whichever real branch currently holds it must be restored
    // afterward, or this test would silently break real checkout/fulfilment
    // routing for the shared dev database.
    const before = await adminCaller.admin.branches();
    const previousDefault = before.find(row => row.isFulfillmentDefault);
    try {
      const first = await adminCaller.admin.createBranch({ name: `${marker} Branch B1`, slug: `${marker}-b1`, address: "Test address 1", isFulfillmentDefault: true });
      createdIds.push(first.id);
      const second = await adminCaller.admin.createBranch({ name: `${marker} Branch B2`, slug: `${marker}-b2`, address: "Test address 2", isFulfillmentDefault: true });
      createdIds.push(second.id);

      const firstAfter = await adminCaller.admin.branches().then(list => list.find(row => row.id === first.id));
      const secondAfter = await adminCaller.admin.branches().then(list => list.find(row => row.id === second.id));
      expect(firstAfter?.isFulfillmentDefault).toBe(false);
      expect(secondAfter?.isFulfillmentDefault).toBe(true);
    } finally {
      if (previousDefault) await adminCaller.admin.updateBranch({ id: previousDefault.id, isFulfillmentDefault: true });
    }
  });

  it("rejects a non-staff caller", async () => {
    await expect(publicCaller.admin.createBranch({ name: "x", slug: `${marker}-forbidden`, address: "y" })).rejects.toThrow();
  });
});

// Phase J checkout wiring: proves the real, previously-undiscovered bug is
// actually fixed -- a branch can be selected at checkout the instant it's
// created via admin (no hardcoded enum to update/deploy), and an inactive
// or nonexistent branch name is rejected by the real authority
// (createOrderFromActiveCart), not a stale client-side list.
const runCheckoutWiring = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1";
const maybeDescribeCheckout = runCheckoutWiring ? describe : describe.skip;

function makeGuestContext(existingGuestToken?: string): { ctx: TrpcContext; cookiesSet: Record<string, string> } {
  const cookiesSet: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: { cookie: existingGuestToken ? `${GUEST_CART_COOKIE_NAME}=${existingGuestToken}` : "" }, ip: `203.${Math.floor(Math.random() * 200) + 10}.117.9`, socket: { remoteAddress: "203.0.117.9" } } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { cookiesSet[name] = value; }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return { ctx, cookiesSet };
}

async function placePickupOrder(productId: number, pickupBranch: string) {
  const addCtx = makeGuestContext();
  await appRouter.createCaller(addCtx.ctx).cart.addItem({ productId, quantity: 1 });
  const guestToken = addCtx.cookiesSet[GUEST_CART_COOKIE_NAME];
  const checkoutCtx = makeGuestContext(guestToken);
  return appRouter.createCaller(checkoutCtx.ctx).checkout.createOrder({
    customerName: "Branches Checkout Test Shopper", customerPhone: "88110003", customerEmail: "branches-checkout-test@example.invalid",
    paymentMethod: "cash_on_delivery", deliveryMethod: "store_pickup", pickupBranch,
  });
}

maybeDescribeCheckout("branches checkout wiring integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const marker = `branches-checkout-test-${Date.now()}`;
  let branchId = 0;
  let categoryId = 0;
  let productId = 0;
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const branch = await adminCaller.admin.createBranch({ name: `${marker} Pickup Branch`, slug: `${marker}-pickup`, address: "Test pickup address", isActive: true });
    branchId = branch.id;
    const categoryResult = await db.insert(productCategories).values({ name: "Branches checkout test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Branches checkout test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isPublished: true });
    productId = Number(productResult[0].insertId);
    await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isDefault: true });
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
    if (branchId) await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(branches).where(like(branches.slug, `${marker}%`));
  });

  it("accepts pickup at a real, active, freshly-admin-created branch -- no enum/deploy needed", async () => {
    const order = await placePickupOrder(productId, `${marker} Pickup Branch`);
    createdOrderIds.push(order.id);
    expect(order.pickupBranch).toBe(`${marker} Pickup Branch`);
  });

  it("rejects a pickup branch name that doesn't match any active branch", async () => {
    await expect(placePickupOrder(productId, "Not A Real Branch")).rejects.toThrow(/Авах салбараа зөв сонгоно уу/);
  });

  it("rejects pickup at a branch that has since been deactivated", async () => {
    await adminCaller.admin.updateBranch({ id: branchId, isActive: false });
    try {
      await expect(placePickupOrder(productId, `${marker} Pickup Branch`)).rejects.toThrow(/Авах салбараа зөв сонгоно уу/);
    } finally {
      await adminCaller.admin.updateBranch({ id: branchId, isActive: true });
    }
  });
});
