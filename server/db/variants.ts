// server/db/variants.ts — Барааны хувилбар (variant) ба салбарын нөөц.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { branches, branchStock, stockMovements, productVariants, products, users } from "../../drizzle/schema";
import { getStockLedgerDrift, recomputeVariantStockTotal, recordStockMovement, setBranchStockAbsolute } from "../stockLedger";
import { getDb } from "./connection";
import { OrderTx } from "./admin-orders";
import { setFulfillmentBranchStock } from "./admin-catalog";

/**
 * Product variants (see the long comment on productVariants in
 * drizzle/schema.ts). PHASE 2: cart/checkout/orders now read this table —
 * see addCartItem/createOrderFromActiveCart below.
 */
export async function getAdminProductVariants(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(desc(productVariants.isDefault), asc(productVariants.id));
}

/**
 * Public (storefront) read of a published product's variants, for the
 * ProductDetail/QuickView variant picker. Nothing sensitive here — price and
 * stock are already public via catalog.list/bySlug, this just exposes the
 * same numbers per-option instead of only for the default one. Returns []
 * for an unpublished/unknown product rather than throwing, since the caller
 * (catalog.variants) is a publicProcedure and a picker with no options is a
 * normal, silent no-op on the client (the product simply has one option).
 */
export async function getPublicProductVariants(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const product = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.isPublished, true))).limit(1);
  if (!product[0]) return [];
  return db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      attributesJson: productVariants.attributesJson,
      priceMnt: productVariants.priceMnt,
      compareAtPriceMnt: productVariants.compareAtPriceMnt,
      stockQuantity: productVariants.stockQuantity,
      imageUrl: productVariants.imageUrl,
      isDefault: productVariants.isDefault,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(desc(productVariants.isDefault), asc(productVariants.id));
}

/** A variant SKU must be globally unique across the whole catalog (real
 *  barcodes are physically unique) — checked against both this table and
 *  products.sku, not just sibling variants. */
export async function variantSkuExists(sku: string, excludeVariantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const productConflict = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
  if (productConflict[0]) return true;
  const variantConflict = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
  return Boolean(variantConflict[0] && variantConflict[0].id !== excludeVariantId);
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase L): the admin
 * per-branch stock editor's data source -- one row per ACTIVE branch (a
 * deactivated branch's shelf isn't sellable, so it's not shown here either),
 * LEFT JOINed so a branch that never got a branch_stock row for this
 * variant (e.g. a branch created after this variant already existed) shows
 * as 0 rather than being silently missing from the list.
 */
export async function getBranchStockForVariant(variantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    branchId: branches.id,
    branchName: branches.name,
    isFulfillmentDefault: branches.isFulfillmentDefault,
    stockQuantity: sql<number>`COALESCE(${branchStock.stockQuantity}, 0)`,
  }).from(branches)
    .leftJoin(branchStock, and(eq(branchStock.branchId, branches.id), eq(branchStock.variantId, variantId)))
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.sortOrder));
}

/** Sets one specific branch's stock for one specific variant to an exact
 *  number (not a delta) -- the admin per-branch editor's one write
 *  operation, distinct from setFulfillmentBranchStock (which always targets
 *  whichever branch is the fulfillment default) since this lets an admin
 *  edit ANY branch, not just the default one. */
export async function setBranchStock(branchId: number, variantId: number, quantity: number, meta: { actorUserId?: number | null; note?: string | null } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (quantity < 0) throw new Error("Stock quantity cannot be negative.");
  await db.transaction(async tx => {
    await setBranchStockAbsolute(tx, branchId, variantId, quantity, { type: "admin_set", refType: "manual", actorUserId: meta.actorUserId ?? null, note: meta.note ?? null });
  });
  return getBranchStockForVariant(variantId);
}

/** One variant's ledger, newest first, with branch names -- the admin
 *  per-branch editor's "Хөдөлгөөн" history (2026-09-11). */
export async function getStockMovementsForVariant(variantId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: stockMovements.id, branchId: stockMovements.branchId, branchName: branches.name, type: stockMovements.type,
    delta: stockMovements.delta, balanceAfter: stockMovements.balanceAfter, refType: stockMovements.refType, refId: stockMovements.refId,
    note: stockMovements.note, actorName: users.name, createdAt: stockMovements.createdAt,
  }).from(stockMovements)
    .innerJoin(branches, eq(branches.id, stockMovements.branchId))
    .leftJoin(users, eq(users.id, stockMovements.actorUserId))
    .where(eq(stockMovements.variantId, variantId))
    .orderBy(desc(stockMovements.id))
    .limit(limit);
}

/** System Health: branch shelves whose ledger does not add up. */
export async function getStockLedgerHealth() {
  const db = await getDb();
  if (!db) return { driftCount: 0, examples: [] as { branchId: number; variantId: number; shelf: number; ledger: number }[] };
  return getStockLedgerDrift(db);
}

