import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { adminAuditLogs, cartItems, carts, notificationOutbox, orderItems, orders, paymentAttempts, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { addCartItem, cancelOwnOrder, createOrderFromActiveCart, getDb, markQPayPaymentAttemptPaid } from "./db";
import { hashPassword } from "./_core/password";
import { outboxDedupeKey, TEST_SUPPRESSED_MARKER } from "./notificationOutbox";
import type { NotificationEventType } from "../shared/notification-events";
import type { TrpcContext } from "./_core/context";

/**
 * Phone push notifications (2026-09-11): the rows business code queues in
 * notification_outbox. server/_test-setup.ts sets NOTIFICATIONS_SUPPRESS=1,
 * so every row here is written as `suppressed` and can never reach a phone.
 * Throwaway marker-tagged rows only, all deleted in afterAll.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.160.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.160.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("notification outbox (orders, payments, the admin bell)", () => {
  const marker = `ntf${Date.now().toString(36)}`;
  const customerEmail = `${marker}-customer@example.invalid`;
  const staffEmail = `${marker}-staff@example.invalid`;
  let customerId = 0;
  let staffId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  const orderIds: number[] = [];
  const feedRowIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    customerId = Number((await db.insert(users).values({ email: customerEmail, passwordHash: await hashPassword("NotifyPassw0rd!"), name: "Notify Test Customer", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    staffId = Number((await db.insert(users).values({ email: staffEmail, passwordHash: await hashPassword("NotifyPassw0rd!"), name: "Notify Test Staff", role: "staff", emailVerifiedAt: new Date() }))[0].insertId);
    categoryId = Number((await db.insert(productCategories).values({ name: "Notify test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await db.insert(products).values({ categoryId, name: "Notify test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isPublished: true }))[0].insertId);
    variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 5, isDefault: true }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const conditions = [like(notificationOutbox.title, `%${marker}%`)];
    for (const id of orderIds) conditions.push(like(notificationOutbox.dedupeKey, `%|order:${id}`));
    if (feedRowIds.length) conditions.push(inArray(notificationOutbox.id, feedRowIds));
    const attemptRows = orderIds.length ? await db.select({ id: paymentAttempts.id }).from(paymentAttempts).where(inArray(paymentAttempts.orderId, orderIds)) : [];
    for (const row of attemptRows) conditions.push(like(notificationOutbox.dedupeKey, `%|attempt:${row.id}`));
    await db.delete(notificationOutbox).where(or(...conditions));
    for (const id of orderIds) {
      await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    const customerCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, customerId));
    for (const cart of customerCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.userId, customerId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, staffId));
    for (const id of [customerId, staffId]) if (id) await db.delete(users).where(eq(users.id, id));
  });

  async function outboxFor(type: NotificationEventType, key: string) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    return db.select().from(notificationOutbox).where(eq(notificationOutbox.dedupeKey, outboxDedupeKey(type, key)));
  }

  const checkout = () => createOrderFromActiveCart({
    owner: { userId: customerId }, customerName: "СЕНТИНЕЛ Хэрэглэгч", customerPhone: "99118822", deliveryMethod: "store_pickup",
    pickupBranch: "Орос элчингийн салбар", paymentMethod: "qpay",
  });

  it("queues one 'new order' notification per group, suppressed, with no customer PII", async () => {
    await addCartItem({ owner: { userId: customerId }, variantId, quantity: 2 });
    const order = await checkout();
    orderIds.push(order.id);
    const rows = await outboxFor("order.placed", `order:${order.id}`);
    expect(rows.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);
    for (const row of rows) {
      expect(row.eventType).toBe("order.placed");
      expect(row.status).toBe("suppressed");
      expect(row.lastError).toBe(TEST_SUPPRESSED_MARKER);
      expect(row.title).toContain(order.orderNumber);
      expect(row.message).toContain("2 ширхэг");
      expect(`${row.title} ${row.message}`).not.toContain("СЕНТИНЕЛ");
      expect(`${row.title} ${row.message}`).not.toContain("99118822");
    }
  });

  it("queues nothing for a checkout that fails", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const before = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(eq(notificationOutbox.eventType, "order.placed"));
    await addCartItem({ owner: { userId: customerId }, variantId, quantity: 1 });
    // Sell out underneath the cart so the stock guard fails inside the transaction.
    await db.update(productVariants).set({ stockQuantity: 0 }).where(eq(productVariants.id, variantId));
    await expect(checkout()).rejects.toThrow();
    await db.update(productVariants).set({ stockQuantity: 5 }).where(eq(productVariants.id, variantId));
    const after = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(eq(notificationOutbox.eventType, "order.placed"));
    expect(after.length).toBe(before.length);
  });

  it("turns QPay's repeated 'paid' callbacks into exactly one notification", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const orderId = orderIds[0];
    const attemptId = Number((await db.insert(paymentAttempts).values({ orderId, provider: "qpay", status: "created", providerInvoiceId: `${marker}-inv` }))[0].insertId);
    await markQPayPaymentAttemptPaid({ id: attemptId, orderId, providerPaymentId: `${marker}-pay` });
    await markQPayPaymentAttemptPaid({ id: attemptId, orderId, providerPaymentId: `${marker}-pay` });
    const paidRows = await outboxFor("order.paid", `order:${orderId}`);
    expect(paidRows.map(row => row.groupKey).sort()).toEqual(["admin", "finance", "warehouse"]);
    // A repeat callback for an order that is simply already paid is routine -- no alarm.
    expect(await outboxFor("payment.paid_on_closed_order", `attempt:${attemptId}`)).toEqual([]);
    // ...and the earlier "new order" rows for the same order are untouched.
    expect(await outboxFor("order.placed", `order:${orderId}`)).toHaveLength(2);
  });

  it("raises an alarm when money arrives for an order that was already cancelled", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    await addCartItem({ owner: { userId: customerId }, variantId, quantity: 1 });
    const order = await checkout();
    orderIds.push(order.id);
    await cancelOwnOrder(order.id, customerId);
    const cancelled = await outboxFor("order.cancelled_by_customer", `order:${order.id}`);
    expect(cancelled.map(row => row.groupKey).sort()).toEqual(["admin", "warehouse"]);

    const attemptId = Number((await db.insert(paymentAttempts).values({ orderId: order.id, provider: "qpay", status: "created", providerInvoiceId: `${marker}-inv2` }))[0].insertId);
    const result = await markQPayPaymentAttemptPaid({ id: attemptId, orderId: order.id, providerPaymentId: `${marker}-pay2` });
    expect(result.orderUpdated).toBe(false);
    const alarm = await outboxFor("payment.paid_on_closed_order", `attempt:${attemptId}`);
    expect(alarm.map(row => row.eventType)).toEqual(["payment.paid_on_closed_order", "payment.paid_on_closed_order"]);
    expect(alarm.map(row => row.groupKey).sort()).toEqual(["admin", "finance"]);
    expect(alarm[0].priority).toBe(5);
  });

  it("feeds the bell from the caller's own group, hides test rows, and tracks unread", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    // Two real-looking (non-test) rows for the store group, one for finance.
    const insert = async (group: string, title: string) => Number((await db.insert(notificationOutbox).values({ eventType: "integration.test", groupKey: group, title, message: "feed test", status: "sent" }))[0].insertId);
    feedRowIds.push(await insert("store", `${marker} store one`));
    feedRowIds.push(await insert("store", `${marker} store two`));
    feedRowIds.push(await insert("finance", `${marker} finance only`));

    const staffCaller = callerFor({ id: staffId, email: staffEmail, name: "Notify Test Staff", role: "staff", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"]);
    const feed = await staffCaller.notifications.feed();
    expect(feed.group).toBe("store");
    const titles = feed.items.map(item => item.title);
    expect(titles).toContain(`${marker} store one`);
    expect(titles).toContain(`${marker} store two`);
    expect(titles).not.toContain(`${marker} finance only`);
    // Test-suppressed rows never appear in anyone's bell.
    const testRows = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(and(eq(notificationOutbox.groupKey, "store"), eq(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER))).limit(5);
    for (const row of testRows) expect(feed.items.map(item => item.id)).not.toContain(row.id);
    expect(feed.unreadCount).toBeGreaterThanOrEqual(2);

    const newest = feed.items[0].id;
    await staffCaller.notifications.markSeen({ upToId: newest });
    expect((await staffCaller.notifications.feed()).unreadCount).toBe(0);
    // A stale tab can never move the marker backwards.
    await staffCaller.notifications.markSeen({ upToId: feedRowIds[0] });
    expect((await staffCaller.notifications.feed()).lastSeenId).toBe(newest);
  });

  it("is closed to customers", async () => {
    const customerCaller = callerFor({ id: customerId, email: customerEmail, name: "Notify Test Customer", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"]);
    await expect(customerCaller.notifications.feed()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customerCaller.notifications.mySubscriptions()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
