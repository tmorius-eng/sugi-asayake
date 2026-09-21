// server/db/admin-catalog.ts — Admin: ангилал/бараа бичих, зөрчил шалгах.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { asc, eq } from "drizzle-orm";
import { branches, InsertProduct, InsertProductCategory, productCategories, productVariants, products } from "../../drizzle/schema";
import { invalidateCached, invalidateCachedByPrefix } from "../_core/ttlCache";
import { setBranchStockAbsolute } from "../stockLedger";
import { getDb } from "./connection";
import { invalidateCatalogSource } from "./catalog";
import { seedBranchStockForNewVariant } from "./variants";
import { DbOrTx } from "./admin-orders";
import { invalidateStorefront } from "./site";

export async function getAdminCategories() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      slug: productCategories.slug,
      description: productCategories.description,
      imageUrl: productCategories.imageUrl,
      sortOrder: productCategories.sortOrder,
      isActive: productCategories.isActive,
      updatedAt: productCategories.updatedAt,
    })
    .from(productCategories)
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
}

export async function categoryExists(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.id, id)).limit(1);
  return Boolean(result[0]);
}

export async function getProductWriteConflicts(input: { slug?: string; sku?: string; excludeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db.select({ id: products.id, slug: products.slug, sku: products.sku }).from(products);
  const conflicts = rows.filter(row => row.id !== input.excludeId && (row.slug === input.slug || row.sku === input.sku));
  if (conflicts.length || !input.sku) return conflicts;

  // A product's sku shares the same global-uniqueness namespace as variant
  // skus (real barcodes are physically unique) — see variantSkuExists, which
  // enforces the same thing from the variant-write side. Only this product's
  // OWN variant is allowed to already carry this sku (that's just
  // syncSoleVariantFromProduct mirroring it back), so exclude that one.
  const variantConflict = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.sku, input.sku)).limit(1);
  if (variantConflict[0] && variantConflict[0].productId !== input.excludeId) {
    return [{ id: variantConflict[0].productId, slug: "", sku: input.sku }];
  }
  return conflicts;
}

