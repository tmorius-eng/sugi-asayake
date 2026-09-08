import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, products, productVariants, storeCreditLedger, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// "Controls everything" admin overhaul (2026-09-08, Phase H). Same
// marker-prefixed-throwaway-row convention as every other integration
// suite in this project.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.115.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.115.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("store credit integration", () => {
  const marker = `store-credit-test-${Date.now()}`;
  let financeId = 0;
  let warehouseId = 0;
  let customerId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for store credit integration tests.");
    const financeInsert = await db.insert(users).values({ email: `${marker}-finance@example.invalid`, passwordHash: await hashPassword("StoreCreditTest1!"), name: "Store Credit Test Finance", role: "finance", emailVerifiedAt: new Date() });
    financeId = Number(financeInsert[0].insertId);
    const warehouseInsert = await db.insert(users).values({ email: `${marker}-warehouse@example.invalid`, passwordHash: await hashPassword("StoreCreditTest1!"), name: "Store Credit Test Warehouse", role: "warehouse", emailVerifiedAt: new Date() });
    warehouseId = Number(warehouseInsert[0].insertId);
    const customerInsert = await db.insert(users).values({ email: `${marker}-customer@example.invalid`, passwordHash: await hashPassword("StoreCreditTest1!"), name: "Store Credit Test Customer", role: "user", emailVerifiedAt: new Date() });
    customerId = Number(customerInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(storeCreditLedger).where(eq(storeCreditLedger.userId, customerId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, financeId));
    if (financeId) await db.delete(users).where(eq(users.id, financeId));
    if (warehouseId) await db.delete(users).where(eq(users.id, warehouseId));
    if (customerId) await db.delete(users).where(eq(users.id, customerId));
  });

  const financeUser = () => ({ id: financeId, email: `${marker}-finance@example.invalid`, name: "Store Credit Test Finance", role: "finance" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const warehouseUser = () => ({ ...financeUser(), id: warehouseId, role: "warehouse" as const });

  it("issuing credit updates the cached balance and writes a ledger row; a delta that would go negative is rejected", async () => {
    const finance = callerFor(financeUser());

    const afterIssue = await finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: 15_000, reason: "QA: goodwill credit" });
    expect(afterIssue.storeCreditMnt).toBe(15_000);

    const ledgerAfterIssue = await finance.admin.storeCreditLedger({ userId: customerId });
    expect(ledgerAfterIssue).toHaveLength(1);
    expect(ledgerAfterIssue[0]).toMatchObject({ deltaMnt: 15_000, reason: "QA: goodwill credit", actorEmail: `${marker}-finance@example.invalid` });

    // Spending more than the balance is rejected, and leaves the balance/ledger untouched.
    await expect(finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: -20_000, reason: "QA: over-spend attempt" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const detailAfterRejectedSpend = await finance.admin.userDetail({ userId: customerId });
    expect(detailAfterRejectedSpend.storeCreditMnt).toBe(15_000);
    const ledgerAfterRejectedSpend = await finance.admin.storeCreditLedger({ userId: customerId });
    expect(ledgerAfterRejectedSpend).toHaveLength(1);

    // A partial spend within the balance succeeds and is reflected in both places.
    const afterSpend = await finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: -5_000, reason: "QA: partial spend" });
    expect(afterSpend.storeCreditMnt).toBe(10_000);
    const ledgerAfterSpend = await finance.admin.storeCreditLedger({ userId: customerId });
    expect(ledgerAfterSpend).toHaveLength(2);
  });

  it("keeps store credit finance/admin-only — warehouse (which manages fulfilment, not money) is forbidden", async () => {
    const warehouse = callerFor(warehouseUser());
    await expect(warehouse.admin.adjustStoreCredit({ userId: customerId, deltaMnt: 1_000, reason: "should be forbidden" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(warehouse.admin.storeCreditLedger({ userId: customerId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// Phase I: the actual checkout-consumption half of the plan -- proves a
// balance isn't just storable, it's spendable at a REAL checkout (order.
// storeCreditAppliedMnt/totalMnt reflect it, and the ledger/balance move
// together), that the server re-caps a client-requested amount at the real
// balance rather than trusting it, and that a double-submit (two concurrent
// createOrder calls against the same populated cart, both asking to spend
// the full balance) can never spend past what's actually available -- same
// concurrency discipline this project already uses for phone-verification
// sessions (see verifyMn.integration.test.ts's BUG-003 regression tests).
// Own dedicated fixtures (not the describe block above's shared customerId)
// so this suite's balance arithmetic is never coupled to another suite's
// mutation order.
const runCheckoutConsumption = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1";
const maybeDescribeCheckout = runCheckoutConsumption ? describe : describe.skip;

maybeDescribeCheckout("store credit checkout consumption integration", () => {
  const marker = `store-credit-checkout-test-${Date.now()}`;
  let financeId = 0;
  let customerId = 0;
  let categoryId = 0;
  let productId = 0;
  const createdOrderIds: number[] = [];

  function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
    const ctx: TrpcContext = {
      user,
      req: { protocol: "https", headers: {}, ip: `203.0.116.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.116.1" } } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    };
    return appRouter.createCaller(ctx);
  }
  const customerUser = () => ({ id: customerId, email: `${marker}-customer@example.invalid`, name: "Store Credit Checkout Test Customer", role: "user" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const financeUser = () => ({ ...customerUser(), id: financeId, role: "finance" as const });

  async function checkoutAsCustomer(applyStoreCreditMnt: number) {
    return callerFor(customerUser()).checkout.createOrder({
      customerName: "Store Credit Checkout Test", customerPhone: "88110002", customerEmail: `${marker}-customer@example.invalid`,
      paymentMethod: "cash_on_delivery", deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар",
      applyStoreCreditMnt,
    });
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for store credit checkout consumption integration tests.");
    const financeInsert = await db.insert(users).values({ email: `${marker}-finance@example.invalid`, passwordHash: await hashPassword("StoreCreditTest1!"), name: "Store Credit Checkout Test Finance", role: "finance", emailVerifiedAt: new Date() });
    financeId = Number(financeInsert[0].insertId);
    const customerInsert = await db.insert(users).values({ email: `${marker}-customer@example.invalid`, passwordHash: await hashPassword("StoreCreditTest1!"), name: "Store Credit Checkout Test Customer", role: "user", emailVerifiedAt: new Date() });
    customerId = Number(customerInsert[0].insertId);
    const categoryResult = await db.insert(productCategories).values({ name: "Store credit checkout test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Store credit checkout test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 20_000, stockQuantity: 100, isPublished: true });
    productId = Number(productResult[0].insertId);
    await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 20_000, stockQuantity: 100, isDefault: true });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(storeCreditLedger).where(eq(storeCreditLedger.userId, customerId));
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, financeId));
    if (financeId) await db.delete(users).where(eq(users.id, financeId));
    if (customerId) await db.delete(users).where(eq(users.id, customerId));
  });

  it("a checkout applying available credit reduces the charged total, and moves the ledger/balance together", async () => {
    const finance = callerFor(financeUser());
    await finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: 12_000, reason: "QA: checkout consumption seed" });

    await callerFor(customerUser()).cart.addItem({ productId, quantity: 1 });
    const order = await checkoutAsCustomer(12_000);
    createdOrderIds.push(order.id);
    expect(order.storeCreditAppliedMnt).toBe(12_000);
    expect(order.totalMnt).toBe(20_000 - 12_000);

    const detail = await finance.admin.userDetail({ userId: customerId });
    expect(detail.storeCreditMnt).toBe(0);
    const ledger = await finance.admin.storeCreditLedger({ userId: customerId });
    expect(ledger[0]).toMatchObject({ deltaMnt: -12_000, orderId: order.id });
  });

  it("caps the applied amount at the real balance server-side, even if the client asks to spend more than it has", async () => {
    const finance = callerFor(financeUser());
    await finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: 5_000, reason: "QA: cap test seed" });

    await callerFor(customerUser()).cart.addItem({ productId, quantity: 1 });
    const order = await checkoutAsCustomer(999_999);
    createdOrderIds.push(order.id);
    expect(order.storeCreditAppliedMnt).toBe(5_000);
    expect(order.totalMnt).toBe(20_000 - 5_000);

    const detail = await finance.admin.userDetail({ userId: customerId });
    expect(detail.storeCreditMnt).toBe(0);
  });

  it("never lets a double-submit (two concurrent checkouts against the same cart) spend past the same balance", async () => {
    const finance = callerFor(financeUser());
    await finance.admin.adjustStoreCredit({ userId: customerId, deltaMnt: 15_000, reason: "QA: concurrency seed" });

    // One populated cart, added once -- then two concurrent createOrder
    // calls against it (the real shape of a double-clicked submit button),
    // each asking to spend the FULL balance. Only one can win the atomic
    // guarded UPDATE inside createOrderFromActiveCart; the loser's whole
    // transaction (order, stock decrement included) rolls back rather than
    // partially spending, matching this project's existing race-proof
    // idiom (BUG-003).
    await callerFor(customerUser()).cart.addItem({ productId, quantity: 1 });
    const results = await Promise.allSettled([checkoutAsCustomer(15_000), checkoutAsCustomer(15_000)]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof checkoutAsCustomer>>> => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    fulfilled.forEach(r => createdOrderIds.push(r.value.id));
    expect(fulfilled[0].value.storeCreditAppliedMnt).toBe(15_000);

    const finalDetail = await finance.admin.userDetail({ userId: customerId });
    expect(finalDetail.storeCreditMnt).toBe(0);
    const ledger = await finance.admin.storeCreditLedger({ userId: customerId });
    // Exactly one -15,000 spend landed in the ledger, not two.
    expect(ledger.filter(entry => entry.deltaMnt === -15_000)).toHaveLength(1);
  });
});
