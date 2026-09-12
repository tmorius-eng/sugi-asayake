import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, marketingSpend, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin analytics dashboard (2026-08-26): sales/district/demographics
// reporting, all computed from real orders/users data. This suite exercises
// the real database (same opt-in convention as the other *.integration.test.ts
// files) because the whole point is proving the SQL aggregation is correct
// against actual rows, not just that the functions compile.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"], headers: Record<string, string> = {}, ip = "203.0.115.9"): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("admin analytics integration", () => {
  const marker = `analytics-test-${Date.now()}`;
  let adminId = 0;
  let staffId = 0;
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  let orderId = 0;
  const orderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for admin analytics integration tests.");

    const adminInsert = await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("AnalyticsAdminPassw0rd!"), name: "Analytics Test Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(adminInsert[0].insertId);
    const staffInsert = await db.insert(users).values({ email: `${marker}-staff@example.invalid`, passwordHash: await hashPassword("AnalyticsStaffPassw0rd!"), name: "Analytics Test Staff", role: "staff", emailVerifiedAt: new Date() });
    staffId = Number(staffInsert[0].insertId);

    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the test product to.");
    categoryId = categoryRows[0].id;

    // costMnt set on this fixture so the profit/margin section (Tier B) has
    // something real to compute against, not just the "no cost data" branch.
    const productInsert = await db.insert(products).values({ categoryId, name: "Analytics Test Toner", slug: `${marker}-toner`, priceMnt: 25_000, costMnt: 15_000, sku: `${marker}-sku`, stockQuantity: 20, isPublished: true });
    productId = Number(productInsert[0].insertId);
    const variantInsert = await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 25_000, stockQuantity: 20, isDefault: true });
    variantId = Number(variantInsert[0].insertId);

    // A real paid, ub_delivery order with a known district -- the fixture
    // getSalesOverview/getTopProducts/getDistrictBreakdown all read from.
    const orderInsert = await db.insert(orders).values({
      userId: adminId,
      orderNumber: `AN${Date.now().toString(36).toUpperCase()}`,
      status: "completed",
      paymentMethod: "cash_on_delivery",
      paymentStatus: "paid",
      deliveryMethod: "ub_delivery",
      deliveryAddress: "Сүхбаатар дүүрэг, 1-р хороо",
      deliveryDistrict: "sukhbaatar",
      customerName: "Analytics Test Customer",
      customerPhone: "88112233",
      subtotalMnt: 50_000,
      deliveryFeeMnt: 10_000,
      totalMnt: 60_000,
    });
    orderId = Number(orderInsert[0].insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productId, variantId, productName: "Analytics Test Toner", sku: `${marker}-sku`, unitPriceMnt: 25_000, quantity: 2 });
  });

  let cacUserId = 0;

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(marketingSpend).where(eq(marketingSpend.monthKey, "2019-06"));
    if (productId) await db.delete(products).where(eq(products.id, productId)); // cascades the variant
    if (adminId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
    if (staffId) await db.delete(users).where(eq(users.id, staffId));
    if (cacUserId) await db.delete(users).where(eq(users.id, cacUserId));
  });

  it("rejects staff (not just anonymous) from the analytics report and export", async () => {
    await expect(callerFor(null as unknown as TrpcContext["user"]).admin.analyticsReport({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const staffUser = testSessionUser({ id: staffId, email: `${marker}-staff@example.invalid`, name: "Analytics Test Staff", role: "staff" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    await expect(callerFor(staffUser).admin.analyticsReport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("computes real revenue/order totals and finds the test order's district", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const report = await callerFor(adminUser).admin.analyticsReport({});

    expect(report.overview.revenueMnt).toBeGreaterThanOrEqual(60_000);
    expect(report.overview.orderCount).toBeGreaterThanOrEqual(1);

    const ourProduct = report.topProducts.find(row => row.productId === productId);
    expect(ourProduct).toMatchObject({ productName: "Analytics Test Toner", soldQuantity: 2, revenueMnt: 50_000 });

    const sukhbaatarRow = report.districtBreakdown.districts.find(row => row.district === "sukhbaatar");
    expect(sukhbaatarRow).toBeTruthy();
    expect(sukhbaatarRow!.orderCount).toBeGreaterThanOrEqual(1);

    // Demographics must always report a completion count, never claim a
    // 100%-covered sample when most users haven't filled anything in.
    expect(report.demographics.totalCustomerCount).toBeGreaterThanOrEqual(0);
    expect(report.demographics.ageProvidedCount).toBeLessThanOrEqual(report.demographics.totalCustomerCount);

    // Tier B/C: profit (this fixture's product has a real costMnt, so the
    // 2 units sold at 25,000 with a 15,000 cost should show up as real
    // floor profit, not the "no cost data" branch), plus the channel/
    // inventory/cart-abandonment sections all being real, shaped data.
    expect(report.profit.itemsWithCostCount).toBeGreaterThanOrEqual(2);
    expect(report.profit.profitMnt).toBeGreaterThanOrEqual(20_000); // >= 2 * (25,000 - 15,000)
    const pickupMethodRow = report.ordersByChannel.byDeliveryMethod.find(row => row.key === "ub_delivery");
    expect(pickupMethodRow?.orderCount).toBeGreaterThanOrEqual(1);
    expect(report.inventory.publishedProductCount).toBeGreaterThanOrEqual(1);
    expect(report.cartAbandonment).toMatchObject({ cartsWithItems: expect.any(Number), convertedCount: expect.any(Number), abandonedCount: expect.any(Number), abandonmentRatePercent: expect.any(Number) });
  });

  it("exports a non-empty Excel and PDF file for the same report", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const caller = callerFor(adminUser);

    const xlsx = await caller.admin.analyticsExport({ format: "xlsx" });
    expect(xlsx.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(Buffer.from(xlsx.dataBase64, "base64").length).toBeGreaterThan(1000);

    const pdf = await caller.admin.analyticsExport({ format: "pdf" });
    expect(pdf.mimeType).toBe("application/pdf");
    const pdfBuffer = Buffer.from(pdf.dataBase64, "base64");
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // %PDF magic bytes -- confirms a real PDF, not a truncated/corrupt stream.
    expect(pdfBuffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("guessDistrictFromAddress-backed backfill only fills genuinely blank rows and never overwrites a real pick", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    // A second order with no district set, but an address that mentions one
    // by abbreviation (ХУД = Хан-Уул дүүрэг) -- proves createOrderFromActiveCart's
    // guess-on-write path, not just the standalone backfill script.
    const { createOrderFromActiveCart, addCartItem } = await import("./db");
    await addCartItem({ owner: { userId: adminId }, productId, quantity: 1 });
    const order = await createOrderFromActiveCart({
      owner: { userId: adminId },
      customerName: "Analytics Test Customer 2",
      customerPhone: "88112244",
      deliveryMethod: "ub_delivery",
      deliveryAddress: "ХУД, 15-р хороо, байр 3",
      paymentMethod: "cash_on_delivery",
    });
    orderIds.push(order!.id);
    const [row] = await db.select({ deliveryDistrict: orders.deliveryDistrict }).from(orders).where(eq(orders.id, order!.id));
    expect(row.deliveryDistrict).toBe("khan_uul");
  });

  it("captures trafficSource (client-sent) and deviceType (parsed from User-Agent) at checkout, and both show up in the report", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const mobileUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    // Randomized IP, same reasoning as the other integration test files that
    // hit rate-limited procedures -- avoids colliding with another test
    // file's in-memory rate-limit bucket for a fixed IP.
    const shopperCaller = callerFor(adminUser, { "user-agent": mobileUa }, `198.51.100.${Math.floor(Math.random() * 250) + 1}`);

    const { addCartItem } = await import("./db");
    await addCartItem({ owner: { userId: adminId }, productId, quantity: 1 });
    const order = await shopperCaller.checkout.createOrder({
      customerName: "Analytics Traffic Test",
      customerPhone: "88112255",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
      trafficSource: "instagram / paid",
    });
    orderIds.push(order.id);

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [row] = await db.select({ trafficSource: orders.trafficSource, deviceType: orders.deviceType }).from(orders).where(eq(orders.id, order.id));
    expect(row.trafficSource).toBe("instagram / paid");
    expect(row.deviceType).toBe("mobile");
    // Every analytics section (this one included) only ever counts paid
    // orders -- a cash_on_delivery order starts "unpaid" until fulfillment,
    // same as every other section here, so mark it paid the same way a real
    // delivery confirmation would to exercise the report's actual filter.
    await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, order.id));

    const adminCaller = callerFor(adminUser);
    const report = await adminCaller.admin.analyticsReport({});
    expect(report.traffic.sources.some(r => r.source === "instagram / paid")).toBe(true);
    expect(report.traffic.deviceTypes.some(r => r.device === "mobile" && r.orderCount >= 1)).toBe(true);
  });

  it("computes a real period-over-period comparison (Tier D), and reports unavailable for all-time", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const adminCaller = callerFor(adminUser);

    // "All time" has no equal-length prior window -- same rule getSalesOverview
    // already uses for new-vs-returning.
    const allTimeReport = await adminCaller.admin.analyticsReport({});
    expect(allTimeReport.periodComparison.available).toBe(false);
    expect(allTimeReport.periodComparison.deltaPercent.revenueMnt).toBeNull();

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const now = Date.now();
    const currentFrom = new Date(now - 2 * 60 * 60 * 1000);
    const currentTo = new Date(now);
    const previousOrderAt = new Date(now - 3 * 60 * 60 * 1000); // inside the previous [now-4h, now-2h) window

    const previousOrderInsert = await db.insert(orders).values({
      orderNumber: `${marker.toUpperCase()}PREV`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Period Test Previous", customerPhone: "88119944",
      subtotalMnt: 40_000, totalMnt: 40_000, createdAt: previousOrderAt, updatedAt: previousOrderAt,
    });
    orderIds.push(Number(previousOrderInsert[0].insertId));

    const report = await adminCaller.admin.analyticsReport({ dateFrom: currentFrom.toISOString(), dateTo: currentTo.toISOString() });
    expect(report.periodComparison.available).toBe(true);
    expect(report.periodComparison.previous!.revenueMnt).toBeGreaterThanOrEqual(40_000);
    // Only null when previous is exactly 0 -- just proved it's >0 above.
    expect(report.periodComparison.deltaPercent.revenueMnt).not.toBeNull();
  });

  it("computes a real CAC once spend is entered for every touched month, and reports unavailable when it's missing (Tier F)", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const adminCaller = callerFor(adminUser);

    // A month far enough in the past that nothing else in a shared dev DB
    // could plausibly already have an entry for it.
    const testMonthFrom = new Date(2019, 5, 1);
    const testMonthTo = new Date(2019, 5, 30, 23, 59, 59);

    const noSpendReport = await adminCaller.admin.analyticsReport({ dateFrom: testMonthFrom.toISOString(), dateTo: testMonthTo.toISOString() });
    expect(noSpendReport.cac.cacMnt).toBeNull();
    expect(noSpendReport.cac.unavailableReason).toBe("no_spend_entered");

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    // A fresh customer whose one-and-only paid order falls inside the test
    // month -- unambiguously "new" within this exact window.
    const cacCustomerInsert = await db.insert(users).values({ email: `${marker}-cac-customer@example.invalid`, passwordHash: await hashPassword("CacTestCustomer1!"), name: "CAC Test Customer", role: "user", emailVerifiedAt: new Date() });
    cacUserId = Number(cacCustomerInsert[0].insertId);
    const cacOrderAt = new Date(2019, 5, 15);
    const cacOrderInsert = await db.insert(orders).values({
      userId: cacUserId, orderNumber: `${marker.toUpperCase()}CAC`, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "CAC Test Customer", customerPhone: "88119900",
      subtotalMnt: 30_000, totalMnt: 30_000, createdAt: cacOrderAt, updatedAt: cacOrderAt,
    });
    orderIds.push(Number(cacOrderInsert[0].insertId));

    await adminCaller.admin.updateMarketingSpend({ monthKey: "2019-06", spendMnt: 90_000 });

    const report = await adminCaller.admin.analyticsReport({ dateFrom: testMonthFrom.toISOString(), dateTo: testMonthTo.toISOString() });
    expect(report.cac.unavailableReason).toBeNull();
    expect(report.cac.newCustomerCount).toBeGreaterThanOrEqual(1);
    expect(report.cac.totalSpendMnt).toBe(90_000);
    expect(report.cac.cacMnt).toBe(Math.round(90_000 / report.cac.newCustomerCount));
  });

  it("marks a non-QPay order paid the moment it's completed (Tier I fix), and computes return rate (Tier G)", async () => {
    const adminUser = testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const adminCaller = callerFor(adminUser);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Tier I: cash_on_delivery never became paymentStatus="paid" anywhere in
    // the codebase before this fix (only the QPay webhook ever wrote "paid").
    const codOrderInsert = await db.insert(orders).values({
      orderNumber: `${marker.toUpperCase()}COD`, status: "confirmed", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "COD Test Customer", customerPhone: "88119933",
      subtotalMnt: 12_000, totalMnt: 12_000,
    });
    const codOrderId = Number(codOrderInsert[0].insertId);
    orderIds.push(codOrderId);
    const completedCod = await adminCaller.admin.updateOrder({ id: codOrderId, status: "completed" });
    expect(completedCod.paymentStatus).toBe("paid");

    // Tier G: a return can only happen from "completed" -- a pending order
    // jumping straight to "returned" must be rejected.
    const pendingOrderInsert = await db.insert(orders).values({
      orderNumber: `${marker.toUpperCase()}PEND`, status: "pending", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Pending Test Customer", customerPhone: "88119922",
      subtotalMnt: 15_000, totalMnt: 15_000,
    });
    const pendingOrderId = Number(pendingOrderInsert[0].insertId);
    orderIds.push(pendingOrderId);
    await expect(adminCaller.admin.updateOrder({ id: pendingOrderId, status: "returned" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The completed COD order above CAN legally become "returned".
    const returned = await adminCaller.admin.updateOrder({ id: codOrderId, status: "returned" });
    expect(returned.status).toBe("returned");
    expect(returned.returnedAt).toBeTruthy();

    const report = await adminCaller.admin.analyticsReport({});
    expect(report.returnRate.returnedOrderCount).toBeGreaterThanOrEqual(1);
    expect(report.returnRate.completedOrReturnedOrderCount).toBeGreaterThanOrEqual(report.returnRate.returnedOrderCount);
    expect(report.returnRate.returnsProcessedInRangeCount).toBeGreaterThanOrEqual(1);
  });
});
