import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { branchStock, branches, cartItems, carts, orderItems, orders, productCategories, productVariants, products, stockMovements, users } from "../drizzle/schema";
import { addCartItem, createOrderFromActiveCart, getDb, recordInStoreSale } from "./db";
import { hashPassword } from "./_core/password";

/**
 * Checkout idempotency (2026-09-12 audit). The disabled button covers one
 * click in one tab; it does not cover a request that timed out after the
 * server had already committed, a browser resend, or a second tab. Each
 * checkout attempt carries a random key, and the same key must always come
 * back with the same order -- sequentially (the cart is already empty by
 * then) and when two submissions race.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("checkout idempotency key", () => {
  const marker = `idem${Date.now().toString(36)}`;
  let userId = 0;
  let otherUserId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  let defaultBranchId = 0;
  const orderIds: number[] = [];

  async function db() {
    const database = await getDb();
    if (!database) throw new Error("DATABASE_URL is required.");
    return database;
  }

  async function shelf() {
    const [row] = await (await db()).select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, defaultBranchId), eq(branchStock.variantId, variantId))).limit(1);
    return row?.quantity ?? 0;
  }

  const order = (clientRequestId: string, owner = { userId }) => createOrderFromActiveCart({
    owner, clientRequestId,
    customerName: "Idempotency Test Shopper", customerPhone: "99009900",
    deliveryMethod: "ub_delivery", deliveryAddress: "Idempotency test address, Ulaanbaatar", paymentMethod: "cash_on_delivery",
  });

  beforeAll(async () => {
    const database = await db();
    const [defaultBranch] = await database.select({ id: branches.id }).from(branches).where(eq(branches.isFulfillmentDefault, true)).limit(1);
    defaultBranchId = defaultBranch?.id ?? 0;
    userId = Number((await database.insert(users).values({ email: `${marker}@example.invalid`, passwordHash: await hashPassword("IdemPassw0rd!"), name: "Idempotency Test Shopper", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    otherUserId = Number((await database.insert(users).values({ email: `${marker}-other@example.invalid`, passwordHash: await hashPassword("IdemPassw0rd!"), name: "Idempotency Other Shopper", role: "user", emailVerifiedAt: new Date() }))[0].insertId);
    categoryId = Number((await database.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    productId = Number((await database.insert(products).values({ categoryId, name: "Idempotency test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 50, isPublished: true }))[0].insertId);
    variantId = Number((await database.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 50, isDefault: true }))[0].insertId);
    await database.insert(branchStock).values({ branchId: defaultBranchId, variantId, stockQuantity: 50 });
  });

  afterAll(async () => {
    const database = await getDb();
    if (!database) return;
    const mine = await database.select({ id: orders.id }).from(orders).where(inArray(orders.userId, [userId, otherUserId]));
    const ids = Array.from(new Set([...orderIds, ...mine.map(row => row.id)]));
    if (ids.length) { await database.delete(orderItems).where(inArray(orderItems.orderId, ids)); await database.delete(orders).where(inArray(orders.id, ids)); }
    const myCarts = await database.select({ id: carts.id }).from(carts).where(inArray(carts.userId, [userId, otherUserId]));
    if (myCarts.length) { await database.delete(cartItems).where(inArray(cartItems.cartId, myCarts.map(c => c.id))); await database.delete(carts).where(inArray(carts.id, myCarts.map(c => c.id))); }
    await database.delete(stockMovements).where(eq(stockMovements.variantId, variantId));
    await database.delete(branchStock).where(eq(branchStock.variantId, variantId));
    await database.delete(productVariants).where(eq(productVariants.id, variantId));
    await database.delete(products).where(eq(products.id, productId));
    await database.delete(productCategories).where(eq(productCategories.id, categoryId));
    await database.delete(users).where(inArray(users.id, [userId, otherUserId]));
  });

  it("returns the same order for a resent attempt, and touches stock only once", async () => {
    await addCartItem({ owner: { userId }, variantId, quantity: 2 });
    const before = await shelf();
    const first = await order(`${marker}-attempt-1`);
    orderIds.push(first.id);
    expect(first.replayed).toBe(false);
    expect(await shelf()).toBe(before - 2);

    // The cart is empty now; without the key this would fail with an empty
    // basket, and a moment earlier it would have placed a second order.
    const second = await order(`${marker}-attempt-1`);
    expect(second.id).toBe(first.id);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.replayed).toBe(true);
    expect(second.items).toEqual([{ name: "Idempotency test product", quantity: 2, priceMnt: 10_000, attributesJson: null }]);
    expect(await shelf()).toBe(before - 2);
    const rows = await (await db()).select({ id: orders.id }).from(orders).where(eq(orders.clientRequestId, `${marker}-attempt-1`));
    expect(rows).toHaveLength(1);
  });

  it("resolves two racing submissions of one attempt to a single order", async () => {
    await addCartItem({ owner: { userId }, variantId, quantity: 1 });
    const before = await shelf();
    const results = await Promise.allSettled([order(`${marker}-race`), order(`${marker}-race`)]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof order>>> => r.status === "fulfilled");
    // Either both return the same order, or the loser sees the cart already
    // emptied by the winner -- but never two orders.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(fulfilled.map(r => r.value.id));
    expect(ids.size).toBe(1);
    orderIds.push(...ids);
    expect(await shelf()).toBe(before - 1);
  });

  it("never hands a signed-in shopper another account's order for the same key", async () => {
    await addCartItem({ owner: { userId }, variantId, quantity: 1 });
    const mine = await order(`${marker}-owner`);
    orderIds.push(mine.id);
    // A different account presenting the same key (impossible to guess, but
    // the check is cheap) gets an empty-cart failure, not my order.
    await expect(order(`${marker}-owner`, { userId: otherUserId })).rejects.toThrow();
  });

  it("the register (POS) honours the same key: one basket, one sale, stock once", async () => {
    const before = await shelf();
    const sale = (clientRequestId: string) => recordInStoreSale({ branchId: defaultBranchId, items: [{ variantId, quantity: 3 }], clientRequestId, actorUserId: userId });
    const first = await sale(`${marker}-pos-1`);
    orderIds.push(first.id);
    expect(first.replayed).toBe(false);
    expect(first.salesChannel).toBe("in_store");
    expect(await shelf()).toBe(before - 3);
    // A resend (timeout, double tap) must not ring the basket up again.
    const second = await sale(`${marker}-pos-1`);
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    expect(await shelf()).toBe(before - 3);
    // Two copies racing: still exactly one sale and one decrement.
    const results = await Promise.allSettled([sale(`${marker}-pos-race`), sale(`${marker}-pos-race`)]);
    const ids = new Set(results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof sale>>> => r.status === "fulfilled").map(r => r.value.id));
    expect(ids.size).toBe(1);
    orderIds.push(...ids);
    expect(await shelf()).toBe(before - 6);
  });

  it("a new attempt with a new key is a new order", async () => {
    await addCartItem({ owner: { userId }, variantId, quantity: 1 });
    const first = await order(`${marker}-new-1`);
    await addCartItem({ owner: { userId }, variantId, quantity: 1 });
    const second = await order(`${marker}-new-2`);
    orderIds.push(first.id, second.id);
    expect(second.id).not.toBe(first.id);
  });
});
