import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { testSessionUser } from "./_test-helpers";
import { hashPassword } from "./_core/password";
import { adminAuditLogs, branches, orderItems, orders, postCategories, postCategoryLinks, posts, productCategories, productVariants, products, stockMovements, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

/**
 * Админы устгах үйлдлүүд (2026-09-16, Tom: "устгах юу ч алга").
 *
 * Панелийн бүх сущностийг шалгахад create/update байгаа атлаа delete
 * БАЙХГҮЙ гурав олдсон: барааны ангилал, нийтлэлийн ангилал, захиалга.
 * Энэ тест нь тэдгээрийг нэмсэн явдлыг биш, **хаалтууд нь үнэхээр барьж
 * байгааг** шалгана — устгалт бол буцаах боломжгүй үйлдэл тул хаалт нь
 * ажиллахгүй бол эзэмшигч өгөгдлөө алдана.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.171.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.171.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("admin delete procedures", () => {
  const marker = `del${Date.now().toString(36)}`;
  let adminId = 0;
  let movementProductId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required.");
    const inserted = await db.insert(users).values({
      email: `${marker}-admin@example.invalid`,
      passwordHash: await hashPassword("AdminPassw0rd!"),
      name: "Delete Test Admin", role: "admin", emailVerifiedAt: new Date(),
    });
    adminId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (adminId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(productCategories).where(like(productCategories.slug, `${marker}%`));
    await db.delete(postCategories).where(like(postCategories.slug, `${marker}%`));
    await db.delete(posts).where(like(posts.slug, `${marker}%`));
    if (movementProductId) await db.delete(products).where(eq(products.id, movementProductId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
  });

  const admin = () => callerFor(testSessionUser({ id: adminId, name: "Delete Test Admin", role: "admin" as const, emailVerifiedAt: new Date() }));

  it("барааны ангилал: бараатай бол татгалзаж, ХЭДЭН бараа саад болж байгааг хэлнэ", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB");
    const categoryInsert = await db.insert(productCategories).values({ name: `${marker} ангилал`, slug: `${marker}-cat`, sortOrder: 999 });
    const categoryId = Number(categoryInsert[0].insertId);
    const productInsert = await db.insert(products).values({
      categoryId, name: `${marker} бараа`, slug: `${marker}-prod`, priceMnt: 1000, sku: `${marker}-sku`, stockQuantity: 0,
    });
    const productId = Number(productInsert[0].insertId);

    await expect(admin().admin.deleteCategory({ id: categoryId }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("1 бараа") });

    // Барааг зайлуулбал устгагдана.
    await db.delete(products).where(eq(products.id, productId));
    const removed = await admin().admin.deleteCategory({ id: categoryId });
    expect(removed.id).toBe(categoryId);
    const [gone] = await db.select().from(productCategories).where(eq(productCategories.id, categoryId)).limit(1);
    expect(gone).toBeUndefined();
  });

  it("нийтлэлийн ангилал: нийтлэлтэй бол татгалзана (cascade чимээгүй арилгахаас сэргийлнэ)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB");
    const categoryInsert = await db.insert(postCategories).values({ name: `${marker} post cat`, slug: `${marker}-pcat` });
    const categoryId = Number(categoryInsert[0].insertId);
    const postInsert = await db.insert(posts).values({ title: `${marker} post`, slug: `${marker}-post`, content: "x", createdByUserId: adminId });
    const postId = Number(postInsert[0].insertId);
    await db.insert(postCategoryLinks).values({ postId, categoryId });

    await expect(admin().admin.deletePostCategory({ id: categoryId }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("1 нийтлэл") });

    await db.delete(postCategoryLinks).where(eq(postCategoryLinks.categoryId, categoryId));
    const removed = await admin().admin.deletePostCategory({ id: categoryId });
    expect(removed.id).toBe(categoryId);
  });

  it("захиалга: цуцлагдаагүй бол татгалзана, цуцлагдсан+төлөгдөөгүйг устгаж аудитад бичнэ", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB");
    const orderInsert = await db.insert(orders).values({
      orderNumber: `${marker.toUpperCase()}1`, customerName: "Delete Test", customerPhone: "99001122",
      deliveryDistrict: "sukhbaatar", deliveryAddress: "Тест", subtotalMnt: 1000, deliveryFeeMnt: 0, totalMnt: 1000,
      status: "pending", paymentStatus: "unpaid", paymentMethod: "cash_on_delivery", deliveryMethod: "ub_delivery",
    });
    const orderId = Number(orderInsert[0].insertId);
    await db.insert(orderItems).values({ orderId, productId: null, productName: "Тест бараа", sku: `${marker}-i`, quantity: 1, unitPriceMnt: 1000 });

    // 1) Идэвхтэй захиалгыг устгаж болохгүй.
    await expect(admin().admin.deleteOrder({ id: orderId }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("ЦУЦЛАГДСАН") });

    // 2) Мөнгө хөдөлсөн бол устгахгүй.
    await db.update(orders).set({ status: "cancelled", paymentStatus: "paid" }).where(eq(orders.id, orderId));
    await expect(admin().admin.deleteOrder({ id: orderId }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("санхүүгийн бичлэг") });

    // 3) Нөөцийн хөдөлгөөний нийлбэр 0 биш бол устгахгүй — эс бөгөөс
    //    агуулахын үлдэгдэл ledger-тэй зөрнө.
    //
    // ⚠️ 2026-09-16: эхэндээ `variantId: 1` гэж ХАТУУ бичсэн байв. Хөгжүүлэгчийн
    // DB-д 1 дугаартай variant үргэлж байдаг тул локал дээр ногоон гарч,
    // CI-ийн цэвэр схемд гадаад түлхүүр унаж байв. Тест өөрийн бараа,
    // variant-аа өөрөө үүсгэнэ.
    await db.update(orders).set({ paymentStatus: "unpaid" }).where(eq(orders.id, orderId));
    const [seedCategory] = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!seedCategory) throw new Error("Лавлах ангилал алга (scripts/ci-seed.ts).");
    const productInsert = await db.insert(products).values({
      categoryId: seedCategory.id, name: `${marker} бараа`, slug: `${marker}-mvprod`, priceMnt: 1000, sku: `${marker}-mvsku`, stockQuantity: 5,
    });
    movementProductId = Number(productInsert[0].insertId);
    const variantInsert = await db.insert(productVariants).values({
      productId: movementProductId, sku: `${marker}-mvsku`, priceMnt: 1000, stockQuantity: 5, isDefault: true,
    });
    const [branch] = await db.select({ id: branches.id }).from(branches).limit(1);
    if (!branch) throw new Error("Лавлах салбар алга (scripts/ci-seed.ts).");
    const movementInsert = await db.insert(stockMovements).values({
      branchId: branch.id, variantId: Number(variantInsert[0].insertId), sku: `${marker}-mvsku`, delta: -1, balanceAfter: 0, type: "sale_online", refType: "order", refId: orderId,
    });
    await expect(admin().admin.deleteOrder({ id: orderId }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("нийлбэр") });
    await db.delete(stockMovements).where(eq(stockMovements.id, Number(movementInsert[0].insertId)));

    // 4) Бүх нөхцөл хангагдвал устана.
    const removed = await admin().admin.deleteOrder({ id: orderId });
    expect(removed.orderNumber).toBe(`${marker.toUpperCase()}1`);
    expect(removed.deletedItemCount).toBe(1);
    const [gone] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(gone, "захиалга бүрмөсөн устсан байх ёстой").toBeUndefined();
    const leftoverItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(leftoverItems, "барааны мөр ч хамт устана").toHaveLength(0);

    // Устгасан бичлэг хаанаас ч сэргээгдэхгүй тул аудитад хуулбар үлдэнэ.
    const [audit] = await db.select().from(adminAuditLogs)
      .where(and(eq(adminAuditLogs.actorUserId, adminId), eq(adminAuditLogs.action, "order.deleted"))).limit(1);
    expect(audit, "аудитын мөр бичигдсэн байх ёстой").toBeTruthy();
    expect(String(audit.metadataJson)).toContain(`${marker.toUpperCase()}1`);
  });

  it("захиалга устгах нь зөвхөн admin — warehouse, finance хоёрт хаалттай", async () => {
    const warehouse = callerFor(testSessionUser({ id: adminId, role: "warehouse" as const, emailVerifiedAt: new Date() }));
    const finance = callerFor(testSessionUser({ id: adminId, role: "finance" as const, emailVerifiedAt: new Date() }));
    await expect(warehouse.admin.deleteOrder({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finance.admin.deleteOrder({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
