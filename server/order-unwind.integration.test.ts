import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { adminAuditLogs, cartItems, carts, orderItems, orders, paymentAttempts, productCategories, productVariants, products, storeCreditLedger, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { createOrderFromActiveCart, getDb, markQPayPaymentAttemptPaid } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Audit 2026-09-09 -- how a paid or credit-funded order is UNWOUND (cancel,
// refund, late payment webhook). Every case here was a real gap found by
// tracing checkout -> cancel -> refund -> webhook -> analytics/loyalty end to
// end; none of the existing suites covered the money side of an unwind.
// Same marker-prefixed-throwaway-row convention as every other integration
// suite in this project; everything is deleted in afterAll.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.150.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.150.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("order unwind integration (cancel / refund / late webhook)", () => {
  // orders.orderNumber is varchar(32) -- keep the prefix short.
  const marker = `unw${Date.now().toString(36)}`;
  const customerEmail = `${marker}-customer@example.invalid`;
  const warehouseEmail = `${marker}-warehouse@example.invalid`;
  const financeEmail = `${marker}-finance@example.invalid`;
  let customerId = 0;
  let warehouseId = 0;
  let financeId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  let bigSellerId = 0;
  let bigSellerVariantId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order unwind integration tests.");
    const customerInsert = await db.insert(users).values({ email: customerEmail, passwordHash: await hashPassword("UnwindPassw0rd!"), name: "Unwind Test Customer", role: "user", emailVerifiedAt: new Date() });
    customerId = Number(customerInsert[0].insertId);
    const warehouseInsert = await db.insert(users).values({ email: warehouseEmail, passwordHash: await hashPassword("UnwindPassw0rd!"), name: "Unwind Test Warehouse", role: "warehouse", emailVerifiedAt: new Date() });
    warehouseId = Number(warehouseInsert[0].insertId);
    const financeInsert = await db.insert(users).values({ email: financeEmail, passwordHash: await hashPassword("UnwindPassw0rd!"), name: "Unwind Test Finance", role: "finance", emailVerifiedAt: new Date() });
    financeId = Number(financeInsert[0].insertId);

    const categoryResult = await db.insert(productCategories).values({ name: "Unwind test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Unwind test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 10, isPublished: true });
    productId = Number(productResult[0].insertId);
    const variantResult = await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 10, isDefault: true });
    variantId = Number(variantResult[0].insertId);
    const bigResult = await db.insert(products).values({ categoryId, name: "Unwind test cancelled bestseller", slug: `${marker}-big`, sku: `${marker}-SKU-BIG`, priceMnt: 10_000, stockQuantity: 1000, isPublished: true });
    bigSellerId = Number(bigResult[0].insertId);
    const bigVariantResult = await db.insert(productVariants).values({ productId: bigSellerId, sku: `${marker}-SKU-BIG`, priceMnt: 10_000, stockQuantity: 1000, isDefault: true });
    bigSellerVariantId = Number(bigVariantResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) {
      await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    if (customerId) {
      const customerCarts = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, customerId));
      for (const cart of customerCarts) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(eq(carts.userId, customerId));
      await db.delete(storeCreditLedger).where(eq(storeCreditLedger.userId, customerId));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (bigSellerId) await db.delete(products).where(eq(products.id, bigSellerId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (warehouseId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, warehouseId));
    if (financeId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, financeId));
    for (const id of [customerId, warehouseId, financeId]) if (id) await db.delete(users).where(eq(users.id, id));
    // ~50 sequential round trips to Aiven (170-330ms each) -- the default
    // 10s hook budget was always borderline and started timing out on
    // 2026-09-11, after the suite grew. Cleanup must finish, not race a clock.
  }, 60_000);

  const baseUser = () => ({ emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const customerUser = () => ({ ...baseUser(), id: customerId, email: customerEmail, name: "Unwind Test Customer", role: "user" as const });
  const warehouseUser = () => ({ ...baseUser(), id: warehouseId, email: warehouseEmail, name: "Unwind Test Warehouse", role: "warehouse" as const });
  const financeUser = () => ({ ...baseUser(), id: financeId, email: financeEmail, name: "Unwind Test Finance", role: "finance" as const });

  type Seed = {
    status: "pending" | "confirmed" | "packed" | "completed";
    paymentStatus: "unpaid" | "paid";
    paymentMethod?: "qpay" | "cash_on_delivery";
    quantity?: number;
    storeCreditAppliedMnt?: number;
    product?: { productId: number; variantId: number };
  };

  // Mirrors what createOrderFromActiveCart leaves behind for an order that
  // spent store credit: the order row carries storeCreditAppliedMnt, the
  // customer's balance was already debited, and the ledger has the -delta.
  async function seedOrder(seed: Seed) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const quantity = seed.quantity ?? 1;
    const credit = seed.storeCreditAppliedMnt ?? 0;
    const subtotalMnt = 10_000 * quantity;
    const target = seed.product ?? { productId, variantId };
    const orderNumber = `${marker}-${orderIds.length}`;
    const insert = await db.insert(orders).values({
      userId: customerId, orderNumber, status: seed.status, paymentMethod: seed.paymentMethod ?? "cash_on_delivery", paymentStatus: seed.paymentStatus,
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Unwind Test Customer", customerPhone: "88110000",
      subtotalMnt, storeCreditAppliedMnt: credit, totalMnt: subtotalMnt - credit,
    });
    const orderId = Number(insert[0].insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productId: target.productId, variantId: target.variantId, productName: "Unwind test product", sku: `${marker}-SKU`, unitPriceMnt: 10_000, quantity });
    if (credit > 0) {
      // Keep the cache/ledger invariant that System Health now checks: the
      // customer first RECEIVED the credit (balance +credit, ledger +credit),
      // then spent it at checkout (balance -credit, ledger -credit) -- net
      // balance 0 and ledger sum 0, exactly what a real checkout leaves.
      await db.insert(storeCreditLedger).values({ userId: customerId, deltaMnt: credit, reason: "QA: goodwill credit (seed)", actorUserId: null, orderId: null });
      await db.insert(storeCreditLedger).values({ userId: customerId, deltaMnt: -credit, reason: `Захиалга ${orderNumber}-д зарцуулсан`, actorUserId: null, orderId });
    }
    return { orderId, totalMnt: subtotalMnt - credit };
  }

  async function balance() {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [row] = await db.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, customerId)).limit(1);
    return row?.storeCreditMnt ?? -1;
  }

  async function positiveLedgerRowsFor(orderId: number) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    return db.select({ id: storeCreditLedger.id, deltaMnt: storeCreditLedger.deltaMnt }).from(storeCreditLedger)
      .where(and(eq(storeCreditLedger.orderId, orderId), sql`${storeCreditLedger.deltaMnt} > 0`));
  }

  async function variantStock(id: number) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [row] = await db.select({ stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, id)).limit(1);
    return row.stockQuantity;
  }

  it("self-cancelling an order that spent store credit returns the credit, exactly once, and a later refund does not credit it again", async () => {
    const { orderId, totalMnt } = await seedOrder({ status: "confirmed", paymentStatus: "paid", paymentMethod: "qpay", storeCreditAppliedMnt: 3_000 });
    const before = await balance();

    const cancelled = await callerFor(customerUser()).orders.cancel({ id: orderId });
    expect(cancelled.status).toBe("cancelled");
    expect(await balance()).toBe(before + 3_000);
    const rows = await positiveLedgerRowsFor(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0].deltaMnt).toBe(3_000);

    // The cash side is still owed back -- finance can now record that refund
    // on the cancelled order (previously a dead end: "Only a returned order
    // can be refunded"), and doing so must NOT return the credit a 2nd time.
    const refunded = await callerFor(financeUser()).admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false });
    expect(refunded.paymentStatus).toBe("refunded");
    expect(refunded.refundAmountMnt).toBe(totalMnt);
    expect(await balance()).toBe(before + 3_000);
    expect(await positiveLedgerRowsFor(orderId)).toHaveLength(1);
  });

  it("refunding a returned order returns the credit portion as credit while the cash refund stays capped at the cash total", async () => {
    const { orderId, totalMnt } = await seedOrder({ status: "completed", paymentStatus: "paid", storeCreditAppliedMnt: 2_500 });
    const before = await balance();
    const returned = await callerFor(warehouseUser()).admin.updateOrder({ id: orderId, status: "returned" });
    expect(returned.status).toBe("returned");

    const finance = callerFor(financeUser());
    // totalMnt is the cash paid (7,500) -- refunding the pre-credit 10,000 is refused.
    await expect(finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt + 1, restockItems: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const refunded = await finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false });
    expect(refunded.paymentStatus).toBe("refunded");
    expect(await balance()).toBe(before + 2_500);
  });

  it("refuses to refund an order that was never recorded as paid", async () => {
    const { orderId } = await seedOrder({ status: "pending", paymentStatus: "unpaid" });
    await callerFor(customerUser()).orders.cancel({ id: orderId });
    await expect(callerFor(financeUser()).admin.refundOrder({ id: orderId, refundAmountMnt: 10_000, restockItems: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("two concurrent cancellations of the same order restore stock exactly once", async () => {
    const { orderId } = await seedOrder({ status: "confirmed", paymentStatus: "unpaid", quantity: 2 });
    const before = await variantStock(variantId);

    const results = await Promise.allSettled([
      callerFor(customerUser()).orders.cancel({ id: orderId }),
      callerFor(warehouseUser()).admin.updateOrder({ id: orderId, status: "cancelled" }),
    ]);
    const fulfilled = results.filter(result => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "BAD_REQUEST" });

    expect(await variantStock(variantId)).toBe(before + 2);
  });

  it("two concurrent refunds of the same order restock exactly once and record one refund", async () => {
    const { orderId, totalMnt } = await seedOrder({ status: "completed", paymentStatus: "paid", quantity: 3 });
    await callerFor(warehouseUser()).admin.updateOrder({ id: orderId, status: "returned" });
    const before = await variantStock(variantId);

    const finance = callerFor(financeUser());
    const results = await Promise.allSettled([
      finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: true }),
      finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: true }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await variantStock(variantId)).toBe(before + 3);
  });

  it("a paid order that was later cancelled no longer counts as loyalty spend or bestseller volume", async () => {
    // Positive control: a settled sale big enough to top any real bestseller
    // list, so "absent" below can only mean "excluded", not "outranked".
    await seedOrder({ status: "completed", paymentStatus: "paid", quantity: 400, storeCreditAppliedMnt: 0 });
    // Paid at webhook time, then cancelled by the customer while still
    // "confirmed" -- paymentStatus stays "paid" (money was collected).
    const { orderId: cancelledId } = await seedOrder({ status: "confirmed", paymentStatus: "paid", paymentMethod: "qpay", quantity: 500, product: { productId: bigSellerId, variantId: bigSellerVariantId } });
    await callerFor(customerUser()).orders.cancel({ id: cancelledId });

    const status = await callerFor(customerUser()).loyalty.myStatus();
    expect(status?.onlineSpendMnt).toBe(4_000_000);

    const bestsellers = await callerFor(null).catalog.bestsellers();
    const ids = bestsellers.map(product => product.id);
    expect(ids).toContain(productId);
    expect(ids).not.toContain(bigSellerId);
  });

  it("a late QPay webhook cannot resurrect a cancelled order, but still confirms a genuinely pending one and never moves a packed one backward", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const attemptFor = async (orderId: number) => {
      await db.insert(paymentAttempts).values({ orderId, provider: "qpay", providerInvoiceId: `${marker}-inv-${orderId}`, responseJson: "{}" });
      const [row] = await db.select({ id: paymentAttempts.id }).from(paymentAttempts).where(eq(paymentAttempts.providerInvoiceId, `${marker}-inv-${orderId}`)).limit(1);
      return row.id;
    };
    const orderRow = async (id: number) => (await db.select({ status: orders.status, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, id)).limit(1))[0];

    // Cancelled (stock already restored) -> untouched.
    const { orderId: cancelledId } = await seedOrder({ status: "pending", paymentStatus: "unpaid", paymentMethod: "qpay" });
    await callerFor(customerUser()).orders.cancel({ id: cancelledId });
    const cancelledAttempt = await attemptFor(cancelledId);
    expect(await markQPayPaymentAttemptPaid({ id: cancelledAttempt, orderId: cancelledId, providerPaymentId: `${marker}-pay-1` })).toEqual({ orderUpdated: false });
    expect(await orderRow(cancelledId)).toEqual({ status: "cancelled", paymentStatus: "unpaid" });
    const [attemptRow] = await db.select({ status: paymentAttempts.status }).from(paymentAttempts).where(eq(paymentAttempts.id, cancelledAttempt)).limit(1);
    expect(attemptRow.status).toBe("paid"); // the money's arrival is still on record

    // Pending -> confirmed + paid (the normal path), and a duplicate delivery is a no-op.
    const { orderId: pendingId } = await seedOrder({ status: "pending", paymentStatus: "unpaid", paymentMethod: "qpay" });
    const pendingAttempt = await attemptFor(pendingId);
    expect(await markQPayPaymentAttemptPaid({ id: pendingAttempt, orderId: pendingId, providerPaymentId: `${marker}-pay-2` })).toEqual({ orderUpdated: true });
    expect(await orderRow(pendingId)).toEqual({ status: "confirmed", paymentStatus: "paid" });
    expect(await markQPayPaymentAttemptPaid({ id: pendingAttempt, orderId: pendingId, providerPaymentId: `${marker}-pay-2` })).toEqual({ orderUpdated: false });

    // Already packed before the payment landed -> paid, but stays packed.
    const { orderId: packedId } = await seedOrder({ status: "packed", paymentStatus: "unpaid", paymentMethod: "qpay" });
    const packedAttempt = await attemptFor(packedId);
    expect(await markQPayPaymentAttemptPaid({ id: packedAttempt, orderId: packedId, providerPaymentId: `${marker}-pay-3` })).toEqual({ orderUpdated: true });
    expect(await orderRow(packedId)).toEqual({ status: "packed", paymentStatus: "paid" });
  });

  it("refuses to mint a QPay invoice for a closed order", async () => {
    const { orderId } = await seedOrder({ status: "pending", paymentStatus: "unpaid", paymentMethod: "qpay" });
    await callerFor(customerUser()).orders.cancel({ id: orderId });
    // Fake credentials so the "configured" precondition passes and the
    // closed-order guard is what answers -- it sits before any network call.
    const saved = { u: process.env.QPAY_USERNAME, p: process.env.QPAY_PASSWORD, c: process.env.QPAY_INVOICE_CODE };
    process.env.QPAY_USERNAME = "test"; process.env.QPAY_PASSWORD = "test"; process.env.QPAY_INVOICE_CODE = "test";
    try {
      await expect(callerFor(customerUser()).payments.qpayCreateInvoice({ orderId })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("closed") });
    } finally {
      process.env.QPAY_USERNAME = saved.u; process.env.QPAY_PASSWORD = saved.p; process.env.QPAY_INVOICE_CODE = saved.c;
    }
  });

  // Audit 2026-09-09 (R5): a UNIQUE collision on orderNumber is retried
  // with a fresh number instead of surfacing as a raw database error.
  it("retries with a fresh order number when the generated one collides with an existing order", async () => {
    const { orderId: existingId } = await seedOrder({ status: "pending", paymentStatus: "unpaid" });
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [existing] = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, existingId)).limit(1);
    await callerFor(customerUser()).cart.addItem({ productId, quantity: 1 });

    const sequence = [existing.orderNumber, `${marker}-fresh`];
    const created = await createOrderFromActiveCart({
      owner: { userId: customerId }, customerName: "Unwind Test Customer", customerPhone: "88110000",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery",
    }, { generateOrderNumber: () => sequence.shift() ?? `${marker}-more` });
    orderIds.push(created.id);
    expect(created.orderNumber).toBe(`${marker}-fresh`);
    expect(sequence).toHaveLength(0);
  });

  // Audit 2026-09-09 (R4): server-side paging.
  it("pages and searches users server-side", async () => {
    const finance = callerFor(financeUser());
    const page1 = await finance.admin.users({ search: marker, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    const page2 = await finance.admin.users({ search: marker, page: 2, pageSize: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(new Set([...page1.rows, ...page2.rows].map(user => user.id)).size).toBe(3);
    expect((await finance.admin.users({ search: `${marker}-finance` })).rows.map(user => user.id)).toEqual([financeId]);
  });

  it("pages a customer's own orders by cursor, newest first, with a stable total", async () => {
    const customer = callerFor(customerUser());
    const first = await customer.orders.mine({ limit: 2 });
    expect(first.orders).toHaveLength(2);
    expect(first.total).toBeGreaterThanOrEqual(3);
    expect(first.orders[0].id).toBeGreaterThan(first.orders[1].id);
    expect(first.nextCursor).toBe(first.orders[1].id);
    const seen = new Set(first.orders.map(order => order.id));
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await customer.orders.mine({ limit: 2, cursor });
      for (const order of page.orders) { expect(seen.has(order.id)).toBe(false); seen.add(order.id); }
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(first.total);
  });

  // Audit 2026-09-09 (R2 + debt #3): the dashboard counts refund-owed orders
  // and System Health checks the store-credit cache against the ledger.
  it("counts refund-owed orders on the dashboard and reports the store-credit ledger in balance", async () => {
    const { orderId, totalMnt } = await seedOrder({ status: "confirmed", paymentStatus: "paid", paymentMethod: "qpay" });
    const finance = callerFor(financeUser());
    const before = (await finance.admin.dashboardSummary()).refundOwedCount;
    await callerFor(customerUser()).orders.cancel({ id: orderId });
    expect((await finance.admin.dashboardSummary()).refundOwedCount).toBe(before + 1);
    await finance.admin.refundOrder({ id: orderId, refundAmountMnt: totalMnt, restockItems: false });
    expect((await finance.admin.dashboardSummary()).refundOwedCount).toBe(before);

    const health = await finance.admin.systemHealth();
    expect(health.storeCredit).toMatchObject({ ok: true, driftedAccounts: 0 });
  });
});
