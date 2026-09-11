import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { adminAuditLogs, branches, branchStock, cartItems, carts, notificationOutbox, orderItems, orders, productCategories, products, productVariants, stockMovements, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { addCartItem, createOrderFromActiveCart, deleteBranch, getDb, updateAdminOrder } from "./db";
import { getStockLedgerDrift, recordStockMovement } from "./stockLedger";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

/**
 * The stock movement ledger (2026-09-11, migration 0063): every branch_stock
 * change is recorded in the same transaction, the ledger always sums to the
 * shelf, and the guarded decrements stay race-proof. Throwaway branch,
 * product and users, all deleted in afterAll (movements cascade with them).
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("stock movement ledger", () => {
  const marker = `led${Date.now().toString(36)}`;
  const adminEmail = `${marker}-admin@example.invalid`;
  const customerEmail = `${marker}-customer@example.invalid`;
  let adminId = 0;
  let customerId = 0;
  let branchId = 0;
  let branchName = "";
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const orderIds: number[] = [];

  const adminCaller = () => appRouter.createCaller({
    user: { id: adminId, email: adminEmail, name: "Ledger Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"],
    req: { protocol: "https", headers: {}, ip: `203.0.170.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.170.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  });

  async function movements() {
    const db = await getDb();
    if (!db) throw new Error("no db");
    return db.select().from(stockMovements).where(and(eq(stockMovements.branchId, branchId), eq(stockMovements.variantId, variantId))).orderBy(asc(stockMovements.id));
  }
  async function shelf() {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [row] = await db.select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).limit(1);
    return row?.quantity ?? 0;
  }
  const ledgerSum = async () => (await movements()).reduce((sum, row) => sum + row.delta, 0);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    adminId = Number((await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("LedgerPassw0rd!"), name: "Ledger Test Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    customerId = Number((await db.insert(users).values({ email: customerEmail, passwordHash: await hashPassword("LedgerPassw0rd!"), name: "Ledger Test Customer", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    branchName = `${marker} салбар`;
    const branch = await adminCaller().admin.createBranch({ name: branchName, slug: `${marker}-branch`, address: "Ledger test address", isActive: true });
    branchId = branch.id;
    categoryId = Number((await db.insert(productCategories).values({ name: "Ledger test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "Ledger test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 0, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 0, isDefault: true }))[0].insertId);
    // Enrolled in per-branch tracking at our throwaway branch, starting empty.
    await db.insert(branchStock).values({ branchId, variantId, stockQuantity: 0 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(notificationOutbox).where(or(...orderIds.map(id => like(notificationOutbox.dedupeKey, `%|order:${id}`))));
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    const customerCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, customerId));
    for (const cart of customerCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.userId, customerId));
    // Product -> variant -> branch_stock + stock_movements all cascade.
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (branchId) await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    for (const id of [adminId, customerId]) if (id) await db.delete(users).where(eq(users.id, id));
  });

  it("records a manual count as the difference, with who and why", async () => {
    await adminCaller().admin.setBranchStock({ branchId, variantId, quantity: 4, note: "Тооллогоор засав" });
    await adminCaller().admin.setBranchStock({ branchId, variantId, quantity: 4 }); // no change -> no row
    const rows = await movements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "admin_set", delta: 4, balanceAfter: 4, actorUserId: adminId, note: "Тооллогоор засав", sku: `${marker}-SKU` });
  });

  it("records an in-store sale against its order, then refuses to oversell under concurrency", async () => {
    const sale = await adminCaller().admin.recordInStoreSale({ branchId, items: [{ variantId, quantity: 1 }] });
    orderIds.push(sale.id);
    const last = (await movements()).at(-1)!;
    expect(last).toMatchObject({ type: "sale_pos", delta: -1, balanceAfter: 3, refType: "order", refId: sale.id, actorUserId: adminId });

    // 3 left; 5 cashiers ring up one each at the same moment.
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => adminCaller().admin.recordInStoreSale({ branchId, items: [{ variantId, quantity: 1 }] })));
    for (const result of results) if (result.status === "fulfilled") orderIds.push(result.value.id);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(3);
    expect(await shelf()).toBe(0);
    expect(await ledgerSum()).toBe(0);
  });

  it("records an online sale and its cancellation as a pair that nets to zero", async () => {
    await adminCaller().admin.setBranchStock({ branchId, variantId, quantity: 5 });
    await addCartItem({ owner: { userId: customerId }, variantId, quantity: 2 });
    const order = await createOrderFromActiveCart({ owner: { userId: customerId }, customerName: "Ledger Test", customerPhone: "88000000", deliveryMethod: "store_pickup", pickupBranch: branchName, paymentMethod: "cash_on_delivery" });
    orderIds.push(order.id);
    await updateAdminOrder({ id: order.id, status: "cancelled", actorUserId: adminId });
    const forOrder = (await movements()).filter(row => row.refId === order.id);
    expect(forOrder.map(row => [row.type, row.delta, row.balanceAfter])).toEqual([["sale_online", -2, 3], ["order_restock", 2, 5]]);
    expect(forOrder[1].actorUserId).toBe(adminId);
    expect(await shelf()).toBe(5);
    expect(await ledgerSum()).toBe(5);
  });

  it("shows a change made behind the ledger's back as drift, and a rebaseline movement closes it", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    // What the other laptop's pre-ledger code would do.
    await db.update(branchStock).set({ stockQuantity: 7 }).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId)));
    const mine = (await getStockLedgerDrift(db, 100_000)).examples.find(row => row.branchId === branchId && row.variantId === variantId);
    expect(mine).toEqual({ branchId, variantId, shelf: 7, ledger: 5 });
    await recordStockMovement(db, branchId, variantId, 2, { type: "rebaseline", refType: "manual" });
    expect((await getStockLedgerDrift(db, 100_000)).examples.find(row => row.branchId === branchId && row.variantId === variantId)).toBeUndefined();
  });

  it("refuses to delete a branch that holds stock or history (deactivate instead)", async () => {
    await expect(deleteBranch(branchId)).rejects.toThrow(/идэвхгүй/);
    await expect(adminCaller().admin.stockMovements({ variantId })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ branchName, type: "rebaseline" })]));
  });
});
