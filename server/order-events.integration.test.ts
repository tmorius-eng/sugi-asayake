import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { adminAuditLogs, branchStock, branches, cartItems, carts, orderEvents, orderItems, orders, paymentAttempts, productCategories, productVariants, products, stockMovements, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb, getOrderEvents, markQPayPaymentAttemptPaid } from "./db";
import { testSessionUser } from "./_test-helpers";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// /admin → Процесс (2026-10-05, migration 0101): захиалга бичдэг ЗАМ БҮР order_events-д
// хэн/юу хийснийг бичдэг гэдгийг зам тус бүрээр батална (PROJECT-GUIDE-ийн шинэ дүрэм).
// Нэг зам event бичихээ мартвал самбар тэр захиалгыг "түүхгүй" гэж харуулна — энэ тест
// түүнийг deploy-ийн өмнө барина.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.142.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.142.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("order events — every order write path leaves a trail", () => {
  const marker = `oev${Date.now().toString(36)}`;
  let customerId = 0;
  let adminId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  let branchId = 0;
  let branchName = "";
  const orderIds: number[] = [];

  const customer = () => testSessionUser({ id: customerId, email: `${marker}-c@example.invalid`, name: "Trail Customer", role: "user" });
  const admin = () => testSessionUser({ id: adminId, email: `${marker}-a@example.invalid`, name: "Trail Admin", role: "admin" });

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order-events integration tests.");
    customerId = Number((await db.insert(users).values({ email: `${marker}-c@example.invalid`, passwordHash: await hashPassword("TrailPassw0rd!"), name: "Trail Customer", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    adminId = Number((await db.insert(users).values({ email: `${marker}-a@example.invalid`, passwordHash: await hashPassword("TrailPassw0rd!"), name: "Trail Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    categoryId = Number((await db.insert(productCategories).values({ name: "Trail category", slug: `${marker}-category`, sortOrder: 99998, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "Trail product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 12_000, stockQuantity: 50, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 12_000, stockQuantity: 50, isDefault: true }))[0].insertId);
    const [branch] = await db.select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.isActive, true), eq(branches.isFulfillmentDefault, true))).limit(1);
    if (!branch) throw new Error("A default fulfilment branch is required (scripts/ci-seed.ts seeds one).");
    branchId = branch.id;
    branchName = branch.name;
    // Салбарын нөөц байвал checkout ledger мөр бичнэ — timeline-ийн "stock" эх сурвалжийг шалгахад.
    await db.insert(branchStock).values({ branchId, variantId, stockQuantity: 50 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(paymentAttempts).where(inArray(paymentAttempts.orderId, orderIds));
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds)); // order_events cascade
    }
    if (variantId) { await db.delete(stockMovements).where(eq(stockMovements.variantId, variantId)); await db.delete(branchStock).where(eq(branchStock.variantId, variantId)); }
    if (adminId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    if (customerId) {
      const ownCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, customerId));
      if (ownCarts.length) { await db.delete(cartItems).where(inArray(cartItems.cartId, ownCarts.map(c => c.id))); await db.delete(carts).where(inArray(carts.id, ownCarts.map(c => c.id))); }
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (customerId) await db.delete(users).where(eq(users.id, customerId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
  });

  async function insertOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const insert = await db.insert(orders).values({
      userId: customerId, orderNumber: `${marker}-${orderIds.length}`, status: "pending", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: branchName, fulfillingBranchId: branchId, customerName: "Trail Customer", customerPhone: "88110001",
      subtotalMnt: 12_000, totalMnt: 12_000, ...overrides,
    });
    const orderId = Number(insert[0].insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productId, variantId, productName: "Trail product", sku: `${marker}-SKU`, unitPriceMnt: 12_000, quantity: 1 });
    return orderId;
  }

  const kinds = async (orderId: number) => (await getOrderEvents(orderId)).map(e => `${e.kind}:${e.actorKind}${e.toStatus ? `→${e.toStatus}` : ""}`);

  it("checkout: order.created by the customer, stock movement joins the trail", async () => {
    const shopper = callerFor(customer());
    await shopper.cart.addItem({ productId, quantity: 2 });
    const placed = await shopper.checkout.createOrder({
      clientRequestId: `${marker}checkout01`, customerName: "Trail Customer", customerPhone: "88110001", deliveryMethod: "store_pickup", pickupBranch: branchName, paymentMethod: "cash_on_delivery",
    });
    orderIds.push(placed.id);
    const events = await getOrderEvents(placed.id);
    expect(events.map(e => e.kind)).toEqual(["order.created"]);
    expect(events[0]).toMatchObject({ actorKind: "customer", actorUserId: customerId, toStatus: "pending" });
    expect(events[0].payload).toMatchObject({ itemCount: 2, channel: "online" });
    expect(events[0].payload).not.toHaveProperty("customerPhone");

    const staff = callerFor(admin());
    const trail = await staff.admin.process.orderTrail({ orderId: placed.id });
    expect(trail.timeline.map(t => t.source)).toEqual(expect.arrayContaining(["event", "stock", "notification"]));
    // Захиалга үүссэн нь нөөц хасагдсанаас урд (нэг секундэд ч эрэмбэ тогтвортой).
    expect(trail.timeline.findIndex(t => t.kind === "order.created")).toBeLessThan(trail.timeline.findIndex(t => t.source === "stock"));
  });

  it("admin.updateOrder: status.changed + tracking.set by staff; completing a COD order records payment.paid", async () => {
    const orderId = await insertOrder();
    const staff = callerFor(admin());
    await staff.admin.updateOrder({ id: orderId, status: "confirmed", deliveryTrackingRef: "TRK-1" });
    expect(await kinds(orderId)).toEqual(["status.changed:staff→confirmed", "tracking.set:staff", "notify.customer:system"]);
    await staff.admin.updateOrder({ id: orderId, status: "packed" });
    await staff.admin.updateOrder({ id: orderId, status: "out_for_delivery" });
    await staff.admin.updateOrder({ id: orderId, status: "completed" });
    const all = await getOrderEvents(orderId);
    const paid = all.find(e => e.kind === "payment.paid");
    expect(paid).toMatchObject({ actorKind: "staff", actorUserId: adminId });
    expect(paid?.payload).toMatchObject({ paymentMethod: "cash_on_delivery", reason: "completed" });
    // Ижил төлөвөөр дахин шинэчлэхэд event бичигдэхгүй (statusChanged=false).
    const before = all.length;
    await staff.admin.updateOrder({ id: orderId, deliveryTrackingRef: "TRK-1" });
    expect((await getOrderEvents(orderId)).length).toBe(before);
  });

  it("admin.bulkUpdateOrderStatus: payload.bulk = true", async () => {
    const a = await insertOrder();
    const b = await insertOrder();
    await callerFor(admin()).admin.bulkUpdateOrderStatus({ ids: [a, b], status: "confirmed" });
    for (const id of [a, b]) {
      const [event] = await getOrderEvents(id);
      expect(event).toMatchObject({ kind: "status.changed", actorKind: "staff", toStatus: "confirmed" });
      expect(event.payload).toMatchObject({ bulk: true });
    }
  });

  it("orders.cancel: the customer is the actor, not staff", async () => {
    const orderId = await insertOrder({ status: "confirmed" });
    await callerFor(customer()).orders.cancel({ id: orderId });
    const [cancelled] = await getOrderEvents(orderId);
    expect(cancelled).toMatchObject({ kind: "status.changed", actorKind: "customer", actorUserId: customerId, fromStatus: "confirmed", toStatus: "cancelled" });
    expect(cancelled.payload).toMatchObject({ restocked: true });
  });

  it("orders.requestReturn: return.requested by the customer", async () => {
    const orderId = await insertOrder({ status: "completed", paymentStatus: "paid", completedAt: new Date() });
    await callerFor(customer()).orders.requestReturn({ id: orderId, reason: "Савлагаа гэмтсэн ирсэн" });
    expect(await kinds(orderId)).toEqual(["return.requested:customer"]);
  });

  it("admin.refundOrder: payment.refunded by staff with the amount", async () => {
    const orderId = await insertOrder({ status: "returned", paymentStatus: "paid", completedAt: new Date(), returnedAt: new Date() });
    await callerFor(admin()).admin.refundOrder({ id: orderId, refundAmountMnt: 12_000, restockItems: false });
    const [refund] = await getOrderEvents(orderId);
    expect(refund).toMatchObject({ kind: "payment.refunded", actorKind: "staff", actorUserId: adminId });
    expect(refund.payload).toMatchObject({ refundAmountMnt: 12_000, restockItems: false });
  });

  it("admin.editOrder: order.edited by staff", async () => {
    const orderId = await insertOrder();
    await callerFor(admin()).admin.editOrder({ id: orderId, customerName: "Trail Customer Edited" });
    expect((await getOrderEvents(orderId)).map(e => e.kind)).toContain("order.edited");
  });

  it("admin.createManualOrder: order.created with channel manual", async () => {
    const created = await callerFor(admin()).admin.createManualOrder({
      clientRequestId: `${marker}manual001`, customerName: "Trail Phone Customer", customerPhone: "88110002", deliveryMethod: "store_pickup", pickupBranch: branchName,
      paymentMethod: "cash_on_delivery", salesChannel: "phone", items: [{ variantId, quantity: 1 }],
    });
    orderIds.push(created.id);
    const [event] = await getOrderEvents(created.id);
    expect(event).toMatchObject({ kind: "order.created", actorKind: "staff", actorUserId: adminId, toStatus: "pending" });
    expect(event.payload).toMatchObject({ channel: "manual", salesChannel: "phone" });
  });

  it("admin.recordInStoreSale: created completed + paid in one step, staff actor", async () => {
    const sale = await callerFor(admin()).admin.recordInStoreSale({ branchId, items: [{ variantId, quantity: 1 }], clientRequestId: `${marker}pos00001` });
    orderIds.push(sale.id);
    expect(await kinds(sale.id)).toEqual(["order.created:staff→completed", "payment.paid:staff"]);
  });

  it("payment callback: payment.paid + pending→confirmed by the webhook actor, duplicate callback adds nothing", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const orderId = await insertOrder({ paymentMethod: "qpay" });
    const attemptId = Number((await db.insert(paymentAttempts).values({ orderId, provider: "qpay", providerInvoiceId: `${marker}-inv-1`, status: "created" }))[0].insertId);
    await markQPayPaymentAttemptPaid({ id: attemptId, orderId, providerPaymentId: `${marker}-pay-1` });
    expect(await kinds(orderId)).toEqual(["payment.paid:webhook", "status.changed:webhook→confirmed"]);
    const [paid] = await getOrderEvents(orderId);
    expect(paid.actorLabel).toBe("qpay");
    // At-least-once callback: хоёр дахь дуудлага юу ч нэмэхгүй.
    await markQPayPaymentAttemptPaid({ id: attemptId, orderId, providerPaymentId: `${marker}-pay-1` });
    expect((await getOrderEvents(orderId)).length).toBe(2);
  });

  it("process.overview / stageOrders / auditFeed answer with this suite's own data", async () => {
    const staff = callerFor(admin());
    const overview = await staff.admin.process.overview({ stuckHours: 24 });
    expect(overview.stages.map(s => s.status)).toEqual(["pending", "confirmed", "packed", "out_for_delivery", "completed"]);
    expect(typeof overview.missingTrail).toBe("number");
    expect(overview.actors24h.customer).toBeGreaterThan(0);
    const confirmed = await staff.admin.process.stageOrders({ status: "confirmed", limit: 100 });
    expect(confirmed.some(row => orderIds.includes(row.id) && row.lastEvent !== null)).toBe(true);
    const feed = await staff.admin.process.auditFeed({ limit: 200, actorKind: "webhook" });
    expect(feed.some(entry => entry.kind === "payment.paid" && entry.actorKind === "webhook")).toBe(true);
    // Нэр/утас гадагш гарахгүй.
    expect(JSON.stringify(confirmed)).not.toContain("88110001");
  });

  it("deleting an order cascades its events (no orphans)", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const orderId = await insertOrder({ status: "cancelled" });
    await callerFor(admin()).admin.updateOrder({ id: orderId, adminNote: "to be deleted" });
    expect((await getOrderEvents(orderId)).length).toBeGreaterThan(0);
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    orderIds.splice(orderIds.indexOf(orderId), 1);
    expect((await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId))).length).toBe(0);
  });
});
