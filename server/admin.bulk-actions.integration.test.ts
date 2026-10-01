import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// TIER 5: bulk product-publish / order-status endpoints against a real
// database — specifically the partial-success bookkeeping (one bad id in
// the batch shouldn't sink the rest) and that each successful item is still
// individually audit-logged like a normal single update.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "198.51.100.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("admin bulk actions integration", () => {
  // orders.orderNumber is varchar(32) — keep this short.
  const marker = `bulk-${Date.now()}`;
  let adminUserId = 0;
  let categoryId = 0;
  let productAId = 0;
  let productBId = 0;
  let pendingOrderId = 0;
  let completedOrderId = 0;
  let adminCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for admin bulk actions integration tests.");

    const adminInsert = await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Bulk Actions Admin", role: "admin", emailVerifiedAt: new Date() });
    adminUserId = Number(adminInsert[0].insertId);
    adminCaller = callerFor(testSessionUser({ id: adminUserId, email: `${marker}-admin@example.invalid`, name: "Bulk Actions Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));

    const categoryInsert = await db.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category` });
    categoryId = Number(categoryInsert[0].insertId);

    const productAInsert = await db.insert(products).values({ categoryId, name: `${marker} product A`, slug: `${marker}-product-a`, sku: `${marker}-A`, priceMnt: 1000, stockQuantity: 5, isPublished: false });
    productAId = Number(productAInsert[0].insertId);
    const productBInsert = await db.insert(products).values({ categoryId, name: `${marker} product B`, slug: `${marker}-product-b`, sku: `${marker}-B`, priceMnt: 2000, stockQuantity: 5, isPublished: false });
    productBId = Number(productBInsert[0].insertId);

    const pendingOrderInsert = await db.insert(orders).values({ orderNumber: `${marker}-PENDING`, status: "pending", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", deliveryMethod: "store_pickup", pickupBranch: "Test branch", customerName: "Bulk Test Customer", customerPhone: "88110000", subtotalMnt: 1000, totalMnt: 1000 });
    pendingOrderId = Number(pendingOrderInsert[0].insertId);
    const completedOrderInsert = await db.insert(orders).values({ orderNumber: `${marker}-COMPLETED`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid", deliveryMethod: "store_pickup", pickupBranch: "Test branch", customerName: "Bulk Test Customer 2", customerPhone: "88110001", subtotalMnt: 2000, totalMnt: 2000 });
    completedOrderId = Number(completedOrderInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminUserId));
    if (pendingOrderId) { await db.delete(orderItems).where(eq(orderItems.orderId, pendingOrderId)); await db.delete(orders).where(eq(orders.id, pendingOrderId)); }
    if (completedOrderId) { await db.delete(orderItems).where(eq(orderItems.orderId, completedOrderId)); await db.delete(orders).where(eq(orders.id, completedOrderId)); }
    if (productAId) await db.delete(products).where(eq(products.id, productAId));
    if (productBId) await db.delete(products).where(eq(products.id, productBId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
  });

  it("publishes multiple real products in one call, each individually audit-logged", async () => {
    const result = await adminCaller.admin.bulkUpdateProductPublishStatus({ ids: [productAId, productBId], isPublished: true });
    expect(result.succeeded.sort()).toEqual([productAId, productBId].sort());
    expect(result.failed).toEqual([]);

    const db = await getDb();
    const rows = await db!.select({ isPublished: products.isPublished }).from(products).where(eq(products.id, productAId));
    expect(rows[0]?.isPublished).toBe(true);

    const logs = await db!.select().from(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminUserId));
    const productLogs = logs.filter(log => log.action === "product.updated" && (log.entityId === productAId || log.entityId === productBId));
    expect(productLogs).toHaveLength(2);
  });

  it("reports a nonexistent id as failed without blocking the rest of the batch", async () => {
    const bogusId = 999_999_999;
    const result = await adminCaller.admin.bulkUpdateProductPublishStatus({ ids: [productAId, bogusId], isPublished: false });
    expect(result.succeeded).toEqual([productAId]);
    expect(result.failed).toEqual([{ id: bogusId, message: "Бараа олдсонгүй." }]);
  });

  it("bulk order status: succeeds for an order that can take the transition, fails (without blocking) for a closed one", async () => {
    const result = await adminCaller.admin.bulkUpdateOrderStatus({ ids: [pendingOrderId, completedOrderId], status: "confirmed" });
    expect(result.succeeded).toEqual([pendingOrderId]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe(completedOrderId);

    const db = await getDb();
    const rows = await db!.select({ status: orders.status }).from(orders).where(eq(orders.id, pendingOrderId));
    expect(rows[0]?.status).toBe("confirmed");

    const logs = await db!.select().from(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminUserId));
    expect(logs.some(log => log.action === "order.updated" && log.entityId === pendingOrderId)).toBe(true);
    // The failed (already-completed) order must not have logged a phantom update.
    const completedLogsAfter = logs.filter(log => log.action === "order.updated" && log.entityId === completedOrderId);
    expect(completedLogsAfter).toHaveLength(0);
  });
});
