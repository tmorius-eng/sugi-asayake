import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { carts, cartItems, orderItems, orders, productCategories, productVariants, products, users } from "../drizzle/schema";
import { addCartItem, createOrderFromActiveCart, getActiveCartForOwner, getDb, mergeGuestCartIntoUserCart, updateAdminOrder, updateAdminProduct } from "./db";
import { hashPassword } from "./_core/password";

// PHASE 2 of product variants: cart_items/order_items now key off variantId
// instead of productId (see the long comment on productVariants in
// drizzle/schema.ts, and the 0031 migration). This suite is the one that
// actually proves a shopper can choose and buy a *non-default* variant --
// PHASE 1's own product-variants.integration.test.ts only covers the admin
// CRUD side, and every other integration suite only ever exercises the
// productId-resolves-to-default-variant back-compat path.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("product variants (phase 2) integration", () => {
  const marker = `variant-phase2-${Date.now()}`;
  let userId = 0;
  let categoryId = 0;
  let productId = 0;
  let defaultVariantId = 0;
  let largeVariantId = 0;
  const createdOrderIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for product variant phase 2 integration tests.");

    const userInsert = await db.insert(users).values({ email: `${marker}@example.invalid`, passwordHash: await hashPassword("VariantPhase2Passw0rd!"), name: "Variant Phase 2 Shopper", role: "user", emailVerifiedAt: new Date() });
    userId = Number(userInsert[0].insertId);

    const categoryRows = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    if (!categoryRows[0]) throw new Error("No product category exists to attach the test product to.");
    categoryId = categoryRows[0].id;

    const productInsert = await db.insert(products).values({ categoryId, name: "Variant Phase 2 Toner", slug: `${marker}-toner`, priceMnt: 20_000, sku: `${marker}-170ml`, stockQuantity: 1, isPublished: true });
    productId = Number(productInsert[0].insertId);

    // The product's own row doubles as the "170ml" default variant (mirrors
    // the real 0030 backfill), plus one genuinely distinct, non-default
    // "400ml" option with its own price/stock/sku/attributes.
    const defaultVariantInsert = await db.insert(productVariants).values({ productId, sku: `${marker}-170ml`, attributesJson: JSON.stringify({ "Хэмжээ": "170мл" }), priceMnt: 20_000, stockQuantity: 1, isDefault: true });
    defaultVariantId = Number(defaultVariantInsert[0].insertId);
    const largeVariantInsert = await db.insert(productVariants).values({ productId, sku: `${marker}-400ml`, attributesJson: JSON.stringify({ "Хэмжээ": "400мл" }), priceMnt: 45_000, stockQuantity: 5, isDefault: false });
    largeVariantId = Number(largeVariantInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(eq(orderItems.orderId, createdOrderIds[0]));
      for (const id of createdOrderIds) await db.delete(orders).where(eq(orders.id, id));
    }
    if (userId) {
      const cartRows = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId));
      for (const cart of cartRows) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(eq(carts.userId, userId));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId)); // cascades product_variants
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("resolves a bare productId to the product's default variant (back-compat)", async () => {
    const cart = await addCartItem({ owner: { userId }, productId, quantity: 1 });
    expect(cart?.items).toHaveLength(1);
    expect(cart!.items[0]).toMatchObject({ variantId: defaultVariantId, sku: `${marker}-170ml`, priceMnt: 20_000 });
  });

  it("adds a specific non-default variant via variantId, distinct from the default", async () => {
    const cart = await addCartItem({ owner: { userId }, variantId: largeVariantId, quantity: 1 });
    const line = cart!.items.find(item => item.variantId === largeVariantId);
    expect(line).toMatchObject({ sku: `${marker}-400ml`, priceMnt: 45_000, productId });
    expect(JSON.parse(line!.attributesJson!)).toEqual({ "Хэмжээ": "400мл" });
  });

  it("keeps two different variants of the same product as separate cart lines", async () => {
    const cart = await getActiveCartForOwner({ userId });
    const linesForProduct = cart!.items.filter(item => item.productId === productId);
    expect(linesForProduct.map(item => item.variantId).sort()).toEqual([defaultVariantId, largeVariantId].sort());
  });

  it("enforces stock per-variant, not pooled across a product's variants", async () => {
    // The default (170ml) variant only has 1 unit in stock; the sibling
    // 400ml variant having 5 must not let this succeed.
    await expect(addCartItem({ owner: { userId }, variantId: defaultVariantId, quantity: 5 })).rejects.toThrow("not available in stock");
  });

  it("checkout decrements only the purchased variant's stock and records its real variantId + sku", async () => {
    const order = await createOrderFromActiveCart({
      owner: { userId },
      customerName: "Variant Phase 2 Shopper",
      customerPhone: "88112200",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order!.id);

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    const defaultLine = lines.find(line => line.variantId === defaultVariantId);
    const largeLine = lines.find(line => line.variantId === largeVariantId);
    // This is also the regression check for the old bug where order_items.sku
    // was written from the product's URL slug instead of a real sku.
    expect(defaultLine).toMatchObject({ sku: `${marker}-170ml`, quantity: 1 });
    expect(largeLine).toMatchObject({ sku: `${marker}-400ml`, quantity: 1 });

    const variantsAfter = await db.select({ id: productVariants.id, stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.productId, productId));
    expect(variantsAfter.find(v => v.id === defaultVariantId)?.stockQuantity).toBe(0); // 1 - 1
    expect(variantsAfter.find(v => v.id === largeVariantId)?.stockQuantity).toBe(4); // 5 - 1
  });

  it("cancelling the order restores stock to the exact variants that were purchased", async () => {
    const orderId = createdOrderIds[0];
    await updateAdminOrder({ id: orderId, status: "cancelled" });

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const variantsAfter = await db.select({ id: productVariants.id, stockQuantity: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.productId, productId));
    expect(variantsAfter.find(v => v.id === defaultVariantId)?.stockQuantity).toBe(1); // restored
    expect(variantsAfter.find(v => v.id === largeVariantId)?.stockQuantity).toBe(5); // restored
  });

  it("preserves the chosen variant when a guest cart is merged into a new account", async () => {
    const guestToken = `${marker}-guest-token`;
    await addCartItem({ owner: { guestToken }, variantId: largeVariantId, quantity: 1 });

    const mergeUserInsert = await (await getDb())!.insert(users).values({ email: `${marker}-merge@example.invalid`, passwordHash: await hashPassword("MergePhase2Passw0rd!"), name: "Variant Phase 2 Merge Target", role: "user", emailVerifiedAt: new Date() });
    const mergeUserId = Number(mergeUserInsert[0].insertId);
    await mergeGuestCartIntoUserCart(guestToken, mergeUserId);

    const mergedCart = await getActiveCartForOwner({ userId: mergeUserId });
    expect(mergedCart?.items).toHaveLength(1);
    expect(mergedCart!.items[0]).toMatchObject({ variantId: largeVariantId, sku: `${marker}-400ml` });

    // Cleanup this test's own extra user/cart (separate from the shared afterAll fixture).
    const db = await getDb();
    if (db) {
      const cartRows = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, mergeUserId));
      for (const cart of cartRows) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(eq(carts.userId, mergeUserId));
      await db.delete(users).where(eq(users.id, mergeUserId));
    }
  });

  it("admin.updateProduct keeps a single-variant product's sole variant mirrored (price/stock/sku)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const soleProductInsert = await db.insert(products).values({ categoryId, name: "Variant Phase 2 Sole-Variant Product", slug: `${marker}-sole`, priceMnt: 10_000, sku: `${marker}-sole-sku`, stockQuantity: 8, isPublished: true });
    const soleProductId = Number(soleProductInsert[0].insertId);
    const soleVariantInsert = await db.insert(productVariants).values({ productId: soleProductId, sku: `${marker}-sole-sku`, priceMnt: 10_000, stockQuantity: 8, isDefault: true });
    const soleVariantId = Number(soleVariantInsert[0].insertId);

    await updateAdminProduct({ id: soleProductId, priceMnt: 12_500, stockQuantity: 3, sku: `${marker}-sole-sku-v2` });

    const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, soleVariantId));
    expect(variant).toMatchObject({ priceMnt: 12_500, stockQuantity: 3, sku: `${marker}-sole-sku-v2` });

    await db.delete(products).where(eq(products.id, soleProductId)); // cascades the variant
  });
});
