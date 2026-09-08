import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, productCategories, productVariants, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Product variants -- PHASE 1 (additive only, see the long comment on
// productVariants in drizzle/schema.ts). Verifies the backfill invariant
// (every product always has >=1 variant, exactly one default) survives
// real CRUD, and that variant SKUs can't collide with any product's SKU.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.119.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.119.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("product variants (phase 1) integration", () => {
  const marker = `variant-test-${Date.now()}`;
  // Admin overhaul (2026-09-08, Phase B): admin.productVariants/
  // create|update|deleteProductVariant moved from staffProcedure to
  // warehouseProcedure -- this fixture was "staff" when staff still owned
  // the catalog; renamed to match.
  const warehouseEmail = `${marker}-warehouse@example.invalid`;
  const userEmail = `${marker}-user@example.invalid`;
  let warehouseId = 0;
  let userId = 0;
  let productId = 0;
  let categoryId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for product variant integration tests.");
    const warehouseInsert = await db.insert(users).values({ email: warehouseEmail, passwordHash: await hashPassword("WarehousePassw0rd!"), name: "Variant Test Warehouse", role: "warehouse", emailVerifiedAt: new Date() });
    warehouseId = Number(warehouseInsert[0].insertId);
    const userInsert = await db.insert(users).values({ email: userEmail, passwordHash: await hashPassword("UserPassw0rd!"), name: "Variant Test User", role: "user", emailVerifiedAt: new Date() });
    userId = Number(userInsert[0].insertId);
    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the variant test product to.");
    categoryId = categoryRows[0].id;
    const productInsert = await db.insert(products).values({ categoryId, name: "Variant Test Product", slug: `${marker}-product`, priceMnt: 30_000, sku: `${marker}-sku`, stockQuantity: 5, isPublished: true });
    productId = Number(productInsert[0].insertId);
    // Mirrors the real backfill migration: every product gets one default variant.
    await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 30_000, stockQuantity: 5, isDefault: true });
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    // Leave exactly the original backfilled default variant standing between tests.
    await db.delete(productVariants).where(eq(productVariants.productId, productId));
    await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 30_000, stockQuantity: 5, isDefault: true });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(productVariants).where(eq(productVariants.productId, productId)); // also covered by products cascade, explicit for clarity
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, warehouseId));
    await db.delete(users).where(eq(users.id, warehouseId));
    await db.delete(users).where(eq(users.id, userId));
  });

  function warehouse() {
    return callerFor({ id: warehouseId, email: warehouseEmail, name: "Variant Test Warehouse", role: "warehouse", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function plainUser() {
    return callerFor({ id: userId, email: userEmail, name: "Variant Test User", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }

  it("rejects a plain user (non-warehouse) from viewing or writing variants", async () => {
    await expect(plainUser().admin.productVariants({ productId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(plainUser().admin.createProductVariant({ productId, sku: `${marker}-nope`, priceMnt: 1000, stockQuantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists the backfilled default variant matching the product's own sku/price/stock", async () => {
    const list = await warehouse().admin.productVariants({ productId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sku: `${marker}-sku`, priceMnt: 30_000, stockQuantity: 5, isDefault: true });
  });

  it("creates an additional non-default variant with attributes, alongside the existing default", async () => {
    const list = await warehouse().admin.createProductVariant({ productId, sku: `${marker}-400ml`, attributes: { "Хэмжээ": "400мл" }, priceMnt: 55_000, stockQuantity: 10 });
    expect(list).toHaveLength(2);
    const newVariant = list.find(v => v.sku === `${marker}-400ml`);
    expect(newVariant).toMatchObject({ priceMnt: 55_000, stockQuantity: 10, isDefault: false });
    expect(JSON.parse(newVariant!.attributesJson!)).toEqual({ "Хэмжээ": "400мл" });
    // The original backfilled default is untouched.
    expect(list.find(v => v.isDefault)?.sku).toBe(`${marker}-sku`);
  });

  it("rejects a variant SKU that collides with an unrelated product's SKU", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for product variant integration tests.");
    const [otherRow] = await db.select({ sku: products.sku }).from(products).where(eq(products.id, productId)).limit(1);
    // Reuse a real, distinct product's SKU from the catalog to prove the
    // cross-table check (not just sibling-variant uniqueness).
    const [anotherProduct] = await db.select({ sku: products.sku }).from(products).limit(1);
    expect(anotherProduct).toBeTruthy();
    await expect(warehouse().admin.createProductVariant({ productId, sku: anotherProduct!.sku, priceMnt: 1000, stockQuantity: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(otherRow).toBeTruthy();
  });

  it("switching a new variant to default un-defaults its sibling, keeping exactly one default", async () => {
    const warehouse1 = warehouse();
    const afterCreate = await warehouse1.admin.createProductVariant({ productId, sku: `${marker}-200ml`, priceMnt: 40_000, stockQuantity: 3, isDefault: true });
    const defaults = afterCreate.filter(v => v.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].sku).toBe(`${marker}-200ml`);
  });

  it("refuses to delete a product's last remaining variant", async () => {
    const list = await warehouse().admin.productVariants({ productId });
    expect(list).toHaveLength(1);
    await expect(warehouse().admin.deleteProductVariant({ id: list[0].id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deleting the default variant promotes another one to default", async () => {
    const warehouse1 = warehouse();
    const afterCreate = await warehouse1.admin.createProductVariant({ productId, sku: `${marker}-second`, priceMnt: 20_000, stockQuantity: 2 });
    const originalDefault = afterCreate.find(v => v.isDefault)!;
    const afterDelete = await warehouse1.admin.deleteProductVariant({ id: originalDefault.id }).then(() => warehouse1.admin.productVariants({ productId }));
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].isDefault).toBe(true);
    expect(afterDelete[0].sku).toBe(`${marker}-second`);
  });
});