export async function getCategoryWriteConflicts(input: { slug?: string; excludeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db.select({ id: productCategories.id, slug: productCategories.slug }).from(productCategories);
  return rows.filter(row => row.id !== input.excludeId && row.slug === input.slug);
}

export type ProductWriteInput = {
  categoryId: number;
  name: string;
  slug: string;
  brand?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  costMnt?: number | null;
  sku: string;
  imageUrl?: string | null;
  galleryJson?: string | null;
  stockQuantity: number;
  isPublished: boolean;
  /** Gift cards sold at checkout (2026-09-14) -- see the schema comment on products.kind. */
  kind?: "physical" | "gift_card";
  /** Product facts (2026-09-14, migration 0079) -- see the schema comment. */
  ingredients?: string | null;
  netContent?: string | null;
  countryOfOrigin?: string | null;
  shelfLifeMonths?: number | null;
  factsSource?: string | null;
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns?: string | null;
  interiorStyle?: string | null;
  hairType?: "dry" | "oily" | "normal" | "damaged" | "color_treated" | null;
  hairConcerns?: string | null;
  fragrancePreference?: "unscented" | "light" | "floral" | "citrus" | null;
  wellnessInterests?: string | null;
  // Хайлт v3 + монгол нэр (2026-09-20, migration 0090).
  nameMn?: string | null;
  searchKeywords?: string | null;
  productType?: string | null;
  // Санал болголт v3 (2026-09-20, migration 0091).
  skinTypes?: string | null;
  bodySkinType?: "dry" | "normal" | "sensitive" | null;
  bodyConcerns?: string | null;
};

// Admin overhaul (2026-09-08, Phase H): bulk CSV import's create-vs-update
// decision per row -- a bare id/sku lookup, not the full getAdminProducts()
// list, since a 500-row import shouldn't fetch and scan the whole 900+ row
// catalog per row.
export async function findProductBySku(sku: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
  return result[0] ?? null;
}

export async function createAdminProduct(input: ProductWriteInput) {
  invalidateCachedByPrefix("storefront:bestsellers:"); invalidateCached("storefront:publishedCount"); invalidateCached("storefront:brandDirectory"); invalidateCachedByPrefix("storefront:related:"); invalidateCatalogSource();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // PHASE 2 of product variants: every product needs at least one variant
  // for cart/checkout to resolve a default against (see addCartItem) — a
  // brand-new product gets its own matching "default" variant in the same
  // transaction, exactly mirroring what the 0030 migration backfilled for
  // every pre-existing product.
  const created = await db.transaction(async tx => {
    await tx.insert(products).values({
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      brand: input.brand ?? null,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      priceMnt: input.priceMnt,
      compareAtPriceMnt: input.compareAtPriceMnt ?? null,
      costMnt: input.costMnt ?? null,
      sku: input.sku,
      imageUrl: input.imageUrl ?? null,
      galleryJson: input.galleryJson ?? null,
      stockQuantity: input.stockQuantity,
      isPublished: input.isPublished,
      kind: input.kind ?? "physical",
      ingredients: input.ingredients ?? null,
      netContent: input.netContent ?? null,
      countryOfOrigin: input.countryOfOrigin ?? null,
      shelfLifeMonths: input.shelfLifeMonths ?? null,
      factsSource: input.factsSource ?? (input.ingredients || input.netContent || input.countryOfOrigin || input.shelfLifeMonths ? "admin" : null),
      skinType: input.skinType ?? null,
      skinConcerns: input.skinConcerns ?? null,
      interiorStyle: input.interiorStyle ?? null,
      hairType: input.hairType ?? null,
      hairConcerns: input.hairConcerns ?? null,
      nameMn: input.nameMn ?? null,
      searchKeywords: input.searchKeywords ?? null,
      productType: input.productType ?? null,
      skinTypes: input.skinTypes ?? null,
      bodySkinType: input.bodySkinType ?? null,
      bodyConcerns: input.bodyConcerns ?? null,
      fragrancePreference: input.fragrancePreference ?? null,
      wellnessInterests: input.wellnessInterests ?? null,
    });
    const row = await tx.select().from(products).where(eq(products.slug, input.slug)).limit(1);
    if (row[0]) {
      const insertedVariant = await tx.insert(productVariants).values({
        productId: row[0].id,
        sku: input.sku,
        priceMnt: input.priceMnt,
        compareAtPriceMnt: input.compareAtPriceMnt ?? null,
        // Placeholder -- recomputed immediately below from branch_stock
        // (Phase K/L: seedBranchStockForNewVariant enrolls it there instead
        // of writing this field directly, same as createAdminProductVariant).
        stockQuantity: 0,
        imageUrl: input.imageUrl ?? null,
        isDefault: true,
      });
      await seedBranchStockForNewVariant(tx, Number(insertedVariant[0].insertId), input.stockQuantity);
    }
    return row;
  });
  return created[0];
}

/** Cheap "what was the stock before this write" lookup — used by
 *  admin.updateProduct (server/routers.ts) to detect a 0 -> >0 restock and
 *  fire wishlist back-in-stock notifications. */
export async function getProductStockQuantity(id: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const found = await db.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, id)).limit(1);
  return found[0]?.stockQuantity ?? null;
}

export /**
 * PHASE 2 of product variants: keeps the common single-variant case in sync
 * so admin.updateProduct's existing price/stock/sku fields stay the one
 * place to edit a simple product — the moment a product actually has more
 * than one variant, this deliberately does nothing (ambiguous which variant
 * a product-level edit should apply to; the admin manages variants directly
 * at that point via updateAdminProductVariant).
 */
/**
 * "Controls everything" admin overhaul (2026-09-08, Phase K/L): the one
 * write path for "set this variant's stock at the fulfillment-default
 * branch to exactly N" -- what every pre-existing single-number stock
 * field (the product form, the variant composer) now means, sugar over the
 * real per-branch table rather than a competing direct write. Upserts the
 * branch_stock row (a variant may not have one yet -- e.g. created before
 * this branch existed) then recomputes the cached total/product mirror.
 * Falls back to writing the variant's aggregate directly only when NO
 * branch is marked isFulfillmentDefault at all (broken config -- there's
 * nowhere real to attribute the number to), matching pre-Phase-K behavior
 * for that edge case.
 */
