import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, productCategories, products } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// "Хамт авдаг" cross-sell (NEWVISION.md §14, 2026-09-16) —
// getFrequentlyBoughtTogether. Бодит захиалгын хамтын тохиолдлыг тоолдог тул
// зөвхөн жинхэнэ MySQL дээр шалгаж болно (bestsellers.integration.test.ts-ийн
// ижил конвенц).
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: `203.0.114.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.114.9" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("frequently bought together integration", () => {
  const marker = `fbt-${Date.now().toString(36)}`;
  let categoryId = 0;
  let anchorId = 0;
  let partnerOftenId = 0;
  let partnerOnceId = 0;
  let unpaidPartnerId = 0;
  let hiddenPartnerId = 0;
  let neverSoldId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for bought-together integration tests.");

    const categoryResult = await db.insert(productCategories).values({ name: "Bought-together test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);

    const insertProduct = async (suffix: string, isPublished = true) => {
      const inserted = await db.insert(products).values({
        categoryId, name: `Bought Together ${suffix}`, slug: `${marker}-${suffix}`, sku: `${marker}-SKU-${suffix}`,
        priceMnt: 10_000, stockQuantity: 50, isPublished,
      });
      return Number(inserted[0].insertId);
    };
    anchorId = await insertProduct("anchor");
    partnerOftenId = await insertProduct("often");
    partnerOnceId = await insertProduct("once");
    unpaidPartnerId = await insertProduct("unpaid");
    hiddenPartnerId = await insertProduct("hidden", false);
    neverSoldId = await insertProduct("lonely");

    const insertOrder = async (suffix: string, productIds: number[], paid: boolean, status: "completed" | "cancelled" | "pending" = "completed") => {
      const orderInsert = await db.insert(orders).values({
        orderNumber: `${marker}-${suffix}`, status, paymentStatus: paid ? "paid" : "unpaid", paymentMethod: "cash_on_delivery",
        deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Bought Together Shopper",
        customerPhone: "99001122", subtotalMnt: 10_000 * productIds.length, totalMnt: 10_000 * productIds.length,
      });
      const orderId = Number(orderInsert[0].insertId);
      orderIds.push(orderId);
      for (const productId of productIds) {
        await db.insert(orderItems).values({ orderId, productId, productName: "Bought Together", sku: `${marker}-sku-${suffix}-${productId}`, unitPriceMnt: 10_000, quantity: 1 });
      }
      return orderId;
    };

    // anchor + often: хоёр төлөгдсөн захиалгад хамт; anchor + once: нэгд.
    await insertOrder("paid-1", [anchorId, partnerOftenId], true);
    await insertOrder("paid-2", [anchorId, partnerOftenId, partnerOnceId], true);
    // Төлөгдөөгүй ба цуцлагдсан захиалга тоологдох ЁСГҮЙ.
    await insertOrder("unpaid", [anchorId, unpaidPartnerId], false, "pending");
    await insertOrder("cancelled", [anchorId, unpaidPartnerId], true, "cancelled");
    // Нийтлэгдээгүй бараа хэчнээн олон удаа хамт зарагдсан ч гарч ирэхгүй.
    await insertOrder("hidden-1", [anchorId, hiddenPartnerId], true);
    await insertOrder("hidden-2", [anchorId, hiddenPartnerId], true);
    await insertOrder("hidden-3", [anchorId, hiddenPartnerId], true);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const orderId of orderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    for (const id of [anchorId, partnerOftenId, partnerOnceId, unpaidPartnerId, hiddenPartnerId, neverSoldId]) {
      if (id) await db.delete(products).where(eq(products.id, id));
    }
    if (categoryId) await db.delete(products).where(eq(products.categoryId, categoryId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  });

  it("хамт зарагдсан барааг давтамжийн дарааллаар буцаана", async () => {
    const results = await makeCaller().catalog.boughtTogether({ productId: anchorId });
    const ids = results.map(product => product.id);
    expect(ids).toContain(partnerOftenId);
    expect(ids).toContain(partnerOnceId);
    expect(ids.indexOf(partnerOftenId)).toBeLessThan(ids.indexOf(partnerOnceId));
  });

  it("өөрийгөө, төлөгдөөгүй/цуцлагдсан захиалга, нийтлэгдээгүй барааг оруулахгүй", async () => {
    const ids = (await makeCaller().catalog.boughtTogether({ productId: anchorId })).map(product => product.id);
    expect(ids).not.toContain(anchorId);
    expect(ids).not.toContain(unpaidPartnerId);
    expect(ids).not.toContain(hiddenPartnerId);
  });

  it("захиалгын түүхгүй бараанд хоосон буцаана (PDP тэр хэсгийг нуудаг)", async () => {
    expect(await makeCaller().catalog.boughtTogether({ productId: neverSoldId })).toEqual([]);
  });
});
