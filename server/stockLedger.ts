import { and, eq, gte, sql } from "drizzle-orm";
import { branchStock, products, productVariants, stockMovements, type StockMovementType } from "../drizzle/schema";
import type { DbOrTx } from "./db";

/**
 * The stock movement ledger (2026-09-11, migration 0063). Every change to a
 * branch_stock row goes through one of the functions below, inside the same
 * transaction as the change, so the ledger and the shelf can never disagree
 * about anything this code did. See stockMovements in drizzle/schema.ts.
 *
 * A leaf module like server/notificationOutbox.ts: db.ts imports it, so it
 * imports nothing from db.ts at runtime (DbOrTx is a type).
 *
 * Variants that were never enrolled in per-branch stock (no branch_stock
 * rows at all -- test fixtures only; every production variant has them) keep
 * using the old aggregate path in db.ts and are not recorded here.
 */

export type MovementRefType = "order" | "transfer" | "receipt" | "count" | "manual";

export type MovementMeta = {
  type: StockMovementType;
  refType?: MovementRefType | null;
  refId?: number | null;
  actorUserId?: number | null;
  note?: string | null;
};

/**
 * productVariants.stockQuantity is a cached SUM of the variant's branch_stock
 * rows, and products.stockQuantity mirrors it when the product has exactly
 * one variant (catalog, product page and recommendation queries read that
 * column directly). Called after every branch_stock write.
 * (Moved here from db.ts, 2026-09-11, unchanged.)
 */
export async function recomputeVariantStockTotal(db: DbOrTx, variantId: number) {
  const [totalRow] = await db.select({ total: sql<number>`COALESCE(SUM(${branchStock.stockQuantity}), 0)` }).from(branchStock).where(eq(branchStock.variantId, variantId));
  const total = Number(totalRow?.total ?? 0);
  await db.update(productVariants).set({ stockQuantity: total, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
  const [variantRow] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  if (variantRow) {
    const siblings = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, variantRow.productId));
    if (siblings.length === 1) {
      await db.update(products).set({ stockQuantity: total, updatedAt: new Date() }).where(eq(products.id, variantRow.productId));
    }
  }
  return total;
}

async function shelfCount(db: DbOrTx, branchId: number, variantId: number): Promise<number> {
  const [row] = await db.select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).limit(1);
  return Number(row?.quantity ?? 0);
}

/**
 * Records a change that has ALREADY been applied to branch_stock in this
 * transaction (the guarded checkout/POS decrements do their own UPDATE so
 * their race-proofing stays exactly as it was). Reads the balance back, so
 * `balanceAfter` is whatever the shelf really holds now.
 */
export async function recordStockMovement(db: DbOrTx, branchId: number, variantId: number, delta: number, meta: MovementMeta): Promise<void> {
  if (delta === 0) return;
  const [variant] = await db.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  await db.insert(stockMovements).values({
    branchId, variantId, sku: variant?.sku ?? "?",
    type: meta.type, delta, balanceAfter: await shelfCount(db, branchId, variantId),
    refType: meta.refType ?? null, refId: meta.refId ?? null, actorUserId: meta.actorUserId ?? null,
    note: meta.note ? meta.note.slice(0, 300) : null,
  });
}

export class StockShortageError extends Error {
  constructor(message: string, readonly branchId: number, readonly variantId: number, readonly available: number, readonly requested: number) {
    super(message);
    this.name = "StockShortageError";
  }
}

/**
 * Adds `delta` (signed) to one branch's shelf of one variant and records it.
 * Negative deltas are guarded exactly like checkout's decrement (UPDATE ...
 * WHERE stock >= n, then an affectedRows check), so two concurrent callers
 * can never take the shelf below zero; the loser gets a StockShortageError.
 * Positive deltas upsert, so a branch with no row yet for this variant gets
 * one instead of the quantity being silently lost.
 */
