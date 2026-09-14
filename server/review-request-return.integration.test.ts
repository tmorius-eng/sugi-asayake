import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { getDb, getOrdersNeedingReviewRequest, markReviewRequested, requestOrderReturn } from "./db";
import { hashPassword } from "./_core/password";

// Post-delivery review request + customer return request (2026-09-14).
// Real database, throwaway rows. The job's send side (push/email) is not
// exercised -- what matters is who is selected and that each order is
// asked once; delivery is the same helpers every other job uses.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("review request selection and customer return requests", () => {
  const marker = `rr${Date.now().toString(36)}`;
  let userId = 0, categoryId = 0, productId = 0, variantId = 0;
  const orderIds: number[] = [];

  async function seedOrder(status: "completed" | "packed", completedDaysAgo: number) {
    const db = await getDb();
    const when = new Date(Date.now() - completedDaysAgo * 86_400_000);
    const inserted = await db!.insert(orders).values({
      userId, orderNumber: `${marker}-${orderIds.length}`, status, paymentMethod: "cash_on_delivery", paymentStatus: status === "completed" ? "paid" : "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "RR Customer", customerPhone: "88110099", customerEmail: null,
      subtotalMnt: 10_000, totalMnt: 10_000, createdAt: when, updatedAt: when,
    });
    const id = Number(inserted[0].insertId);
    orderIds.push(id);
    await db!.insert(orderItems).values({ orderId: id, productId, variantId, productName: "RR product", sku: `${marker}-SKU`, unitPriceMnt: 10_000, quantity: 1 });
    return id;
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    userId = Number((await db.insert(users).values({ email: `${marker}@example.invalid`, passwordHash: await hashPassword("RrPassw0rd!"), name: "RR Customer", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    categoryId = Number((await db.insert(productCategories).values({ name: "RR category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "RR product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isDefault: true }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) { await db.delete(orderItems).where(eq(orderItems.orderId, id)); await db.delete(orders).where(eq(orders.id, id)); }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
  }, 60_000);

  it("selects only completed orders older than the wait, and never the same order twice", async () => {
    const old = await seedOrder("completed", 5);
    const fresh = await seedOrder("completed", 1);
    const open = await seedOrder("packed", 10);
    const due = (await getOrdersNeedingReviewRequest(3)).map(row => row.orderId);
    expect(due).toContain(old);
    expect(due).not.toContain(fresh);
    expect(due).not.toContain(open);
    await markReviewRequested(old);
    expect((await getOrdersNeedingReviewRequest(3)).map(row => row.orderId)).not.toContain(old);
  }, 30_000);

  it("a customer may ask to return their own completed order once, inside the window", async () => {
    const id = await seedOrder("completed", 2);
    const updated = await requestOrderReturn({ orderId: id, userId, reason: "Гэмтэлтэй ирсэн", windowDays: 14 });
    expect(updated.returnRequestedAt).toBeTruthy();
    expect(updated.returnRequestReason).toBe("Гэмтэлтэй ирсэн");
    await expect(requestOrderReturn({ orderId: id, userId, reason: "дахин", windowDays: 14 })).rejects.toThrow(/аль хэдийн/);
    await expect(requestOrderReturn({ orderId: id, userId: userId + 1, reason: "өөр хүн", windowDays: 14 })).rejects.toThrow(/олдсонгүй/);
    const late = await seedOrder("completed", 30);
    await expect(requestOrderReturn({ orderId: late, userId, reason: "хэт оройтсон", windowDays: 14 })).rejects.toThrow(/хоногийн дотор/);
    const open = await seedOrder("packed", 1);
    await expect(requestOrderReturn({ orderId: open, userId, reason: "хараахан ирээгүй", windowDays: 14 })).rejects.toThrow(/дууссан/);
  }, 30_000);
});