async function setFulfillmentBranchStock(db: DbOrTx, variantId: number, quantity: number, actorUserId: number | null = null) {
  const [fulfillmentBranch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.isFulfillmentDefault, true)).limit(1);
  if (!fulfillmentBranch) {
    await db.update(productVariants).set({ stockQuantity: quantity, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
    return;
  }
  // 2026-09-11: recorded on the ledger as the difference from what was there.
  await db.transaction(async tx => {
    await setBranchStockAbsolute(tx, fulfillmentBranch.id, variantId, quantity, { type: "product_form_set", refType: "manual", actorUserId, note: "Бүтээгдэхүүний маягтаас үлдэгдэл засав" });
  });
}

async function syncSoleVariantFromProduct(productId: number, changes: { priceMnt?: number; compareAtPriceMnt?: number | null; sku?: string; stockQuantity?: number; imageUrl?: string | null }) {
  const db = await getDb();
  if (!db) return;
  const patch: Record<string, unknown> = {};
  if (changes.priceMnt !== undefined) patch.priceMnt = changes.priceMnt;
  if (changes.compareAtPriceMnt !== undefined) patch.compareAtPriceMnt = changes.compareAtPriceMnt;
  if (changes.sku !== undefined) patch.sku = changes.sku;
  if (changes.imageUrl !== undefined) patch.imageUrl = changes.imageUrl;
  // stockQuantity is handled separately below (Phase K: routes through
  // branch_stock via setFulfillmentBranchStock, not a direct field write).

  const variants = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
  if (variants.length !== 1) return;
  const soleVariantId = variants[0].id;

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(productVariants).set(patch).where(eq(productVariants.id, soleVariantId));
  }
  if (changes.stockQuantity !== undefined) await setFulfillmentBranchStock(db, soleVariantId, changes.stockQuantity);
}

export async function updateAdminProduct(input: { id: number } & Partial<ProductWriteInput>) {
  invalidateCachedByPrefix("storefront:bestsellers:"); invalidateCached("storefront:publishedCount"); invalidateCached("storefront:brandDirectory"); invalidateCachedByPrefix("storefront:related:"); invalidateCatalogSource();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const changes: Partial<InsertProduct> = { updatedAt: new Date() };
  if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
  if (input.name !== undefined) changes.name = input.name;
  if (input.slug !== undefined) changes.slug = input.slug;
  if (input.brand !== undefined) changes.brand = input.brand;
  if (input.shortDescription !== undefined) changes.shortDescription = input.shortDescription;
  if (input.description !== undefined) changes.description = input.description;
  if (input.priceMnt !== undefined) changes.priceMnt = input.priceMnt;
  if (input.compareAtPriceMnt !== undefined) changes.compareAtPriceMnt = input.compareAtPriceMnt;
  if (input.costMnt !== undefined) changes.costMnt = input.costMnt;
  if (input.sku !== undefined) changes.sku = input.sku;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.galleryJson !== undefined) changes.galleryJson = input.galleryJson;
  if (input.stockQuantity !== undefined) changes.stockQuantity = input.stockQuantity;
  if (input.isPublished !== undefined) changes.isPublished = input.isPublished;
  if (input.kind !== undefined) changes.kind = input.kind;
  if (input.ingredients !== undefined) changes.ingredients = input.ingredients;
  if (input.netContent !== undefined) changes.netContent = input.netContent;
  if (input.countryOfOrigin !== undefined) changes.countryOfOrigin = input.countryOfOrigin;
  if (input.shelfLifeMonths !== undefined) changes.shelfLifeMonths = input.shelfLifeMonths;
  if (input.factsSource !== undefined) changes.factsSource = input.factsSource;
  // "admin" only when a person actually entered a fact -- the editor sends
  // all four fields on every save, and a save with all of them empty must
  // not stop the enrich script from filling them later.
  else if (input.ingredients || input.netContent || input.countryOfOrigin || input.shelfLifeMonths) changes.factsSource = "admin";
  if (input.skinType !== undefined) changes.skinType = input.skinType;
  if (input.skinConcerns !== undefined) changes.skinConcerns = input.skinConcerns;
  if (input.interiorStyle !== undefined) changes.interiorStyle = input.interiorStyle;
  if (input.hairType !== undefined) changes.hairType = input.hairType;
  if (input.hairConcerns !== undefined) changes.hairConcerns = input.hairConcerns;
  if (input.fragrancePreference !== undefined) changes.fragrancePreference = input.fragrancePreference;
  if (input.wellnessInterests !== undefined) changes.wellnessInterests = input.wellnessInterests;
  if (input.nameMn !== undefined) changes.nameMn = input.nameMn;
  if (input.searchKeywords !== undefined) changes.searchKeywords = input.searchKeywords;
  if (input.productType !== undefined) changes.productType = input.productType;
  if (input.skinTypes !== undefined) changes.skinTypes = input.skinTypes;
  if (input.bodySkinType !== undefined) changes.bodySkinType = input.bodySkinType;
  if (input.bodyConcerns !== undefined) changes.bodyConcerns = input.bodyConcerns;

  await db.update(products).set(changes).where(eq(products.id, input.id));
  await syncSoleVariantFromProduct(input.id, input);
  const updated = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
  return updated[0];
}

