import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin overhaul (2026-09-08, Phase G): the first way a logged-in customer
// can cancel their own order without contacting support. Covers ownership
// (can't touch someone else's order, even by guessing an id) and the
// status gate (only pending/confirmed, matching updateAdminOrder's own
// forward-only ladder), plus that stock genuinely comes back.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.140.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.140.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("order self-cancellation integration", () => {
  const marker = `cxl${Date.now().toString(36)}`;
  const ownerEmail = `${marker}-owner@example.invalid`;
  const otherEmail = `${marker}-other@example.invalid`;
  let ownerId = 0;
  let otherId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order self-cancel integration tests.");
    const ownerInsert = await db.insert(users).values({ email: ownerEmail, passwordHash: await hashPassword("OwnerPassw0rd!"), name: "Cancel Test Owner", role: "user", emailVerifiedAt: new Date() });
    ownerId = Number(ownerInsert[0].insertId);
    const otherInsert = await db.insert(users).values({ email: otherEmail, passwordHash: await hashPassword("OtherPassw0rd!"), name: "Cancel Test Other", role: "user", emailVerifiedAt: new Date() });
    otherId = Number(otherInsert[0].insertId);

    const categoryResult = await db.insert(productCategories).values({ name: "Cancel test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Cancel test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 3, isPublished: true });
    productId = Number(productResult[0].insertId);
    const variantResult = await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 3, isDefault: true });
    variantId = Number(variantResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
    if (otherId) await db.delete(users).where(eq(users.id, otherId));
  });

  const ownerUser = () => ({ id: ownerId, email: ownerEmail, name: "Cancel Test Owner", role: "user" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const otherUser = () => ({ id: otherId, email: otherEmail, name: "Cancel Test Other", role: "user" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  async function insertOrder(status: "pending" | "confirmed" | "packed", quantity = 1) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const insert = await db.insert(orders).values({
      userId: ownerId, orderNumber: `${marker}-${orderIds.length}`, status, paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Cancel Test Owner", customerPhone: "88110000",
      subtotalMnt: 10_000 * quantity, totalMnt: 10_000 * quantity,
    });
    const orderId = Number(insert[0].insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productId, variantId, productName: "Cancel test product", sku: `${marker}-SKU`, unitPriceMnt: 10_000, quantity });
    return orderId;
  }

  it("lets the owner cancel their own pending order, and restores stock", async () => {
    const orderId = await insertOrder("pending", 2);
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [before] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);

    const owner = callerFor(ownerUser());
    const cancelled = await owner.orders.cancel({ id: orderId });
    expect(cancelled.status).toBe("cancelled");

    const [after] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    expect(after.stockQuantity).toBe(before.stockQuantity + 2);
  });

  it("lets the owner cancel a confirmed order too", async () => {
    const orderId = await insertOrder("confirmed");
    const owner = callerFor(ownerUser());
    const cancelled = await owner.orders.cancel({ id: orderId });
    expect(cancelled.status).toBe("cancelled");
  });

  it("refuses to cancel someone else's order, even by guessing the id", async () => {
    const orderId = await insertOrder("pending");
    const other = callerFor(otherUser());
    await expect(other.orders.cancel({ id: orderId })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Confirms it's a real refusal, not a silent success -- the owner can
    // still cancel it afterward.
    const owner = callerFor(ownerUser());
    const cancelled = await owner.orders.cancel({ id: orderId });
    expect(cancelled.status).toBe("cancelled");
  });

  it("refuses to cancel an order that has already been packed", async () => {
    const orderId = await insertOrder("packed");
    const owner = callerFor(ownerUser());
    await expect(owner.orders.cancel({ id: orderId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a session", async () => {
    const orderId = await insertOrder("pending");
    const anon = callerFor(null);
    await expect(anon.orders.cancel({ id: orderId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
