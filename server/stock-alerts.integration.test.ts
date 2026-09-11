import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { adminAuditLogs, branches, branchStock, notificationOutbox, orderItems, orders, productCategories, products, productVariants, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

/**
 * Phase 5 (2026-09-11): a sale that takes a shelf over its low-stock line
 * pushes once, to that location's group and admin; going out pushes "out";
 * a published product the website can no longer sell pushes "total out".
 * Corrections (an admin typing a number) never alert. Throwaway rows only.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("stock alerts (low / out / online out)", () => {
  const marker = `alr${Date.now().toString(36)}`;
  let adminId = 0;
  let warehouseId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const sku = `972${Date.now().toString().slice(-10)}`;
  const orderIds: number[] = [];

  const admin = () => appRouter.createCaller({
    user: { id: adminId, email: `${marker}-admin@example.invalid`, name: "Alert Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"],
    req: { protocol: "https", headers: {}, ip: `203.0.200.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.200.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  });

  async function alerts(eventType: string) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    return db.select({ groupKey: notificationOutbox.groupKey, message: notificationOutbox.message, dedupeKey: notificationOutbox.dedupeKey })
      .from(notificationOutbox).where(and(eq(notificationOutbox.eventType, eventType), like(notificationOutbox.message, `%${sku}%`)));
  }
  const sell = async (quantity: number) => {
    const order = await admin().admin.recordInStoreSale({ branchId: warehouseId, items: [{ variantId, quantity }] });
    orderIds.push(order.id);
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    adminId = Number((await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("AlertPassw0rd!"), name: "Alert Test Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    // A counting warehouse with a threshold of 2, so this variant's online
    // total is exactly this one shelf.
    warehouseId = (await admin().admin.createBranch({ name: `${marker} агуулах`, slug: `${marker}-wh`, address: "Alert test", isActive: true, kind: "warehouse", lowStockThreshold: 2 })).id;
    categoryId = Number((await db.insert(productCategories).values({ name: "Alert test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: `Alert test ${marker}`, slug: `${marker}-product`, sku, priceMnt: 1000, stockQuantity: 0, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku, priceMnt: 1000, stockQuantity: 0, isDefault: true }))[0].insertId);
    await db.insert(branchStock).values({ branchId: warehouseId, variantId, stockQuantity: 0 });
  }, 60_000);

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(notificationOutbox).where(like(notificationOutbox.message, `%${sku}%`));
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (warehouseId) await db.delete(branches).where(eq(branches.id, warehouseId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
  }, 60_000);

  it("stays silent for an admin correction, and alerts once when a sale crosses the line", async () => {
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId, quantity: 4 }); // correction, not an event
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId, quantity: 1 }); // even a big drop
    expect(await alerts("stock.low")).toEqual([]);
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId, quantity: 4 });

    await sell(1); // 4 -> 3: above the line, nothing
    expect(await alerts("stock.low")).toEqual([]);
    await sell(1); // 3 -> 2: on the line -> low, once per group
    const low = await alerts("stock.low");
    expect(low.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);
    expect(low[0].message).toContain("2 ширхэг үлдлээ");
    await sell(1); // 2 -> 1: already low, nothing new
    expect(await alerts("stock.low")).toHaveLength(2);
  });

  it("alerts 'out' for the shelf and 'online out' for the product, each once", async () => {
    await sell(1); // 1 -> 0
    const out = await alerts("stock.out");
    expect(out.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);
    const totalOut = await alerts("stock.total_out");
    expect(totalOut.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);
    // Restocking and selling out again the same day is the same story.
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId, quantity: 1 });
    await sell(1);
    expect(await alerts("stock.out")).toHaveLength(2);
    expect(await alerts("stock.total_out")).toHaveLength(2);
  });
});
