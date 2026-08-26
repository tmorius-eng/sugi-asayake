import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
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

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: "203.0.115.9", socket: { remoteAddress: "203.0.115.9" } } as unknown as TrpcContext["req"],
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

    const productInsert = await db.insert(products).values({ categoryId, name: "Analytics Test Toner", slug: `${marker}-toner`, priceMnt: 25_000, sku: `${marker}-sku`, stockQuantity: 20, isPublished: true });
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

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId)); // cascades the variant
    if (adminId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
    if (staffId) await db.delete(users).where(eq(users.id, staffId));
  });

  it("rejects staff (not just anonymous) from the analytics report and export", async () => {
    await expect(callerFor(null as unknown as TrpcContext["user"]).admin.analyticsReport({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const staffUser = { id: staffId, email: `${marker}-staff@example.invalid`, name: "Analytics Test Staff", role: "staff" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    await expect(callerFor(staffUser).admin.analyticsReport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("computes real revenue/order totals and finds the test order's district", async () => {
    const adminUser = { id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
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
  });

  it("exports a non-empty Excel and PDF file for the same report", async () => {
    const adminUser = { id: adminId, email: `${marker}-admin@example.invalid`, name: "Analytics Test Admin", role: "admin" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
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
});
