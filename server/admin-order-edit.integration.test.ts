import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, productCategories, productVariants, products, stockMovements } from "../drizzle/schema";
import { createManualOrder, editAdminOrder, getDb, updateAdminOrder } from "./db";
import { renderPackingSlip } from "./invoice";

// Staff-side order writes (2026-09-14): a phone/Messenger order keyed in by
// staff, and editing an open order in place. Real database; throwaway rows;
// stock is checked on the variant totals (branch_stock rows are recomputed
// into them) so the assertions hold whether or not the fulfilling branch
// tracks this variant per-branch.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("staff-created and staff-edited orders", () => {
  const marker = `staff${Date.now().toString(36)}`;
  let categoryId = 0;
  let creamId = 0, creamVariantId = 0;
  let serumId = 0, serumVariantId = 0;
  const orderIds: number[] = [];

  const stockOf = async (variantId: number) => {
    const db = await getDb();
    const [row] = await db!.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    return row?.stockQuantity ?? -1;
  };
  const linesOf = async (orderId: number) => {
    const db = await getDb();
    return db!.select({ variantId: orderItems.variantId, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const category = await db.insert(productCategories).values({ name: "Staff order test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(category[0].insertId);
    const cream = await db.insert(products).values({ categoryId, name: "Staff test cream", slug: `${marker}-cream`, sku: `${marker}-CREAM`, priceMnt: 20_000, stockQuantity: 10, isPublished: true });
    creamId = Number(cream[0].insertId);
    creamVariantId = Number((await db.insert(productVariants).values({ productId: creamId, sku: `${marker}-CREAM`, priceMnt: 20_000, stockQuantity: 10, isDefault: true }))[0].insertId);
    // Unpublished on purpose: staff may still sell it by phone.
    const serum = await db.insert(products).values({ categoryId, name: "Staff test serum", slug: `${marker}-serum`, sku: `${marker}-SERUM`, priceMnt: 35_000, stockQuantity: 5, isPublished: false });
    serumId = Number(serum[0].insertId);
    serumVariantId = Number((await db.insert(productVariants).values({ productId: serumId, sku: `${marker}-SERUM`, priceMnt: 35_000, stockQuantity: 5, isDefault: true }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) {
      await db.delete(stockMovements).where(eq(stockMovements.refId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    for (const id of [creamId, serumId]) if (id) await db.delete(products).where(eq(products.id, id));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  }, 60_000);

  it("a phone order takes stock from the fulfilling branch, charges delivery by the shared rule and records its channel", async () => {
    const order = await createManualOrder({
      customerName: "Phone Customer", customerPhone: "88123456", deliveryMethod: "ub_delivery", deliveryAddress: "Test street 5", district: "bayanzurkh",
      paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId: creamVariantId, quantity: 2 }, { variantId: serumVariantId, quantity: 1 }], actorUserId: 1, adminNote: "Called at 10:00",
    });
    orderIds.push(order.id);
    expect(order.replayed).toBe(false);
    expect(order.salesChannel).toBe("phone");
    expect(order.subtotalMnt).toBe(75_000);
    expect(order.deliveryFeeMnt).toBeGreaterThan(0);
    expect(order.totalMnt).toBe(75_000 + order.deliveryFeeMnt);
    expect(order.trafficSource).toBe("staff");
    expect(await stockOf(creamVariantId)).toBe(8);
    expect(await stockOf(serumVariantId)).toBe(4);
    // The packing slip renders for it.
    const slip = await renderPackingSlip(order.id);
    expect(slip?.fileName).toContain(order.orderNumber);
    expect(Buffer.from(slip!.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);

  it("editing lines moves stock by the difference, keeps snapshot prices, and re-prices delivery; a paid order refuses line edits", async () => {
    const created = await createManualOrder({
      customerName: "Edit Customer", customerPhone: "88123457", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery", salesChannel: "messenger", items: [{ variantId: creamVariantId, quantity: 3 }], actorUserId: 1,
    });
    orderIds.push(created.id);
    expect(await stockOf(creamVariantId)).toBe(5);
    // 3 cream -> 1 cream + 2 serum, and switch to delivery.
    const edited = await editAdminOrder({ id: created.id, actorUserId: 1, deliveryMethod: "ub_delivery", deliveryAddress: "New address 7", items: [{ variantId: creamVariantId, quantity: 1 }, { variantId: serumVariantId, quantity: 2 }] });
    expect(await stockOf(creamVariantId)).toBe(7);
    expect(await stockOf(serumVariantId)).toBe(2);
    expect(edited.deliveryMethod).toBe("ub_delivery");
    expect(edited.pickupBranch).toBeNull();
    expect(edited.subtotalMnt).toBe(20_000 + 70_000);
    expect(edited.deliveryFeeMnt).toBeGreaterThan(0);
    expect(edited.totalMnt).toBe(edited.subtotalMnt + edited.deliveryFeeMnt);
    expect((await linesOf(created.id)).map(line => [line.variantId, line.quantity])).toEqual([[creamVariantId, 1], [serumVariantId, 2]]);
    // Removing the serum line gives it all back.
    await editAdminOrder({ id: created.id, actorUserId: 1, items: [{ variantId: creamVariantId, quantity: 1 }] });
    expect(await stockOf(serumVariantId)).toBe(4);
    expect((await linesOf(created.id)).length).toBe(1);
    // Contact edits are fine after payment; line edits are not.
    await updateAdminOrder({ id: created.id, status: "confirmed" });
    await updateAdminOrder({ id: created.id, status: "packed" });
    await updateAdminOrder({ id: created.id, status: "out_for_delivery" });
    await updateAdminOrder({ id: created.id, status: "completed" });
    await expect(editAdminOrder({ id: created.id, actorUserId: 1, customerName: "Closed" })).rejects.toThrow(/Хаагдсан/);
    const paid = await createManualOrder({ customerName: "Paid Customer", customerPhone: "88123458", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId: creamVariantId, quantity: 1 }], actorUserId: 1 });
    orderIds.push(paid.id);
    const db = await getDb();
    await db!.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, paid.id));
    await expect(editAdminOrder({ id: paid.id, actorUserId: 1, items: [{ variantId: creamVariantId, quantity: 2 }] })).rejects.toThrow(/Төлбөр төлөгдсөн/);
    const contact = await editAdminOrder({ id: paid.id, actorUserId: 1, customerPhone: "99887766" });
    expect(contact.customerPhone).toBe("99887766");
  }, 45_000);

  it("an unknown variant or an empty line list is refused before anything is written", async () => {
    await expect(createManualOrder({ customerName: "X Y", customerPhone: "88000001", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId: 999_999_999, quantity: 1 }], actorUserId: 1 })).rejects.toThrow(/олдсонгүй/);
    await expect(createManualOrder({ customerName: "X Y", customerPhone: "88000001", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [], actorUserId: 1 })).rejects.toThrow(/нэг бараа/);
  });
});
