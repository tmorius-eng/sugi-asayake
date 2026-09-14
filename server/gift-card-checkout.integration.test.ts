import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { cartItems, carts, giftCards, orderItems, orders, paymentAttempts, productCategories, productVariants, products, users } from "../drizzle/schema";
import { createOrderFromActiveCart, getDb, getOrderForTracking, getOrdersForUser, issueGiftCardsForPaidOrder, markQPayPaymentAttemptPaid, updateAdminOrder } from "./db";
import { hashPassword } from "./_core/password";

// Gift cards sold at checkout (2026-09-14). Real database, marker-prefixed
// throwaway rows, everything deleted in afterAll -- same convention as the
// other commerce suites. Proves the four things the feature promises:
//   1. a gift-card line never touches shelf stock, and a basket of only
//      gift cards has no delivery fee and needs no pickup branch;
//   2. the codes exist the moment the order is paid (admin "completed" for
//      cash, the payment webhook for QPay/StorePay) -- one per unit, each
//      worth the unit price, tied to the order by purchaseOrderId;
//   3. issuing is idempotent (a repeated webhook / a later "completed" on a
//      webhook-paid order mints nothing);
//   4. cancelling a paid order voids the cards nobody has redeemed.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("gift cards sold at checkout", () => {
  const marker = `gift${Date.now().toString(36)}`;
  const customerEmail = `${marker}-customer@example.invalid`;
  let customerId = 0;
  let categoryId = 0;
  let giftProductId = 0;
  let giftVariantId = 0;
  let creamProductId = 0;
  let creamVariantId = 0;
  const orderIds: number[] = [];

  async function fillCart(lines: { variantId: number; quantity: number }[]) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const existing = await db.select({ id: carts.id }).from(carts).where(and(eq(carts.userId, customerId), eq(carts.status, "active")));
    for (const cart of existing) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.userId, customerId));
    const inserted = await db.insert(carts).values({ userId: customerId, status: "active" });
    const cartId = Number(inserted[0].insertId);
    await db.insert(cartItems).values(lines.map(line => ({ cartId, variantId: line.variantId, quantity: line.quantity })));
  }

  const variantStock = async (variantId: number) => {
    const db = await getDb();
    const [row] = await db!.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    return row?.stockQuantity ?? -1;
  };
  const cardsOf = async (orderId: number) => {
    const db = await getDb();
    return db!.select().from(giftCards).where(eq(giftCards.purchaseOrderId, orderId));
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for gift card integration tests.");
    const customer = await db.insert(users).values({ email: customerEmail, passwordHash: await hashPassword("GiftPassw0rd!"), name: "Gift Test Customer", role: "user", emailVerifiedAt: new Date() });
    customerId = Number(customer[0].insertId);
    const category = await db.insert(productCategories).values({ name: "Gift test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(category[0].insertId);
    const gift = await db.insert(products).values({ categoryId, name: "Gift test card 50000", slug: `${marker}-card`, sku: `${marker}-CARD`, priceMnt: 50_000, stockQuantity: 5, isPublished: true, kind: "gift_card" });
    giftProductId = Number(gift[0].insertId);
    const giftVariant = await db.insert(productVariants).values({ productId: giftProductId, sku: `${marker}-CARD`, priceMnt: 50_000, stockQuantity: 5, isDefault: true });
    giftVariantId = Number(giftVariant[0].insertId);
    const cream = await db.insert(products).values({ categoryId, name: "Gift test cream", slug: `${marker}-cream`, sku: `${marker}-CREAM`, priceMnt: 28_000, stockQuantity: 10, isPublished: true });
    creamProductId = Number(cream[0].insertId);
    const creamVariant = await db.insert(productVariants).values({ productId: creamProductId, sku: `${marker}-CREAM`, priceMnt: 28_000, stockQuantity: 10, isDefault: true });
    creamVariantId = Number(creamVariant[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) {
      await db.delete(giftCards).where(eq(giftCards.purchaseOrderId, id));
      await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    if (customerId) {
      const customerCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, customerId));
      for (const cart of customerCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(eq(carts.userId, customerId));
    }
    for (const id of [giftProductId, creamProductId]) if (id) await db.delete(products).where(eq(products.id, id));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (customerId) await db.delete(users).where(eq(users.id, customerId));
  }, 60_000);

  it("a gift-card-only basket: no stock movement, no delivery fee, no branch; codes appear when the cash order is completed, exactly once", async () => {
    await fillCart([{ variantId: giftVariantId, quantity: 2 }]);
    const order = await createOrderFromActiveCart({
      owner: { userId: customerId }, customerName: "Gift Test Customer", customerPhone: "88110000",
      // What the checkout page sends for a digital-only basket: pickup with no branch.
      deliveryMethod: "store_pickup", pickupBranch: null, paymentMethod: "cash_on_delivery",
    });
    orderIds.push(order.id);
    expect(order.deliveryFeeMnt).toBe(0);
    expect(order.pickupBranch).toBeNull();
    expect(order.subtotalMnt).toBe(100_000);
    expect(await variantStock(giftVariantId)).toBe(5);
    // Unpaid: the profile already knows a card is coming, but no code exists yet.
    expect(await cardsOf(order.id)).toHaveLength(0);
    const mine = await getOrdersForUser(customerId, { limit: 5 });
    const listed = mine.orders.find(row => row.id === order.id);
    expect(listed?.items[0]?.kind).toBe("gift_card");
    expect(listed?.giftCards).toEqual([]);

    // Cash order completed = paid = cards minted, one per unit, worth the unit price.
    await updateAdminOrder({ id: order.id, status: "completed" });
    const cards = await cardsOf(order.id);
    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.amountMnt)).toEqual([50_000, 50_000]);
    expect(cards.every(card => card.status === "active" && /^SUGI-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(card.code))).toBe(true);
    expect(cards.every(card => card.expiresAt && card.expiresAt.getTime() > Date.now() + 300 * 86_400_000)).toBe(true);

    // Idempotent: a second issue for the same order mints nothing.
    const db = await getDb();
    expect(await issueGiftCardsForPaidOrder(db!, order.id)).toEqual([]);
    expect(await cardsOf(order.id)).toHaveLength(2);

    // The buyer sees the codes on the profile and via guest tracking alike.
    const after = await getOrdersForUser(customerId, { limit: 5 });
    expect(after.orders.find(row => row.id === order.id)?.giftCards.map(card => card.code).sort()).toEqual(cards.map(card => card.code).sort());
    const tracked = await getOrderForTracking(order.orderNumber, "88110000");
    expect(tracked?.giftCards.map(card => card.code).sort()).toEqual(cards.map(card => card.code).sort());
  }, 30_000);

  it("a mixed basket still charges delivery and decrements only the physical line", async () => {
    await fillCart([{ variantId: giftVariantId, quantity: 1 }, { variantId: creamVariantId, quantity: 1 }]);
    const order = await createOrderFromActiveCart({
      owner: { userId: customerId }, customerName: "Gift Test Customer", customerPhone: "88110000",
      deliveryMethod: "ub_delivery", deliveryAddress: "Test street 1, apartment 2", paymentMethod: "cash_on_delivery",
    });
    orderIds.push(order.id);
    expect(order.deliveryFeeMnt).toBeGreaterThan(0);
    expect(await variantStock(giftVariantId)).toBe(5);
    expect(await variantStock(creamVariantId)).toBe(9);
    expect(await cardsOf(order.id)).toHaveLength(0);
  }, 30_000);

  it("QPay: the webhook mints the cards once; a repeat callback and a later 'completed' add nothing; cancelling voids them", async () => {
    await fillCart([{ variantId: giftVariantId, quantity: 1 }]);
    const order = await createOrderFromActiveCart({
      owner: { userId: customerId }, customerName: "Gift Test Customer", customerPhone: "88110000",
      deliveryMethod: "store_pickup", pickupBranch: null, paymentMethod: "qpay",
    });
    orderIds.push(order.id);
    const db = await getDb();
    const attempt = await db!.insert(paymentAttempts).values({ orderId: order.id, provider: "qpay", providerInvoiceId: `${marker}-inv-${order.id}`, responseJson: "{}" });
    const attemptId = Number(attempt[0].insertId);
    expect(await markQPayPaymentAttemptPaid({ id: attemptId, orderId: order.id, providerPaymentId: `${marker}-pay` })).toEqual({ orderUpdated: true });
    expect(await cardsOf(order.id)).toHaveLength(1);
    expect(await markQPayPaymentAttemptPaid({ id: attemptId, orderId: order.id, providerPaymentId: `${marker}-pay` })).toEqual({ orderUpdated: false });
    expect(await cardsOf(order.id)).toHaveLength(1);
    // Webhook-paid orders go confirmed -> completed by hand later: nothing new.
    await updateAdminOrder({ id: order.id, status: "packed" });
    await updateAdminOrder({ id: order.id, status: "completed" });
    expect(await cardsOf(order.id)).toHaveLength(1);

    // A second paid order that is cancelled before anyone redeems: void.
    await fillCart([{ variantId: giftVariantId, quantity: 1 }]);
    const second = await createOrderFromActiveCart({
      owner: { userId: customerId }, customerName: "Gift Test Customer", customerPhone: "88110000",
      deliveryMethod: "store_pickup", pickupBranch: null, paymentMethod: "qpay",
    });
    orderIds.push(second.id);
    const secondAttempt = await db!.insert(paymentAttempts).values({ orderId: second.id, provider: "qpay", providerInvoiceId: `${marker}-inv-${second.id}`, responseJson: "{}" });
    await markQPayPaymentAttemptPaid({ id: Number(secondAttempt[0].insertId), orderId: second.id, providerPaymentId: `${marker}-pay-2` });
    expect((await cardsOf(second.id)).map(card => card.status)).toEqual(["active"]);
    await updateAdminOrder({ id: second.id, status: "cancelled" });
    expect((await cardsOf(second.id)).map(card => card.status)).toEqual(["void"]);
  }, 45_000);
});
