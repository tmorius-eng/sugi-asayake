import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testSessionUser } from "./_test-helpers";
import { adminAuditLogs, orderItems, orders, productCategories, productVariants, products, productReviews, storeCreditLedger, storeSettings, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// 2026-09-14, after the product-facts editor bug (the panel read the four
// new fields off the list row, so a reopen showed them empty and a save
// wiped them): every admin/customer procedure added today, driven through
// the SAME router calls the panels make, save-then-reload. Real database,
// throwaway rows, face gate off (test setup).
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "198.51.100.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("today's admin and customer procedures, save then reload", () => {
  const marker = `rt${Date.now().toString(36)}`;
  let adminId = 0, customerId = 0, categoryId = 0, productId = 0, variantId = 0;
  const orderIds: number[] = [];
  const base = () => ({ emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const admin = () => callerFor(testSessionUser({ ...base(), id: adminId, email: `${marker}-admin@example.invalid`, name: "RT Admin", role: "admin" }));
  const customer = () => callerFor(testSessionUser({ ...base(), id: customerId, email: `${marker}-c@example.invalid`, name: "RT Customer", role: "user", phone: customerPhone }));

  // 2026-09-20: per-run phone, not a hard-coded one -- users.phone is UNIQUE,
  // so a run interrupted before afterAll left a row that made every later run
  // fail on insert (found by the full-suite run of the 2026-09-20 audit).
  const customerPhone = `8${String(Date.now()).slice(-7)}`;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    adminId = Number((await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("RtPassw0rd!"), name: "RT Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    customerId = Number((await db.insert(users).values({ email: `${marker}-c@example.invalid`, phone: customerPhone, passwordHash: await hashPassword("RtPassw0rd!"), name: "RT Customer", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    categoryId = Number((await db.insert(productCategories).values({ name: "RT category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "RT product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 12_500, stockQuantity: 20, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 12_500, stockQuantity: 20, isDefault: true }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(storeSettings).where(inArray(storeSettings.settingKey, ["review-reward-mnt"]));
    for (const id of orderIds) { await db.delete(orderItems).where(eq(orderItems.orderId, id)); await db.delete(orders).where(eq(orders.id, id)); }
    if (customerId) { await db.delete(productReviews).where(eq(productReviews.userId, customerId)); await db.delete(storeCreditLedger).where(eq(storeCreditLedger.userId, customerId)); }
    if (adminId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    for (const id of [adminId, customerId]) if (id) await db.delete(users).where(eq(users.id, id));
  }, 60_000);

  it("product facts: saved through admin.updateProduct, present on admin.productDetail and the public product page, kept when only the name changes", async () => {
    const a = admin();
    await a.admin.updateProduct({ id: productId, ingredients: "Water, Glycerin", netContent: "300гр", countryOfOrigin: "Япон", shelfLifeMonths: 36 });
    const detail = await a.admin.productDetail({ id: productId });
    expect(detail).toMatchObject({ ingredients: "Water, Glycerin", netContent: "300гр", countryOfOrigin: "Япон", shelfLifeMonths: 36, factsSource: "admin" });
    // The public page reads the same columns.
    const publicRow = await a.catalog.bySlug({ slug: `${marker}-product` });
    expect(publicRow).toMatchObject({ netContent: "300гр", shelfLifeMonths: 36, ingredients: "Water, Glycerin" });
    // A partial update (the CSV importer's shape) leaves the facts alone.
    await a.admin.updateProduct({ id: productId, name: "RT product renamed" });
    expect(await a.admin.productDetail({ id: productId })).toMatchObject({ name: "RT product renamed", shelfLifeMonths: 36, ingredients: "Water, Glycerin" });
    // Gift-card kind round-trips too.
    await a.admin.updateProduct({ id: productId, kind: "gift_card" });
    expect((await a.admin.productDetail({ id: productId })).kind).toBe("gift_card");
    await a.admin.updateProduct({ id: productId, kind: "physical" });
  }, 30_000);

  it("manual order, edit, packing slip and receipt all go through the panel's procedures", async () => {
    const a = admin();
    const created = await a.admin.createManualOrder({ clientRequestId: `${marker}-req-1`, customerName: "Phone Buyer", customerPhone: customerPhone, deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId, quantity: 2 }] });
    orderIds.push(created.id);
    const listed = (await a.admin.orders()).find(row => row.id === created.id);
    expect(listed?.items[0]).toMatchObject({ variantId, quantity: 2 });
    expect(listed?.salesChannel).toBe("phone");
    // The same request id returns the same order, not a second one.
    const replay = await a.admin.createManualOrder({ clientRequestId: `${marker}-req-1`, customerName: "Phone Buyer", customerPhone: customerPhone, deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId, quantity: 2 }] });
    expect(replay.id).toBe(created.id);
    const edited = await a.admin.editOrder({ id: created.id, customerName: "Phone Buyer Edited", deliveryMethod: "ub_delivery", deliveryAddress: "Some street 9", district: "bayangol", items: [{ variantId, quantity: 1 }] });
    expect(edited).toMatchObject({ customerName: "Phone Buyer Edited", deliveryMethod: "ub_delivery", deliveryDistrict: "bayangol", subtotalMnt: 12_500 });
    expect(edited.items).toEqual([expect.objectContaining({ variantId, quantity: 1 })]);
    const detail = await a.admin.orderDetail({ id: created.id });
    expect(detail.items).toHaveLength(1);
    const slip = await a.admin.packingSlipPdf({ orderId: created.id });
    expect(Buffer.from(slip.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    const receipt = await a.admin.orderInvoicePdf({ orderId: created.id });
    expect(receipt.fileName).toContain(created.orderNumber);
  }, 45_000);

  it("a completed order can be returned by its customer once; a verified review earns the configured credit", async () => {
    const db = await getDb();
    const a = admin();
    const c = customer();
    // A completed order of the customer's, placed by staff on their behalf.
    const order = await a.admin.createManualOrder({ customerName: "RT Customer", customerPhone: customerPhone, deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery", salesChannel: "messenger", items: [{ variantId, quantity: 1 }] });
    orderIds.push(order.id);
    await db!.update(orders).set({ userId: customerId }).where(eq(orders.id, order.id));
    for (const status of ["confirmed", "packed", "out_for_delivery", "completed"] as const) await a.admin.updateOrder({ id: order.id, status });
    const mine = await c.orders.mine({ limit: 5 });
    const own = mine.orders.find(row => row.id === order.id);
    expect(own?.status).toBe("completed");
    expect(own?.returnRequestedAt).toBeNull();
    const returned = await c.orders.requestReturn({ id: order.id, reason: "Хайрцаг нь хагарсан ирсэн" });
    expect(returned.returnRequestReason).toBe("Хайрцаг нь хагарсан ирсэн");
    await expect(c.orders.requestReturn({ id: order.id, reason: "дахин оролдох" })).rejects.toThrow(/аль хэдийн/);
    expect((await a.admin.orders()).find(row => row.id === order.id)?.returnRequestedAt).toBeTruthy();
    // Review reward: setting on -> credit lands with the review.
    await a.admin.updateStoreSetting({ settingKey: "review-reward-mnt", settingValue: "2000" });
    const before = await c.cart.myStoreCreditBalance();
    const review = await c.reviews.create({ productId, rating: 5, comment: "Маш сайхан бараа, дахин авна." });
    expect(review.rewardMnt).toBe(2000);
    expect(await c.cart.myStoreCreditBalance()).toBe(before + 2000);
  }, 60_000);
});