export async function deleteAdminProduct(id: number) {
  invalidateCachedByPrefix("storefront:bestsellers:"); invalidateCached("storefront:publishedCount"); invalidateCached("storefront:brandDirectory"); invalidateCachedByPrefix("storefront:related:"); invalidateCatalogSource();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.delete(products).where(eq(products.id, id));
  return { id };
}

export type CategoryWriteInput = {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function createAdminCategory(input: CategoryWriteInput) {
  invalidateStorefront("categories");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.insert(productCategories).values({
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });

  const created = await db.select().from(productCategories).where(eq(productCategories.slug, input.slug)).limit(1);
  return created[0];
}

export async function updateAdminCategory(input: { id: number } & Partial<CategoryWriteInput>) {
  invalidateStorefront("categories");
  invalidateCatalogSource(); // ангиллын нэр хайлтын индекст байдаг
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const changes: Partial<InsertProductCategory> = { updatedAt: new Date() };
  if (input.name !== undefined) changes.name = input.name;
  if (input.slug !== undefined) changes.slug = input.slug;
  if (input.description !== undefined) changes.description = input.description;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  await db.update(productCategories).set(changes).where(eq(productCategories.id, input.id));
  const updated = await db.select().from(productCategories).where(eq(productCategories.id, input.id)).limit(1);
  return updated[0];
}

/**
 * Барааны ангилал устгах (2026-09-16, Tom: "ангилал устгах ямар ч сонголт алга").
 *
 * `products.categoryId` нь `onDelete: "restrict"` тул бараатай ангиллыг MySQL
 * өөрөө татгалзана — гэвч тэр алдаа нь ойлгомжгүй SQL текст болж админд
 * хүрнэ. Эндээс урьдчилж шалгаж, ХЭДЭН бараа саад болж байгааг хэлнэ:
 * "яагаад болохгүй байна" гэдэг нь "болохгүй" гэдгээс илүү хэрэгтэй.
 */
export async function deleteAdminCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [category] = await db.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
  if (!category) throw new Error("Ангилал олдсонгүй.");
  const used = await db.select({ id: products.id }).from(products).where(eq(products.categoryId, id));
  if (used.length > 0) {
    throw new Error(`Энэ ангилалд ${used.length} бараа байна. Эхлээд тэдгээрийг өөр ангилал руу зөөнө үү.`);
  }
  await db.delete(productCategories).where(eq(productCategories.id, id));
  invalidateStorefront("categories");
  return { id, name: category.name };
}