export type ProductVariantWriteInput = {
  productId: number;
  sku: string;
  attributes?: Record<string, string> | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  stockQuantity: number;
  imageUrl?: string | null;
  isDefault?: boolean;
};

export /**
 * "Controls everything" admin overhaul (2026-09-08, Phase K/L): the one
 * place a BRAND-NEW variant gets enrolled into per-branch stock -- called
 * by every path that can create one (createAdminProduct's default variant,
 * createAdminProductVariant's additional ones). Same honest starting split
 * scripts/backfill-branch-stock.ts uses for every pre-existing variant: all
 * of the typed stock at the fulfillment-default branch, 0 everywhere else
 * (no real per-branch data exists for a brand-new variant either). Falls
 * back to writing the aggregate directly only if no active branches exist
 * at all (broken config) -- there's nowhere real to seed rows into.
 */
async function seedBranchStockForNewVariant(tx: OrderTx, variantId: number, initialStockQuantity: number) {
  const activeBranches = await tx.select().from(branches).where(eq(branches.isActive, true));
  if (!activeBranches.length) {
    await tx.update(productVariants).set({ stockQuantity: initialStockQuantity }).where(eq(productVariants.id, variantId));
    return;
  }
  const fulfillmentBranchId = activeBranches.find(b => b.isFulfillmentDefault)?.id;
  await tx.insert(branchStock).values(activeBranches.map(branch => ({
    branchId: branch.id, variantId,
    stockQuantity: branch.id === fulfillmentBranchId ? initialStockQuantity : 0,
  })));
  if (fulfillmentBranchId && initialStockQuantity) {
    await recordStockMovement(tx, fulfillmentBranchId, variantId, initialStockQuantity, { type: "variant_seed", refType: "manual", note: "Шинэ бараа/variant үүсэхэд оруулсан эхний үлдэгдэл" });
  }
  await recomputeVariantStockTotal(tx, variantId);
}

export async function createAdminProductVariant(input: ProductVariantWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    if (input.isDefault) await tx.update(productVariants).set({ isDefault: false }).where(eq(productVariants.productId, input.productId));
    const inserted = await tx.insert(productVariants).values({
      productId: input.productId,
      sku: input.sku,
      attributesJson: input.attributes ? JSON.stringify(input.attributes) : null,
      priceMnt: input.priceMnt,
      compareAtPriceMnt: input.compareAtPriceMnt ?? null,
      // Placeholder -- recomputed immediately below from branch_stock, the
      // real source of truth now (Phase K).
      stockQuantity: 0,
      imageUrl: input.imageUrl ?? null,
      isDefault: input.isDefault ?? false,
    });
    await seedBranchStockForNewVariant(tx, Number(inserted[0].insertId), input.stockQuantity);
  });
  return getAdminProductVariants(input.productId);
}

export async function updateAdminProductVariant(input: { id: number } & Partial<ProductVariantWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(productVariants).where(eq(productVariants.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Variant not found.");
  const productId = input.productId ?? existing[0].productId;
  await db.transaction(async tx => {
    if (input.isDefault) await tx.update(productVariants).set({ isDefault: false }).where(and(eq(productVariants.productId, productId), sql`${productVariants.id} != ${input.id}`));
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.sku !== undefined) patch.sku = input.sku;
    if (input.attributes !== undefined) patch.attributesJson = input.attributes ? JSON.stringify(input.attributes) : null;
    if (input.priceMnt !== undefined) patch.priceMnt = input.priceMnt;
    if (input.compareAtPriceMnt !== undefined) patch.compareAtPriceMnt = input.compareAtPriceMnt;
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    // stockQuantity is handled separately below (Phase K: routes through
    // branch_stock via setFulfillmentBranchStock, not a direct field write).
    if (Object.keys(patch).length > 1) await tx.update(productVariants).set(patch).where(eq(productVariants.id, input.id));
    if (input.stockQuantity !== undefined) await setFulfillmentBranchStock(tx, input.id, input.stockQuantity);
  });
  return getAdminProductVariants(productId);
}

/** Refuses to delete a product's last remaining variant — every product
 *  must keep at least one (Phase 2 will need a default to fall back to). */
export async function deleteAdminProductVariant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
  if (!existing[0]) throw new Error("Variant not found.");
  const siblings = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, existing[0].productId));
  if (siblings.length <= 1) throw new Error("Барааны сүүлийн variant-ыг устгах боломжгүй — бараа наад зах нь нэг variant-тай байх ёстой.");
  await db.delete(productVariants).where(eq(productVariants.id, id));
  if (existing[0].isDefault) {
    const [nextDefault] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, existing[0].productId)).orderBy(asc(productVariants.id)).limit(1);
    if (nextDefault) await db.update(productVariants).set({ isDefault: true }).where(eq(productVariants.id, nextDefault.id));
  }
  return { id };
}
