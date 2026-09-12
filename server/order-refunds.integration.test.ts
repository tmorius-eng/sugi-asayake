import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin overhaul (2026-09-08, Phase E): the refund/credit flow orders.ts's
// own returnedAt comment always flagged as "separate, unscoped work" -- now
// scoped. Covers the guards refundOrder enforces (server/db.ts) and the
// financeProcedure boundary (server/_core/trpc.ts) -- deliberately separate
// from warehouseProcedure's updateOrder, since recording a refund is a money
// decision, not a fulfilment one.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.121.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.121.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("order refunds integration", () => {
  // orders.orderNumber is varchar(32) -- keep this short (the full "marker"
  // is only used for other tables' longer varchar columns like slug/email).
  const marker = `rfnd${Date.now().toString(36)}`;
  const financeEmail = `${marker}-finance@example.invalid`;
  const warehouseEmail = `${marker}-warehouse@example.invalid`;
  let financeId = 0;
  let warehouseId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order refunds integration tests.");
    const financeInsert = await db.insert(users).values({ email: financeEmail, passwordHash: await hashPassword("FinancePassw0rd!"), name: "Refund Test Finance", role: "finance", emailVerifiedAt: new Date() });
    financeId = Number(financeInsert[0].insertId);
    const warehouseInsert = await db.insert(users).values({ email: warehouseEmail, passwordHash: await hashPassword("WarehousePassw0rd!"), name: "Refund Test Warehouse", role: "warehouse", emailVerifiedAt: new Date() });
    warehouseId = Number(warehouseInsert[0].insertId);

    const categoryResult = await db.insert(productCategories).values({ name: "Refund test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Refund test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isPublished: true });
    productId = Number(productResult[0].insertId);
    const variantResult = await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isDefault: true });
    variantId = Number(variantResult[0].insertId);
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds.splice(0)) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    // refundOrder/updateOrder calls above wrote admin_audit_logs rows
    // (RESTRICT on actorUserId) -- must go before the user rows.
    if (financeId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, financeId));
    if (warehouseId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, warehouseId));
    if (financeId) await db.delete(users).where(eq(users.id, financeId));
    if (warehouseId) await db.delete(users).where(eq(users.id, warehouseId));
  });

  const financeUser = () => testSessionUser({ id: financeId, email: financeEmail, name: "Refund Test Finance", role: "finance" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const warehouseUser = () => testSessionUser({ id: warehouseId, email: warehouseEmail, name: "Refund Test Warehouse", role: "warehouse" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  async function insertReturnedOrder(quantity: number) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const totalMnt = 10_000 * quantity;
    const insert = await db.insert(orders).values({
      orderNumber: `${marker}-${orderIds.length}`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Refund Test Customer", customerPhone: "88110000",
      subtotalMnt: totalMnt, totalMnt,
    });
    const orderId = Number(insert[0].insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productId, variantId, productName: "Refund test product", sku: `${marker}-SKU`, unitPriceMnt: 10_000, quantity });
    // Marks it returned via the same admin.updateOrder path a real staff
    // session would use, rather than hand-crafting the status/returnedAt
    // columns -- exercises the real "only from completed" ladder too.
    const warehouse = callerFor(warehouseUser());
    const returned = await warehouse.admin.updateOrder({ id: orderId, status: "returned" });
    expect(returned.status).toBe("returned");
    return { orderId, totalMnt };
  }

  it("refuses to refund an order that is not returned", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const insert = await db.insert(orders).values({
      orderNumber: `${marker}-not-returned`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Refund Test Customer", customerPhone: "88110000",
      subtotalMnt: 10_000, totalMnt: 10_000,
    });
    const orderId = Number(insert[0].insertId);
    orderIds.push(orderId);

    const finance = callerFor(financeUser());
    await expect(finance.admin.refundOrder({ id: orderId, refundAmountMnt: 10_000, restockItems: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refunds a returned order, restocks the exact variant when asked, and rejects a second refund attempt", async () => {
    const { orderId, totalMnt } = await insertReturnedOrder(2);
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [beforeVariant] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);

    const finance = callerFor(financeUser());
    const refunded = await finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, refundNote: "QA regression", restockItems: true });
    expect(refunded.paymentStatus).toBe("refunded");
    expect(refunded.refundAmountMnt).toBe(totalMnt);
    expect(refunded.refundedAt).toBeTruthy();

    const [afterVariant] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    expect(afterVariant.stockQuantity).toBe(beforeVariant.stockQuantity + 2);

    await expect(finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not restock when restockItems is false", async () => {
    const { orderId, totalMnt } = await insertReturnedOrder(1);
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [beforeVariant] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);

    const finance = callerFor(financeUser());
    await finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false });

    const [afterVariant] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    expect(afterVariant.stockQuantity).toBe(beforeVariant.stockQuantity);
  });

  it("caps the refund amount at the order total", async () => {
    const { orderId, totalMnt } = await insertReturnedOrder(1);
    const finance = callerFor(financeUser());
    await expect(finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt + 1, restockItems: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps refunds finance/admin-only -- warehouse (which owns order status) is forbidden", async () => {
    const { orderId, totalMnt } = await insertReturnedOrder(1);
    const warehouse = callerFor(warehouseUser());
    await expect(warehouse.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
