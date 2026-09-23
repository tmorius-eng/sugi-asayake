import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { branches, productCategories, products, productVariants } from "../drizzle/schema";
import { deleteAdminProduct, getDb } from "./db";
import { recordStockMovement } from "./stockLedger";

/**
 * Бараа устгах хамгаалалт (2026-09-23): үйл ажиллагааны нөөцийн түүхтэй
 * (борлуулалт, хүлээн авалт…) барааг устгахаас татгалзана, харин admin-ий
 * гараар оруулсан эхний үлдэгдэл (`variant_seed`, `admin_set`…) нь түүх биш —
 * тийм барааг устгаж болно (e2e/product-variants.spec.ts үүнээс болж унасан).
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("deleteAdminProduct guard", () => {
  const marker = `pdel${Date.now().toString(36)}`;
  let branchId = 0;
  let categoryId = 0;
  const productIds: number[] = [];

  async function productWithMovement(suffix: string, type: "variant_seed" | "admin_set" | "sale_online" | "receipt" | "opening") {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const productId = Number((await db.insert(products).values({ categoryId, name: `Delete guard test product ${suffix}`, slug: `${marker}-${suffix}`, sku: `${marker}-${suffix}`, priceMnt: 1000, stockQuantity: 0, isPublished: false }))[0].insertId);
    productIds.push(productId);
    const variantId = Number((await db.insert(productVariants).values({ productId, sku: `${marker}-${suffix}`, priceMnt: 1000, stockQuantity: 0, isDefault: true }))[0].insertId);
    await recordStockMovement(db, branchId, variantId, type === "sale_online" ? -1 : 5, { type, refType: "manual", note: "delete guard test" });
    return productId;
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    branchId = Number((await db.insert(branches).values({ name: `${marker} салбар`, slug: `${marker}-branch`, address: "Delete guard test address", isActive: false }))[0].insertId);
    categoryId = Number((await db.insert(productCategories).values({ name: "Delete guard test category", slug: `${marker}-category`, sortOrder: 99999, isActive: false }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (branchId) await db.delete(branches).where(eq(branches.id, branchId));
  });

  it.each(["variant_seed", "admin_set"] as const)("admin-ий гараар оруулсан үлдэгдэл (%s) устгалыг хаахгүй", async type => {
    const productId = await productWithMovement(type, type);
    await expect(deleteAdminProduct(productId)).resolves.toEqual({ id: productId });
    const db = await getDb();
    expect(await db!.select({ id: products.id }).from(products).where(eq(products.id, productId))).toHaveLength(0);
  });

  it.each(["sale_online", "receipt", "opening"] as const)("үйл ажиллагааны түүхтэй (%s) барааг устгахаас татгалзана", async type => {
    const productId = await productWithMovement(type, type);
    await expect(deleteAdminProduct(productId)).rejects.toThrow(/нөөцийн хөдөлгөөний түүх/);
    const db = await getDb();
    expect(await db!.select({ id: products.id }).from(products).where(eq(products.id, productId))).toHaveLength(1);
  });
});
