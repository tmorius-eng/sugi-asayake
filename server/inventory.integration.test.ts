import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { adminAuditLogs, branches, branchStock, cartItems, carts, notificationOutbox, orderItems, orders, productCategories, products, productVariants, stockMovements, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { addCartItem, createOrderFromActiveCart, getDb } from "./db";
import { applyBranchStockDelta } from "./stockLedger";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

/**
 * Receiving goods and stocktakes by barcode scan (2026-09-11, Phase 3), and
 * the warehouse/store branch rules around them. Throwaway branches, product
 * and users only; everything cascades away in afterAll.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("inventory: receiving, counts, warehouse rules", () => {
  const marker = `inv${Date.now().toString(36)}`;
  const ids = { admin: 0, warehouse: 0, staff: 0, staffNoBranch: 0, marketing: 0, customer: 0 };
  let storeId = 0;
  let otherStoreId = 0;
  let warehouseBranchId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const sku = `99${Date.now().toString().slice(-11)}`; // 13-digit, looks like a real barcode
  const orderIds: number[] = [];
  let defaultBranchId = 0;

  function caller(key: keyof typeof ids, role: string) {
    return appRouter.createCaller({
      user: { id: ids[key], email: `${marker}-${key}@example.invalid`, name: `Inventory ${key}`, role, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"],
      req: { protocol: "https", headers: {}, ip: `203.0.180.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.180.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    });
  }
  const admin = () => caller("admin", "admin");
  const warehouse = () => caller("warehouse", "warehouse");
  const staff = () => caller("staff", "staff");

  async function shelf(branchId: number) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [row] = await db.select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).limit(1);
    return row?.quantity ?? 0;
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const [defaultBranch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.isFulfillmentDefault, true)).limit(1);
    defaultBranchId = defaultBranch?.id ?? 0;
    for (const [key, role] of [["admin", "admin"], ["warehouse", "warehouse"], ["staff", "staff"], ["staffNoBranch", "staff"], ["marketing", "marketing"], ["customer", "user"]] as const) {
      ids[key] = Number((await db.insert(users).values({ email: `${marker}-${key}@example.invalid`, passwordHash: await hashPassword("InventoryPassw0rd!"), name: `Inventory ${key}`, role, emailVerifiedAt: new Date() }))[0].insertId);
    }
    storeId = (await admin().admin.createBranch({ name: `${marker} store`, slug: `${marker}-store`, address: "Inventory test store", isActive: true })).id;
    otherStoreId = (await admin().admin.createBranch({ name: `${marker} other`, slug: `${marker}-other`, address: "Inventory test other", isActive: true })).id;
    warehouseBranchId = (await admin().admin.createBranch({ name: `${marker} warehouse`, slug: `${marker}-warehouse`, address: "Inventory test warehouse", isActive: true, kind: "warehouse" })).id;
    await admin().admin.updateUserBranch({ userId: ids.staff, branchId: storeId });
    categoryId = Number((await db.insert(productCategories).values({ name: "Inventory test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "Inventory test product", slug: `${marker}-product`, sku, priceMnt: 10_000, stockQuantity: 0, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku, priceMnt: 10_000, stockQuantity: 0, isDefault: true }))[0].insertId);
    await db.insert(branchStock).values([{ branchId: storeId, variantId, stockQuantity: 0 }, { branchId: warehouseBranchId, variantId, stockQuantity: 0 }]);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    // Belt and braces: whatever happened above, the real online fulfilment
    // branch is the default again before anything is deleted. (A zod-4
    // partial-update bug once let this suite move the default onto a
    // throwaway branch, which then got deleted -- 2026-09-11.)
    if (defaultBranchId) {
      await db.update(branches).set({ isFulfillmentDefault: false }).where(and(eq(branches.isFulfillmentDefault, true), sql`${branches.id} <> ${defaultBranchId}`));
      await db.update(branches).set({ isFulfillmentDefault: true }).where(eq(branches.id, defaultBranchId));
    }
    await db.delete(notificationOutbox).where(or(like(notificationOutbox.message, `%${marker}%`), ...orderIds.map(id => like(notificationOutbox.dedupeKey, `%|order:${id}`))));
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    const customerCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, ids.customer));
    for (const cart of customerCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.userId, ids.customer));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    const branchIds = [storeId, otherStoreId, warehouseBranchId].filter(Boolean);
    if (branchIds.length) await db.delete(branches).where(inArray(branches.id, branchIds));
    const userIds = Object.values(ids).filter(Boolean);
    await db.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorUserId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }, 60_000);

  it("keeps a warehouse off the storefront and out of store pickup", async () => {
    const storefront = await caller("customer", "user").content.branches();
    expect(storefront.map(branch => branch.id)).toContain(storeId);
    expect(storefront.map(branch => branch.id)).not.toContain(warehouseBranchId);
  });

  it("lets marketing edit a branch's address but not where online stock comes from", async () => {
    const marketing = caller("marketing", "marketing");
    await admin().admin.updateBranch({ id: otherStoreId, sortOrder: 77, lowStockThreshold: 3, isActive: false });
    // An update touches only what it was given -- no create-time defaults
    // (sortOrder 0, isActive true) sneaking in for the fields it left out.
    await expect(marketing.admin.updateBranch({ id: otherStoreId, address: "New address" })).resolves.toMatchObject({ address: "New address", sortOrder: 77, lowStockThreshold: 3, isActive: false, isFulfillmentDefault: false, kind: "store" });
    await expect(marketing.admin.updateBranch({ id: otherStoreId, isFulfillmentDefault: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(marketing.admin.updateBranch({ id: otherStoreId, kind: "warehouse" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(marketing.admin.updateBranch({ id: otherStoreId, countsTowardOnlineStock: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a store consultant receive only at their own branch", async () => {
    await expect(staff().inventory.createReceipt({ branchId: otherStoreId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("staffNoBranch", "staff").inventory.createReceipt({ branchId: storeId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const context = await staff().inventory.context();
    expect(context.branches.map(branch => branch.id)).toEqual([storeId]);
    expect(context.canPostCounts).toBe(false);
  });

  it("books a scanned delivery into stock exactly once, on the ledger, and tells the warehouse", async () => {
    const receipt = await staff().inventory.createReceipt({ branchId: storeId, supplierName: `${marker} supplier` });
    expect(receipt.code).toMatch(/^RC-\d{6}-[A-Z0-9]{4}$/);
    const saved = await staff().inventory.saveReceiptLines({ id: receipt.id, lines: [{ code: sku, quantity: 5 }, { code: "4999999999990", quantity: 2 }] });
    expect(saved.unknownCodes).toEqual(["4999999999990"]);
    // Saving the same absolute list again changes nothing.
    await staff().inventory.saveReceiptLines({ id: receipt.id, lines: [{ code: sku, quantity: 5 }, { code: "4999999999990", quantity: 2 }] });

    await expect(staff().inventory.postReceipt({ id: receipt.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const posted = await staff().inventory.postReceipt({ id: receipt.id, skipUnknown: true });
    expect(posted).toMatchObject({ status: "posted", pieces: 5, skippedUnknown: 1 });
    expect(posted.note).toContain("4999999999990×2");
    expect(await shelf(storeId)).toBe(5);
    await expect(staff().inventory.postReceipt({ id: receipt.id, skipUnknown: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await shelf(storeId)).toBe(5);

    const db = await getDb();
    if (!db) throw new Error("no db");
    const movements = await db.select().from(stockMovements).where(and(eq(stockMovements.refType, "receipt"), eq(stockMovements.refId, receipt.id)));
    expect(movements.map(row => [row.type, row.delta, row.actorUserId])).toEqual([["receipt", 5, ids.staff]]);
    const pushes = await db.select().from(notificationOutbox).where(eq(notificationOutbox.dedupeKey, `receipt.posted|receipt:${receipt.id}`));
    expect(pushes.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);
    expect(pushes[0].message).toContain("5 ширхэг");
  });

  it("counts against the shelf as it was at first scan, so a sale mid-count is not wiped out", async () => {
    // Shelf is 5. A consultant starts counting, scans 3 (two are missing).
    const count = await staff().inventory.createCount({ branchId: storeId, scope: "partial" });
    await staff().inventory.saveCountLines({ id: count.id, lines: [{ code: sku, quantity: 3 }] });
    // ...while the count is open, one more sells at the till.
    const db = await getDb();
    if (!db) throw new Error("no db");
    await db.transaction(tx => applyBranchStockDelta(tx, storeId, variantId, -1, { type: "sale_pos", refType: "manual" }));
    expect(await shelf(storeId)).toBe(4);

    await expect(staff().inventory.postCount({ id: count.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await staff().inventory.submitCount({ id: count.id });
    await expect(staff().inventory.saveCountLines({ id: count.id, lines: [{ code: sku, quantity: 9 }] })).rejects.toMatchObject({ code: "CONFLICT" });

    const posted = await warehouse().inventory.postCount({ id: count.id });
    // first scan saw 5, counted 3 -> -2; applied to the current 4 -> 2.
    expect(posted.lines[0]).toMatchObject({ systemQtyAtFirstScan: 5, countedQty: 3, postedDelta: -2 });
    expect(await shelf(storeId)).toBe(2);
  });

  it("zeroes unscanned items on a full count, and keeps opening counts for warehouse/admin", async () => {
    await expect(staff().inventory.createCount({ branchId: storeId, scope: "full", isOpening: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const count = await warehouse().inventory.createCount({ branchId: storeId, scope: "full" });
    const detail = await warehouse().inventory.count({ id: count.id });
    expect(detail.unscanned.map(item => item.variantId)).toContain(variantId);
    const posted = await warehouse().inventory.postCount({ id: count.id });
    expect(posted.adjustedLines).toBeGreaterThanOrEqual(1);
    expect(await shelf(storeId)).toBe(0);
  });

  it("leaves a store out of online stock once it no longer counts, and ships its pickups from the fulfilment branch", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    await db.update(branchStock).set({ stockQuantity: 7 }).where(and(eq(branchStock.branchId, storeId), eq(branchStock.variantId, variantId)));
    if (defaultBranchId) await db.insert(branchStock).values({ branchId: defaultBranchId, variantId, stockQuantity: 4 }).onDuplicateKeyUpdate({ set: { stockQuantity: 4 } });
    await admin().admin.updateBranch({ id: storeId, countsTowardOnlineStock: false });
    const [variant] = await db.select({ stock: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    expect(variant.stock).toBe(defaultBranchId ? 4 : 0); // the store's 7 no longer count

    if (!defaultBranchId) return;
    await addCartItem({ owner: { userId: ids.customer }, variantId, quantity: 1 });
    const order = await createOrderFromActiveCart({ owner: { userId: ids.customer }, customerName: "Inventory Test", customerPhone: "88000001", deliveryMethod: "store_pickup", pickupBranch: `${marker} store`, paymentMethod: "cash_on_delivery" });
    orderIds.push(order.id);
    expect(order.fulfillingBranchId).toBe(defaultBranchId);
    expect(order.pickupBranch).toBe(`${marker} store`);
    expect(await shelf(storeId)).toBe(7);

    await expect(createOrderFromActiveCart({ owner: { userId: ids.customer }, customerName: "Inventory Test", customerPhone: "88000001", deliveryMethod: "store_pickup", pickupBranch: `${marker} warehouse`, paymentMethod: "cash_on_delivery" })).rejects.toThrow();
  });

  it("refuses to make a non-counting or inactive branch the online fulfilment branch", async () => {
    await expect(admin().admin.updateBranch({ id: storeId, isFulfillmentDefault: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
