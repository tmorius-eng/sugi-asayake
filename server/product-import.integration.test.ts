import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, like } from "drizzle-orm";
import { adminAuditLogs, productCategories, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin overhaul (2026-09-08, Phase H): bulk CSV product import runs every
// row through the exact same productWriteSchema/productUpdateSchema +
// validateProductWrite pipeline the single-product composer uses (see
// importProductsCsvRows in server/routers.ts) -- covers the create path,
// update-by-SKU (both allowed and disallowed), a batch with one
// deliberately-bad row confirming the rest still commit, and that dryRun
// genuinely writes nothing.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.150.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.150.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("bulk CSV product import integration", () => {
  const marker = `csv${Date.now().toString(36)}`;
  const warehouseEmail = `${marker}-warehouse@example.invalid`;
  let warehouseId = 0;
  let categoryId = 0;
  const categoryName = `CSV Import Category ${marker}`;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for CSV import integration tests.");
    const warehouseInsert = await db.insert(users).values({ email: warehouseEmail, passwordHash: await hashPassword("WarehousePassw0rd!"), name: "CSV Import Warehouse", role: "warehouse", emailVerifiedAt: new Date() });
    warehouseId = Number(warehouseInsert[0].insertId);
    const categoryResult = await db.insert(productCategories).values({ name: categoryName, slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(products).where(like(products.sku, `${marker}-%`));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, warehouseId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (warehouseId) await db.delete(users).where(eq(users.id, warehouseId));
  });

  const warehouseUser = () => testSessionUser({ id: warehouseId, email: warehouseEmail, name: "CSV Import Warehouse", role: "warehouse" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  it("dryRun validates but writes nothing to the database", async () => {
    const caller = callerFor(warehouseUser());
    const sku = `${marker}-DRY`;
    const { results } = await caller.admin.importProductsCsv({
      rows: [{ sku, name: "CSV Dry Run Product", category: categoryName, priceMnt: "15000", stockQuantity: "5" }],
      allowUpdateExisting: false,
      dryRun: true,
    });
    expect(results).toEqual([{ row: 0, sku, outcome: "created", message: null }]);

    const db = await getDb();
    if (!db) throw new Error("no db");
    const rows = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku));
    expect(rows).toHaveLength(0);
  });

  it("creates a new product from a valid row", async () => {
    const caller = callerFor(warehouseUser());
    const sku = `${marker}-NEW`;
    const { results } = await caller.admin.importProductsCsv({
      rows: [{ sku, name: "CSV New Product", category: categoryName, priceMnt: "20000", stockQuantity: "10", isPublished: "true" }],
      allowUpdateExisting: false,
      dryRun: false,
    });
    expect(results).toEqual([{ row: 0, sku, outcome: "created", message: null }]);

    const db = await getDb();
    if (!db) throw new Error("no db");
    const [created] = await db.select().from(products).where(eq(products.sku, sku));
    expect(created).toMatchObject({ name: "CSV New Product", priceMnt: 20000, stockQuantity: 10, isPublished: true, categoryId });
    expect(created.slug).toBe("csv-new-product");
  });

  it("updates an existing product by SKU only when allowUpdateExisting is true, otherwise skips it", async () => {
    const caller = callerFor(warehouseUser());
    const sku = `${marker}-UPD`;
    await caller.admin.importProductsCsv({ rows: [{ sku, name: "CSV Update Product (original)", category: categoryName, priceMnt: "10000", stockQuantity: "1" }], allowUpdateExisting: false, dryRun: false });

    const disallowed = await caller.admin.importProductsCsv({ rows: [{ sku, priceMnt: "99999" }], allowUpdateExisting: false, dryRun: false });
    expect(disallowed.results).toEqual([{ row: 0, sku, outcome: "skipped", message: expect.any(String) }]);

    const db = await getDb();
    if (!db) throw new Error("no db");
    const [afterSkip] = await db.select({ priceMnt: products.priceMnt }).from(products).where(eq(products.sku, sku));
    expect(afterSkip.priceMnt).toBe(10000);

    const allowed = await caller.admin.importProductsCsv({ rows: [{ sku, priceMnt: "12345" }], allowUpdateExisting: true, dryRun: false });
    expect(allowed.results).toEqual([{ row: 0, sku, outcome: "updated", message: null }]);

    const [afterUpdate] = await db.select({ priceMnt: products.priceMnt, name: products.name }).from(products).where(eq(products.sku, sku));
    expect(afterUpdate.priceMnt).toBe(12345);
    // Partial update -- name wasn't in the second row, so it's untouched.
    expect(afterUpdate.name).toBe("CSV Update Product (original)");
  });

  it("commits the good rows in a batch even when one row is bad, and reports the bad row as an error", async () => {
    const caller = callerFor(warehouseUser());
    const goodSkuA = `${marker}-BATCH-A`;
    const goodSkuB = `${marker}-BATCH-B`;
    const { results } = await caller.admin.importProductsCsv({
      rows: [
        { sku: goodSkuA, name: "CSV Batch Product A", category: categoryName, priceMnt: "5000", stockQuantity: "2" },
        { sku: `${marker}-BATCH-BAD`, name: "CSV Batch Bad Product", category: "Nonexistent Category Name", priceMnt: "5000", stockQuantity: "2" },
        { sku: goodSkuB, name: "CSV Batch Product B", category: categoryName, priceMnt: "6000", stockQuantity: "3" },
      ],
      allowUpdateExisting: false,
      dryRun: false,
    });
    expect(results[0]).toMatchObject({ sku: goodSkuA, outcome: "created" });
    expect(results[1]).toMatchObject({ outcome: "error" });
    expect(results[1].message).toContain("Ангилал олдсонгүй");
    expect(results[2]).toMatchObject({ sku: goodSkuB, outcome: "created" });

    const db = await getDb();
    if (!db) throw new Error("no db");
    const createdRows = await db.select({ sku: products.sku }).from(products).where(like(products.sku, `${marker}-BATCH-%`));
    expect(createdRows.map(row => row.sku).sort()).toEqual([goodSkuA, goodSkuB]);
  });

  it("rejects a non-warehouse role", async () => {
    const marketing = callerFor(testSessionUser({ id: warehouseId, email: warehouseEmail, name: "x", role: "marketing", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }));
    await expect(marketing.admin.importProductsCsv({ rows: [{ sku: "x", name: "x", category: categoryName, priceMnt: "1000", stockQuantity: "1" }], allowUpdateExisting: false, dryRun: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