export async function applyBranchStockDelta(db: DbOrTx, branchId: number, variantId: number, delta: number, meta: MovementMeta, options: { itemLabel?: string; recompute?: boolean } = {}): Promise<{ after: number }> {
  if (!Number.isInteger(delta)) throw new Error("Stock change must be a whole number.");
  if (delta < 0) {
    const need = -delta;
    const updated = await db.update(branchStock)
      .set({ stockQuantity: sql`${branchStock.stockQuantity} - ${need}`, updatedAt: new Date() })
      .where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId), gte(branchStock.stockQuantity, need)));
    if (Number(updated[0].affectedRows ?? 0) !== 1) {
      const available = await shelfCount(db, branchId, variantId);
      throw new StockShortageError(`${options.itemLabel ?? "Бараа"}: үлдэгдэл хүрэлцэхгүй (байгаа ${available}, хэрэгтэй ${need}).`, branchId, variantId, available, need);
    }
  } else if (delta > 0) {
    await db.insert(branchStock).values({ branchId, variantId, stockQuantity: delta })
      .onDuplicateKeyUpdate({ set: { stockQuantity: sql`${branchStock.stockQuantity} + ${delta}`, updatedAt: new Date() } });
  }
  await recordStockMovement(db, branchId, variantId, delta, meta);
  if (options.recompute !== false) await recomputeVariantStockTotal(db, variantId);
  return { after: await shelfCount(db, branchId, variantId) };
}

/**
 * Sets one branch's shelf to an exact count and records the DIFFERENCE --
 * how every "type the new number" editor is recorded (the per-branch
 * editor, the product form, a stocktake). A no-op change writes nothing.
 */
export async function setBranchStockAbsolute(db: DbOrTx, branchId: number, variantId: number, quantity: number, meta: MovementMeta): Promise<{ before: number; after: number }> {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Stock quantity cannot be negative.");
  // Lock the row (if any) so a concurrent sale between the read and the
  // write is recorded as its own movement, not folded into this one.
  const locked = await db.select({ quantity: branchStock.stockQuantity }).from(branchStock)
    .where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).for("update").limit(1);
  const before = Number(locked[0]?.quantity ?? 0);
  if (locked[0]) {
    await db.update(branchStock).set({ stockQuantity: quantity, updatedAt: new Date() }).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId)));
  } else {
    await db.insert(branchStock).values({ branchId, variantId, stockQuantity: quantity })
      .onDuplicateKeyUpdate({ set: { stockQuantity: quantity, updatedAt: new Date() } });
  }
  await recordStockMovement(db, branchId, variantId, quantity - before, meta);
  await recomputeVariantStockTotal(db, variantId);
  return { before, after: quantity };
}

/**
 * Every (branch, variant) where the ledger does not add up to the shelf:
 * something changed branch_stock without recording it (older code on the
 * other laptop, a manual SQL edit). Shown on System Health; fixed by
 * scripts/stock-ledger-rebaseline.ts.
 */
export async function getStockLedgerDrift(db: DbOrTx, limit = 20) {
  const [rows] = await db.execute(sql`
    SELECT s.branchId, s.variantId, s.shelf, s.ledger FROM (
      SELECT bs.branchId, bs.variantId, bs.stockQuantity AS shelf,
             COALESCE((SELECT SUM(sm.delta) FROM stock_movements sm WHERE sm.branchId = bs.branchId AND sm.variantId = bs.variantId), 0) AS ledger
      FROM branch_stock bs
      UNION ALL
      SELECT sm.branchId, sm.variantId, 0 AS shelf, SUM(sm.delta) AS ledger
      FROM stock_movements sm
      LEFT JOIN branch_stock bs ON bs.branchId = sm.branchId AND bs.variantId = sm.variantId
      WHERE bs.id IS NULL
      GROUP BY sm.branchId, sm.variantId
    ) s
    WHERE s.shelf <> s.ledger
    LIMIT ${sql.raw(String(Math.max(1, Math.floor(limit))))}
  `) as unknown as [{ branchId: number; variantId: number; shelf: number; ledger: string | number }[]];
  const [countRows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM branch_stock bs
    WHERE bs.stockQuantity <> COALESCE((SELECT SUM(sm.delta) FROM stock_movements sm WHERE sm.branchId = bs.branchId AND sm.variantId = bs.variantId), 0)
  `) as unknown as [{ n: number | string }[]];
  return {
    driftCount: Number(countRows[0]?.n ?? 0),
    examples: rows.map(row => ({ branchId: Number(row.branchId), variantId: Number(row.variantId), shelf: Number(row.shelf), ledger: Number(row.ledger) })),
  };
}
