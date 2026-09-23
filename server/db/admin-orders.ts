// server/db/admin-orders.ts — Admin: бараа/захиалгын жагсаалт, самбар, нөөц хасах/буцаах, гар захиалга, засвар, буцаалт, устгал, хянах.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { branchStock, discountCodeRedemptions, discountCodes, stockMovements, orderItems, orders, paymentAttempts, posts, productCategories, productReviews, productVariants, giftCards, pushSubscriptions, products, sitePromotions, storeCreditLedger, users } from "../../drizzle/schema";
import { type UbDistrict } from "../../shared/districts";
import { computeDeliveryFeeMnt } from "../../shared/delivery";
import { invalidateCachedByPrefix } from "../_core/ttlCache";
import { enqueueNotification } from "../notificationOutbox";
import { applyBranchStockDelta, recomputeVariantStockTotal, recordStockMovement } from "../stockLedger";
import { shouldRestoreStock } from "../commerce-lifecycle";
import { LOW_STOCK_THRESHOLD as SHARED_LOW_STOCK_THRESHOLD } from "../../shared/catalog-filter";
import { escapeLike, generateOrderNumber, getDb, isDuplicateKeyError, isDuplicateOrderNumberError, refundOwedSql, settledSaleSql, storeDayString, storeDaySql } from "./connection";
import { IssuedGiftCard, announceIssuedGiftCards, issueGiftCardsForPaidOrder, voidGiftCardsForOrder } from "./gift-cards";
import { getActiveBranches } from "./site";
import { findOrderForClientRequest } from "./cart-orders";
import { getStoreSettingNumber } from "./ops";

/**
 * Төлбөрөө ЗӨВХӨН провайдерийн callback-оор баталгаажуулдаг аргууд
 * (2026-09-23). "Дууссан" болгох нь бэлэн/банк/картын цуглуулгыг батлах мөч
 * боловч эдгээрт биш — тэдэнд webhook л шийднэ.
 */
const WEBHOOK_PAID_METHODS = ["qpay", "storepay"] as const;

/** The editor's own load for ONE product -- carries the heavy columns
 *  (description, galleryJson) that getAdminProducts's list omits. */
export async function getAdminProductDetail(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  return rows[0] ?? null;
}

export async function getAdminProducts() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      nameMn: products.nameMn,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      // Audit 2026-09-09 (R4/performance): `description` and `galleryJson`
      // are deliberately NOT in this list -- at ~940 products they were most
      // of the payload on every open of the Products section, and the list
      // never displays either. The editor loads them for the one product
      // being edited via getAdminProductDetail below.
      sku: products.sku,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      costMnt: products.costMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      isPublished: products.isPublished,
      kind: products.kind,
      updatedAt: products.updatedAt,
      categoryName: productCategories.name,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
      searchKeywords: products.searchKeywords,
      productType: products.productType,
      skinTypes: products.skinTypes,
      bodySkinType: products.bodySkinType,
      bodyConcerns: products.bodyConcerns,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .orderBy(desc(products.updatedAt));
}

// Backend audit (2026-09-02): both queries here used to be genuinely
// unbounded -- `.from(orders)` with no LIMIT, and `.from(orderItems)` with
// no WHERE clause at all, fetching every order-item row that has ever
// existed regardless of how many orders were even shown, then filtering in
// JS. Harmless today at a handful of real orders; a real "fix before
// go-live" item once order volume is real (per ROADMAP.md's own framing).
// `limit` defaults to the most recent 200 orders -- generous enough that
// the admin-only order list panel behaves exactly as before at any
// realistic near-term volume, while the query itself is no longer
// architecturally unbounded. lineItems is now scoped to only the fetched
// orders' own ids instead of the whole table.
export async function getAdminOrders(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  // 2026-09-23: `id` тэнцвэр — `timestamp` нь секундын нарийвчлалтай тул нэг
  // секундэд орсон хоёр захиалгын дараалал MySQL-д баталгаагүй.
  const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit);
  if (!orderRows.length) return [];
  const orderIds = orderRows.map(order => order.id);
  const lineItems = await db.select({ orderId: orderItems.orderId, variantId: orderItems.variantId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(inArray(orderItems.orderId, orderIds));
  return orderRows.map(order => ({ ...order, items: lineItems.filter(item => item.orderId === order.id) }));
}

// One definition (shared/catalog-filter.ts) -- the storefront badge and the
// admin digest must agree on what "low" means. Per-location alert levels
// (branches.lowStockThreshold) are a separate, admin-set number.
const LOW_STOCK_THRESHOLD = SHARED_LOW_STOCK_THRESHOLD;

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase F): extracted out
 * of getAdminDashboardSummary's own inline query so the dashboard's
 * "НӨӨЦ ДУУСЧ БАЙНА" widget and the new low-stock owner-digest job
 * (server/automation.ts) read the exact same canonical query -- no risk of
 * the two silently drifting apart (e.g. a future edit to one's threshold or
 * published-only filter not being mirrored in the other).
 */
export async function getLowStockProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: products.id,
    name: products.name,
    nameMn: products.nameMn,
    sku: products.sku,
    stockQuantity: products.stockQuantity,
  }).from(products).where(and(eq(products.isPublished, true), sql`${products.stockQuantity} <= ${LOW_STOCK_THRESHOLD}`)).orderBy(asc(products.stockQuantity)).limit(10);
}

export async function getAdminDashboardSummary() {
  const db = await getDb();
  if (!db) {
    return { totalOrders: 0, totalRevenueMnt: 0, activeUsers: 0, recentOrders: [] as { id: number; orderNumber: string; customerName: string; totalMnt: number; status: string; paymentStatus: string; createdAt: Date; firstItemName: string | null; firstItemImageUrl: string | null; itemCount: number }[], lowStockProducts: [], failedPayments: [], ordersLast7d: 0, ordersPrevious7d: 0, ordersDailySeries: [] as { date: string; orderCount: number }[], refundOwedCount: 0 };
  }

  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // 2026-09-06: for the new admin dashboard's "Захиалга" stat card + its
  // sparkline. Plain COUNT(*) over orders.createdAt, not payment-status
  // filtered -- matches totalOrders's own "every order regardless of
  // payment outcome" operational semantics (this counts orders placed, not
  // orders paid). One grouped query over the last 14 days, bucketed in JS
  // into "this week" vs "the week before" -- zero-filled so the sparkline
  // always has exactly 7 points, unlike getRevenueTimeseries's sparse
  // convention elsewhere (a sparkline needs a fixed length; a day with 0
  // orders is a real, meaningful zero, not a gap to omit).
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const dailyOrderDateExpr = storeDaySql(orders.createdAt);

  const [[orderCountRow], [revenueRow], [activeUserRow], recentOrders, lowStockProducts, failedPayments, dailyOrderRows, [refundOwedRow]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(orders),
    db.select({ total: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(settledSaleSql),
    db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.lastSignedIn, activeSince)),
    db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      totalMnt: orders.totalMnt,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    }).from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(10),
    getLowStockProducts(),
    db.select({
      id: paymentAttempts.id,
      orderId: paymentAttempts.orderId,
      orderNumber: orders.orderNumber,
      provider: paymentAttempts.provider,
      createdAt: paymentAttempts.createdAt,
    }).from(paymentAttempts).leftJoin(orders, eq(paymentAttempts.orderId, orders.id)).where(eq(paymentAttempts.status, "failed")).orderBy(desc(paymentAttempts.createdAt)).limit(10),
    db.select({ date: dailyOrderDateExpr, count: sql<number>`count(*)` }).from(orders).where(gte(orders.createdAt, fourteenDaysAgo)).groupBy(dailyOrderDateExpr),
    // Audit 2026-09-09 (R2): orders whose money was collected and that were
    // then cancelled -- finance owes each one a refund (see refundOwedSql).
    db.select({ count: sql<number>`count(*)` }).from(orders).where(refundOwedSql),
  ]);

  // 2026-09-08 (reference-driven admin redesign): the new dashboard's
  // "Сүүлийн захиалгууд" table shows what was actually bought (thumbnail +
  // product name), not just an order number -- one extra query over exactly
  // the 10 orders already fetched above, keyed by orderId. Reads
  // order_items' denormalized productName (durable across product deletion,
  // same discipline as getTopProducts) but LEFT JOINs products purely for
  // the photo, which is presentation-only and may legitimately be missing.
  const recentOrderIds = recentOrders.map(order => order.id);
  const recentOrderItemRows = recentOrderIds.length === 0 ? [] : await db.select({
    id: orderItems.id,
    orderId: orderItems.orderId,
    productName: orderItems.productName,
    imageUrl: products.imageUrl,
  }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(inArray(orderItems.orderId, recentOrderIds)).orderBy(asc(orderItems.id));
  const firstItemByOrderId = new Map<number, { productName: string; imageUrl: string | null }>();
  const itemCountByOrderId = new Map<number, number>();
  for (const row of recentOrderItemRows) {
    itemCountByOrderId.set(row.orderId, (itemCountByOrderId.get(row.orderId) ?? 0) + 1);
    if (!firstItemByOrderId.has(row.orderId)) firstItemByOrderId.set(row.orderId, { productName: row.productName, imageUrl: row.imageUrl ?? null });
  }
  const recentOrdersWithItems = recentOrders.map(order => ({
    ...order,
    firstItemName: firstItemByOrderId.get(order.id)?.productName ?? null,
    firstItemImageUrl: firstItemByOrderId.get(order.id)?.imageUrl ?? null,
    itemCount: itemCountByOrderId.get(order.id) ?? 0,
  }));

  const countsByDate = new Map(dailyOrderRows.map(row => [row.date, Number(row.count)]));
  const dayString = (daysAgo: number) => storeDayString(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
  const ordersDailySeries: { date: string; orderCount: number }[] = [];
  let ordersLast7d = 0;
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const orderCount = countsByDate.get(dayString(daysAgo)) ?? 0;
    ordersDailySeries.push({ date: dayString(daysAgo), orderCount });
    ordersLast7d += orderCount;
  }
  let ordersPrevious7d = 0;
  for (let daysAgo = 13; daysAgo >= 7; daysAgo--) ordersPrevious7d += countsByDate.get(dayString(daysAgo)) ?? 0;

  return {
    totalOrders: Number(orderCountRow?.count ?? 0),
    totalRevenueMnt: Number(revenueRow?.total ?? 0),
    activeUsers: Number(activeUserRow?.count ?? 0),
    recentOrders: recentOrdersWithItems,
    lowStockProducts,
    failedPayments,
    ordersLast7d,
    ordersPrevious7d,
    ordersDailySeries,
    refundOwedCount: Number(refundOwedRow?.count ?? 0),
  };
}

export async function adminGlobalSearch(queryText: string) {
  const db = await getDb();
  if (!db) return { products: [], orders: [], users: [], discountCodes: [], promotions: [], posts: [] };
  // 2026-09-23: `%`/`_` нь LIKE-ийн орлуулагч тул хэрэглэгчийн үгнээс салгана —
  // "%"-ээр хайхад БҮХ мөр буцдаг байв (injection биш, гэхдээ буруу үр дүн).
  const term = `%${escapeLike(queryText)}%`;

  // discountCodes/promotions/posts added 2026-09-07 (Project "SUGI Desk") --
  // found live: the admin command palette/top-bar search only ever covered
  // products/orders/users, so searching for a real discount code, promotion,
  // or post by name silently came back empty. Same shape as the queries
  // already here, not a new pattern. Posts excludes soft-deleted (trashed)
  // rows -- a post sitting in the trash shouldn't surface as a live search
  // result an admin could try to open.
  const [productRows, orderRows, userRows, discountCodeRows, promotionRows, postRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, sku: products.sku, slug: products.slug })
      .from(products)
      .where(or(like(products.name, term), like(products.sku, term)))
      .limit(5),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, customerPhone: orders.customerPhone, totalMnt: orders.totalMnt, status: orders.status })
      .from(orders)
      .where(or(like(orders.orderNumber, term), like(orders.customerName, term), like(orders.customerPhone, term)))
      .limit(5),
    db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role })
      .from(users)
      .where(or(like(users.name, term), like(users.email, term), like(users.phone, term)))
      .limit(5),
    db.select({ id: discountCodes.id, code: discountCodes.code, isActive: discountCodes.isActive })
      .from(discountCodes)
      .where(like(discountCodes.code, term))
      .limit(5),
    db.select({ id: sitePromotions.id, headline: sitePromotions.headline, isActive: sitePromotions.isActive })
      .from(sitePromotions)
      .where(like(sitePromotions.headline, term))
      .limit(5),
    db.select({ id: posts.id, title: posts.title, slug: posts.slug, isPublished: posts.isPublished })
      .from(posts)
      .where(and(or(like(posts.title, term), like(posts.slug, term)), isNull(posts.deletedAt)))
      .limit(5),
  ]);

  return { products: productRows, orders: orderRows, users: userRows, discountCodes: discountCodeRows, promotions: promotionRows, posts: postRows };
}

const orderStatusRank = { pending: 0, confirmed: 1, packed: 2, out_for_delivery: 3, completed: 4 } as const;
export type FulfilmentStatus = keyof typeof orderStatusRank | "cancelled" | "returned";

// Admin overhaul (2026-09-08, Phase E): the tx type a `db.transaction(async
// tx => ...)` callback receives, derived structurally (no direct import of
// drizzle-orm/mysql2's transaction type exists elsewhere in this file) so
// restoreStockForOrder below can be extracted out of updateAdminOrder's
// inline transaction body and reused by refundOrder's own transaction.
export type OrderTx = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];
// Accepted by every branch-stock helper below so they work identically
// standalone (a plain getDb() connection) or inside an existing
// db.transaction callback (OrderTx) -- both expose the same query-builder
// shape, so one implementation covers both without duplicating it.
// Exported (type-only) for the leaf modules db.ts itself imports, e.g.
// server/notificationOutbox.ts.
export type DbOrTx = OrderTx | NonNullable<Awaited<ReturnType<typeof getDb>>>;

// recomputeVariantStockTotal (the cached per-variant / per-product totals
// kept in step with branch_stock) moved to server/stockLedger.ts on
// 2026-09-11, next to the ledger helpers that call it.

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase L/M): the one
 * atomic, race-proof branch-stock decrement -- shared by checkout
 * (createOrderFromActiveCart, requirePublished: true -- see BUG-004) and
 * the POS in-person-sale tool (recordInStoreSale, requirePublished: false
 * -- a physical shelf item's online-publish flag is irrelevant to a
 * register sale; a staff member scanning a real barcode off a real shelf
 * is its own proof the item exists and is for sale).
 *
 * A variant only has branch_stock rows once it's gone through the admin
 * write path (createAdminProductVariant/backfill-branch-stock.ts) -- one
 * inserted directly (a test fixture, or a not-yet-migrated environment
 * with no branches configured at all) has none. hasPerBranchTracking below
 * falls back to the pre-Phase-L aggregate decrement for exactly that case,
 * so this never breaks a variant that was never enrolled in per-branch
 * stock. MySQL forbids "UPDATE x ... WHERE EXISTS (SELECT ... FROM x ...)"
 * -- you can't target a table for update while also selecting FROM that
 * same table in a subquery (error 1093) -- so the two branches below need
 * their own EXISTS shape: the branch_stock UPDATE can safely subquery
 * productVariants (a different table); the legacy productVariants UPDATE
 * has to subquery only `products`.
 */
// Returns whether the variant is on per-branch tracking -- the caller then
// records the ledger movement once it knows the order id (2026-09-11).
export async function decrementBranchStock(tx: OrderTx, branchId: number, variantId: number, quantity: number, options: { requirePublished: boolean; itemLabel: string }): Promise<boolean> {
  const hasPerBranchTracking = (await tx.select({ id: branchStock.id }).from(branchStock).where(eq(branchStock.variantId, variantId)).limit(1)).length > 0;
  const update = hasPerBranchTracking
    ? await tx.update(branchStock).set({
        stockQuantity: sql`${branchStock.stockQuantity} - ${quantity}`,
        updatedAt: new Date(),
      }).where(and(
        eq(branchStock.branchId, branchId),
        eq(branchStock.variantId, variantId),
        gte(branchStock.stockQuantity, quantity),
        options.requirePublished ? sql`EXISTS (SELECT 1 FROM ${productVariants} JOIN ${products} ON ${products.id} = ${productVariants.productId} WHERE ${productVariants.id} = ${branchStock.variantId} AND ${products.isPublished} = TRUE)` : undefined,
      ))
    : await tx.update(productVariants).set({
        stockQuantity: sql`${productVariants.stockQuantity} - ${quantity}`,
        updatedAt: new Date(),
      }).where(and(
        eq(productVariants.id, variantId),
        gte(productVariants.stockQuantity, quantity),
        options.requirePublished ? sql`EXISTS (SELECT 1 FROM ${products} WHERE ${products.id} = ${productVariants.productId} AND ${products.isPublished} = TRUE)` : undefined,
      ));
  if (Number(update[0].affectedRows ?? 0) !== 1) {
    throw new Error(hasPerBranchTracking
      ? `${options.itemLabel} is no longer available in the requested quantity at the selected branch. Please refresh your cart or choose a different branch.`
      : `${options.itemLabel} is no longer available in the requested quantity. Please refresh your cart.`);
  }
  if (hasPerBranchTracking) await recomputeVariantStockTotal(tx, variantId);
  return hasPerBranchTracking;
}

// Extracted from updateAdminOrder's inline loop (Phase E) so refundOrder can
// reuse the exact same restock logic when an admin chooses to restock a
// refunded order's items, rather than re-deriving it. PHASE 2 of product
// variants: restores the specific variant's stock, not the parent product's
// -- a historical order placed before variants existed has variantId null
// (best-effort migration backfill couldn't find one), in which case there's
// nothing to safely restore.
//
// Phase L: restores to the SPECIFIC branch this order actually drew from
// (orders.fulfillingBranchId, captured once at order-creation time) rather
// than re-deriving "whichever branch is currently the default" -- an admin
// could reassign the fulfillment-default branch between this order's
// placement and its later cancellation, and re-deriving at cancel-time
// would then credit back the wrong branch's shelf. Falls back to crediting
// the aggregate directly when EITHER there's no real branch to credit
// (fulfillingBranchId null -- an order placed before this column existed,
// or whose branch was since deleted, FK sets it null via onDelete: "set
// null") OR this variant was never enrolled in per-branch tracking in the
// first place (symmetric with createOrderFromActiveCart's own
// hasPerBranchTracking check -- if the ORIGINAL decrement fell back to the
// legacy aggregate path because no branch_stock rows existed for this
// variant, restoring via branch_stock here would credit a row that was
// never actually debited, inflating stock).
async function restoreStockForOrder(tx: OrderTx, orderId: number, movement: { type: "order_restock" | "refund_restock"; actorUserId?: number | null }) {
  const [orderRow] = await tx.select({ fulfillingBranchId: orders.fulfillingBranchId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  // 2026-09-23: `products.kind`-ийг МӨН уншина. Бэлгийн картын мөр checkout
  // (createOrderFromActiveCart) болон гар захиалгад нөөцөөс ХАСАГДДАГГҮЙ атлаа
  // `order_items.variantId`-тай бичигддэг тул энд болзолгүй буцаагдаж, цуцлалт
  // бүрт байхгүй нөөцийг "буцаан" өсгөж, дэвтэрт харгалзах борлуулалтгүй
  // `order_restock` мөр бичдэг байв (editAdminOrder аль хэдийн хасдаг).
  const lineItems = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity, kind: products.kind })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(orderItems.orderId, orderId));
  const affectedVariantIds = new Set<number>();
  for (const item of lineItems) {
    if (item.variantId === null) continue;
    if (item.kind === "gift_card") continue;
    const hasPerBranchTracking = (await tx.select({ id: branchStock.id }).from(branchStock).where(eq(branchStock.variantId, item.variantId)).limit(1)).length > 0;
    if (orderRow?.fulfillingBranchId && hasPerBranchTracking) {
      // Upserts (a branch created after this variant already had rows
      // elsewhere has no row yet -- the quantity must not be lost) and
      // records the movement against the order (2026-09-11).
      await applyBranchStockDelta(tx, orderRow.fulfillingBranchId, item.variantId, item.quantity, { type: movement.type, refType: "order", refId: orderId, actorUserId: movement.actorUserId ?? null }, { recompute: false });
      affectedVariantIds.add(item.variantId);
    } else {
      await tx.update(productVariants).set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(eq(productVariants.id, item.variantId));
    }
  }
  for (const variantId of Array.from(affectedVariantIds)) await recomputeVariantStockTotal(tx, variantId);
}

// Audit 2026-09-09: store credit is cash-equivalent money the customer
// already handed over (createOrderFromActiveCart debits users.storeCreditMnt
// inside the checkout transaction and writes the negative ledger row), yet
// neither cancellation nor refund ever gave it back -- restoreStockForOrder
// returned the goods to the shelf while the credit simply vanished. Worse,
// refundOrder capped the cash refund at orders.totalMnt, which is the
// AFTER-credit figure, so a 100,000₮ order paid with 30,000₮ credit could be
// "fully refunded" for 70,000₮ and the customer was 30,000₮ short with no
// ledger trace. This is the single reversal used by both unwind paths.
//
// Idempotent by construction: the positive ledger row it writes for this
// orderId is the marker, so a cancel followed by a refund (both legitimate
// on the same order, see refundOrder) credits back exactly once. Runs inside
// the caller's transaction so a failed status flip rolls the credit back too.
async function reverseStoreCreditForOrder(tx: OrderTx, orderId: number, reason: string) {
  const [orderRow] = await tx.select({ userId: orders.userId, orderNumber: orders.orderNumber, storeCreditAppliedMnt: orders.storeCreditAppliedMnt }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!orderRow || !orderRow.userId || orderRow.storeCreditAppliedMnt <= 0) return 0;
  const alreadyReversed = await tx.select({ id: storeCreditLedger.id }).from(storeCreditLedger)
    .where(and(eq(storeCreditLedger.orderId, orderId), eq(storeCreditLedger.userId, orderRow.userId), sql`${storeCreditLedger.deltaMnt} > 0`)).limit(1);
  if (alreadyReversed.length) return 0;
  await tx.update(users).set({ storeCreditMnt: sql`${users.storeCreditMnt} + ${orderRow.storeCreditAppliedMnt}`, updatedAt: new Date() }).where(eq(users.id, orderRow.userId));
  await tx.insert(storeCreditLedger).values({
    userId: orderRow.userId, deltaMnt: orderRow.storeCreditAppliedMnt,
    reason: `Захиалга ${orderRow.orderNumber} ${reason} — дэлгүүрийн зээл буцаан олгов`, actorUserId: null, orderId,
  });
  return orderRow.storeCreditAppliedMnt;
}

export async function updateAdminOrder(input: { id: number; status?: FulfilmentStatus; deliveryTrackingRef?: string | null; adminNote?: string | null; actorUserId?: number | null }) {
  invalidateCachedByPrefix("storefront:bestsellers:");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current[0]) throw new Error("Order not found.");
  if (input.status) {
    const currentStatus = current[0].status;
    // "returned" only ever moves out of "completed" -- everything else that
    // already left the forward-progress track ("cancelled"/"returned"
    // itself) is closed for good. A completed order can ONLY become
    // "returned" from here on, never re-enter the forward progression.
    if (currentStatus === "cancelled" || currentStatus === "returned") throw new Error("This closed order cannot be changed.");
    if (currentStatus === "completed" && input.status !== "returned") throw new Error("This closed order cannot be changed.");
    if (input.status === "returned" && currentStatus !== "completed") throw new Error("Only a completed order can be marked as returned.");
    if (input.status !== "cancelled" && input.status !== "returned" && orderStatusRank[input.status] < orderStatusRank[currentStatus as keyof typeof orderStatusRank]) {
      throw new Error("Order fulfilment cannot move backward.");
    }
  }
  let issuedGiftCards: IssuedGiftCard[] = [];
  // 2026-09-23: роутер энэ тугаар л мэдэгдэл илгээнэ. Өмнө нь зөвхөн
  // `input.status !== undefined`-ийг хардаг байсан бөгөөд ижил төлөвөөр
  // шинэчлэхийг функц зөвшөөрдөг (rank шалгалт нь `<`, guarded flip нь
  // одоогийн мөрд таарна) тул bulk-аар "shipped" тавихад аль хэдийн
  // илгээгдсэн захиалгын эзэд хоёр дахь имэйл/push/SMS (төлбөртэй) авдаг байв.
  const statusChanged = input.status !== undefined && input.status !== current[0].status;
  await db.transaction(async tx => {
    // Audit 2026-09-09: the ladder checks above are a plain read, not a
    // lock -- two concurrent cancels (a double-clicked button, or a customer
    // self-cancel racing a warehouse cancel) both read "confirmed", both
    // passed, and both ran restoreStockForOrder: stock credited back TWICE
    // for one order. Same TOCTOU shape as the audit's BUG-003 phone sessions.
    // Fix is the same WHERE-guard + affectedRows idiom checkout uses: the
    // status flip is conditional on the status we validated against, and it
    // runs FIRST so the loser of the race blocks on the row lock, then sees
    // 0 rows and throws before touching stock or credit.
    if (input.status) {
      const flipped = await tx.update(orders).set({ status: input.status, ...(input.status === "returned" ? { returnedAt: new Date() } : {}), updatedAt: new Date() })
        .where(and(eq(orders.id, input.id), eq(orders.status, current[0].status)));
      if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new Error("This order was changed by someone else just now. Refresh and try again.");
    }
    if (shouldRestoreStock(current[0].status as FulfilmentStatus, input.status)) {
      await restoreStockForOrder(tx, input.id, { type: "order_restock", actorUserId: input.actorUserId ?? null });
    }
    if (input.status === "cancelled") {
      // Цуцлагдсан захиалга купоны тоололд ороогүй (validateDiscountCode-ийн
      // `ne(status, "cancelled")`) тул дэвтрийн суудлыг ч мөн чөлөөлнө — эс
      // бөгөөс хүн цуцалсан захиалгынхаа улмаас кодоо дахин ашиглаж чадахгүй
      // болно (2026-09-16, migration 0084).
      await tx.delete(discountCodeRedemptions).where(eq(discountCodeRedemptions.orderId, input.id));
      // 2026-09-23: нэг хүний суудлыг чөлөөлөөд БҮХ хэрэглээний тоолуурыг
      // чөлөөлдөггүй байсан тул хоёр хязгаар зөрдөг: maxUses=10 захиалга
      // бүгд цуцлагдвал код "дууссан" гэж гарах атлаа тэр хүн бүрт "дахин
      // ашиглаж болно" гэж харагддаг байв.
      //
      // ⚠️ Шалгуур нь устгагдсан `discount_code_redemptions` мөр БИШ:
      // тэр мөр зөвхөн `maxUsesPerCustomer !== null` кодод бичигддэг
      // (cart-orders.ts), харин `usesCount` нь купонтой захиалга БҮРТ
      // өсдөг. Тиймээс купоны код байхад л чөлөөлнө — төлөв шилжүүлэх
      // ладдер нэг захиалгыг зөвхөн НЭГ удаа цуцлуулдаг тул давхар
      // хасалт гарахгүй.
      if (current[0].couponCode) {
        await tx.update(discountCodes)
          .set({ usesCount: sql`GREATEST(${discountCodes.usesCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(discountCodes.code, current[0].couponCode));
      }
      await reverseStoreCreditForOrder(tx, input.id, "цуцлагдсан");
      // Cards this order paid for that nobody has redeemed yet die with it
      // (a redeemed one already became store credit; refundOrder's
      // reverseStoreCreditForOrder does not touch that, by design).
      await voidGiftCardsForOrder(tx, input.id);
    }
    await tx.update(orders).set({
      // status/returnedAt were already written by the guarded flip above.
      // Fixes a real pre-existing gap: paymentStatus was only ever written
      // by the QPay webhook (markQPayPaymentAttemptPaid) -- a cash_on_
      // delivery/bank_transfer/card order never became "paid" anywhere in
      // the codebase, which would otherwise silently zero out every
      // paymentStatus="paid"-gated analytics figure for this store's actual
      // primary payment method. "Completed" is the real-world moment the
      // courier/bank/card charge is confirmed collected, so that's where
      // this fires -- QPay orders are unaffected (already paid earlier, by
      // the webhook, independent of fulfilment status).
      // 2026-09-23: StorePay-г МӨН хасна. Энэ дүрэм 2026-09-08-нд бичигдэхэд
      // зөвхөн QPay webhook-оор баталгаажуулдаг байсан; StorePay (2026-09-12)
      // ч мөн адил callback-оор л төлөгддөг тул зээл хэзээ ч батлагдаагүй
      // байхад ажилтан "дууссан" болгоход захиалга "paid" болж, бэлгийн
      // картын код хүртэл үүсдэг байв.
      ...(input.status === "completed" && !WEBHOOK_PAID_METHODS.includes(current[0].paymentMethod as (typeof WEBHOOK_PAID_METHODS)[number]) ? { paymentStatus: "paid" as const } : {}),
      // Буцаалтын хугацаа/сэтгэгдэл хүсэх ажил `updatedAt`-д найддаг байсан ч
      // MySQL түүнийг БҮХ UPDATE дээр шинэчилдэг (`markReviewRequested`,
      // админы тэмдэглэл г.м.) тул "дууссан" мөчийг тусдаа баганад бичнэ
      // (2026-09-23, migration 0094).
      ...(input.status === "completed" && !current[0].completedAt ? { completedAt: new Date() } : {}),
      ...(input.deliveryTrackingRef !== undefined ? { deliveryTrackingRef: input.deliveryTrackingRef } : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      updatedAt: new Date(),
    }).where(eq(orders.id, input.id));
    // "Completed" is the moment a cash/bank order counts as paid (above), so
    // it is also the moment its gift cards exist. Idempotent: an order the
    // QPay webhook already paid (and issued for) gets nothing twice.
    if (input.status === "completed") issuedGiftCards = await issueGiftCardsForPaidOrder(tx, input.id);
  });
  announceIssuedGiftCards(input.id, issuedGiftCards);
  const updated = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  return { ...updated[0], statusChanged };
}

// ---------------------------------------------------------------------------
// Post-delivery review request + customer return request (2026-09-14).
// ---------------------------------------------------------------------------

/**
 * Completed orders of signed-in buyers that were completed at least `days`
 * ago and have not been asked yet.
 *
 * 2026-09-23: `completedAt`-аар (migration 0094), `updatedAt`-аар БИШ.
 * `updatedAt` нь `.onUpdateNow()`-той тул `markReviewRequested` өөрөө, эсвэл
 * админы тэмдэглэлийн засвар түүнийг өмнө татаж, тоолол дахин эхэлдэг байв.
 * Хуучин мөрүүд (migration-ийн backfill-ээс өмнөх) байвал `updatedAt`-аар
 * нөхнө — эс бөгөөс тэд хэзээ ч сонгогдохгүй. Capped at 60 days old so switching the job on never
 * mails the whole history. Carries what the job needs to deliver: the
 * buyer's name, the order's email, and whether a push subscription exists.
 */
export async function getOrdersNeedingReviewRequest(days: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const floor = new Date(Date.now() - 60 * 86_400_000);
  return db.select({
    orderId: orders.id, orderNumber: orders.orderNumber, userId: orders.userId, customerEmail: orders.customerEmail, customerName: orders.customerName,
    pushSubscriptions: sql<number>`(SELECT COUNT(*) FROM ${pushSubscriptions} WHERE ${pushSubscriptions.userId} = ${orders.userId})`,
  }).from(orders)
    // ⚠️ 2026-09-23: sql template-ээр COALESCE бичиж `cutoff`-ыг дамжуулвал тэр
    // ТҮҮХИЙ `Date` болж bind-лагддаг (баганы encoder дамжихгүй) бөгөөд pool-д
    // mysql2-ийн `timezone` тохируулаагүй тул драйвер түүнийг процессын
    // ОРОН НУТГИЙН цагаар сериалчилж, session нь `+00:00` — UTC+8 лаптоп дээр
    // 8 цагийн зөрүү гарч сэтгэгдэл хүсэх имэйл эрт явна. Багана бүрээр
    // харьцуулж, encoder-ыг ажиллуулна.
    .where(and(eq(orders.status, "completed"), isNotNull(orders.userId), isNull(orders.reviewRequestedAt),
      or(lte(orders.completedAt, cutoff), and(isNull(orders.completedAt), lte(orders.updatedAt, cutoff))),
      gte(orders.createdAt, floor)))
    .orderBy(asc(orders.id)).limit(200);
}

/**
 * Сэтгэгдэл хүсэх мэдэгдлийг ЭЗЭМШИНЭ (2026-09-23): хоёр лаптоп + production
 * нэг DB хуваалцдаг бөгөөд тус бүр өөрийн scheduler-тэй тул хоёулаа ижил
 * захиалгыг сонгож, хоёулаа илгээх боломжтой байв (`runningJobNames` нь
 * зөвхөн процесс доторх цоож). Guarded UPDATE нь жинхэнэ цоож: хоёр дахь
 * процесс `affectedRows === 0` авч илгээхгүй. `runBackInStockJob`-ийн
 * `claimRestockAlert` аль хэдийн ийм загвартай.
 */
/** Эзэмшсэн сэтгэгдлийн хүсэлтийг суллана — ямар ч суваг хүрээгүй бол (2026-09-23). */
export async function clearReviewRequested(orderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(orders).set({ reviewRequestedAt: null }).where(eq(orders.id, orderId));
}

export async function markReviewRequested(orderId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const claimed = await db.update(orders).set({ reviewRequestedAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.reviewRequestedAt)));
  return Number(claimed[0].affectedRows ?? 0) === 1;
}

/**
 * The customer's own return request. Only their own COMPLETED order, once,
 * within the admin-set window after completion. It changes nothing else:
 * staff see the request in Захиалга (and get a push) and decide with the
 * existing "returned" status + refund.
 */
export async function requestOrderReturn(input: { orderId: number; userId: number; reason: string; windowDays: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.userId, input.userId))).limit(1);
  if (!order) throw new Error("Захиалга олдсонгүй.");
  if (order.status !== "completed") throw new Error("Зөвхөн дууссан (хүлээн авсан) захиалгад буцаалтын хүсэлт илгээнэ.");
  if (order.returnRequestedAt) throw new Error("Энэ захиалгад буцаалтын хүсэлт аль хэдийн илгээгдсэн байна.");
  // 2026-09-23: `completedAt`-аар (migration 0094). `updatedAt` нь ямар ч
  // бичилт дээр шинэчлэгддэг тул 14 хоногийн цонх чимээгүй уртсаж, 7 дахь
  // өдөр сэтгэгдэл хүссэн ажил 20 дахь өдөр ч буцаалт зөвшөөрдөг байв.
  const completedAtMs = (order.completedAt ?? order.updatedAt).getTime();
  if (completedAtMs < Date.now() - input.windowDays * 86_400_000) throw new Error(`Буцаалтын хүсэлтийг захиалга дууссанаас хойш ${input.windowDays} хоногийн дотор илгээнэ.`);
  const flipped = await db.update(orders).set({ returnRequestedAt: new Date(), returnRequestReason: input.reason.trim().slice(0, 500), updatedAt: new Date() })
    .where(and(eq(orders.id, input.orderId), isNull(orders.returnRequestedAt)));
  if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new Error("Энэ захиалгад буцаалтын хүсэлт аль хэдийн илгээгдсэн байна.");
  const [updated] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  return updated;
}

// ---------------------------------------------------------------------------
// Staff-side order writes (2026-09-14, Tom: "admin захиалгыг засаж чадахгүй",
// "утсаар/Messenger-ээр ирсэн захиалгыг бүртгэх газаргүй").
// ---------------------------------------------------------------------------

export type ManualOrderLine = { variantId: number; quantity: number };
export type ManualOrderInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryMethod: "ub_delivery" | "store_pickup";
  deliveryAddress?: string | null;
  district?: UbDistrict | null;
  pickupBranch?: string | null;
  paymentMethod: "qpay" | "storepay" | "bank_transfer" | "card" | "cash_on_delivery";
  salesChannel: "phone" | "messenger" | "in_store";
  items: ManualOrderLine[];
  adminNote?: string | null;
  actorUserId: number;
  clientRequestId?: string | null;
};

type OrderLineSource = { variantId: number; productId: number; productName: string; sku: string; priceMnt: number; kind: "physical" | "gift_card" };

async function loadOrderLineSources(db: DbOrTx, variantIds: number[]): Promise<Map<number, OrderLineSource>> {
  if (!variantIds.length) return new Map();
  const rows = await db.select({ variantId: productVariants.id, productId: products.id, productName: products.name, sku: productVariants.sku, priceMnt: productVariants.priceMnt, kind: products.kind })
    .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(productVariants.id, variantIds));
  return new Map(rows.map(row => [row.variantId, row]));
}

/** Same branch resolution as checkout: pickup at a STORE, delivery from the fulfilment default. */
async function resolveFulfillingBranch(deliveryMethod: "ub_delivery" | "store_pickup", pickupBranch: string | null | undefined, digitalOnly: boolean) {
  const active = await getActiveBranches();
  const fulfilment = active.find(branch => branch.isFulfillmentDefault);
  if (deliveryMethod === "store_pickup" && !digitalOnly) {
    const matched = pickupBranch ? active.find(branch => branch.name === pickupBranch && branch.kind === "store") : undefined;
    if (!matched) throw new Error("Авах салбараа зөв сонгоно уу.");
    if (matched.countsTowardOnlineStock) return { fulfillingBranchId: matched.id, pickupBranch: matched.name };
    if (!fulfilment) throw new Error("Үндсэн салбар тохируулаагүй байна.");
    return { fulfillingBranchId: fulfilment.id, pickupBranch: matched.name };
  }
  if (!fulfilment) throw new Error("Үндсэн салбар тохируулаагүй байна.");
  return { fulfillingBranchId: fulfilment.id, pickupBranch: null };
}

/** +delta puts goods back on the order's shelf, -delta takes them (guarded, never below zero). Mirrors restoreStockForOrder / decrementBranchStock. */
async function adjustOrderLineStock(tx: OrderTx, branchId: number | null, variantId: number, delta: number, meta: { orderId: number; actorUserId: number | null; itemLabel: string }) {
  if (delta === 0) return;
  const hasPerBranchTracking = (await tx.select({ id: branchStock.id }).from(branchStock).where(eq(branchStock.variantId, variantId)).limit(1)).length > 0;
  if (delta < 0) {
    if (branchId === null) throw new Error("Энэ захиалгад салбар бүртгэгдээгүй тул бараа нэмэх боломжгүй.");
    const tracked = await decrementBranchStock(tx, branchId, variantId, -delta, { requirePublished: false, itemLabel: meta.itemLabel });
    if (tracked) await recordStockMovement(tx, branchId, variantId, delta, { type: "sale_online", refType: "order", refId: meta.orderId, actorUserId: meta.actorUserId });
    return;
  }
  if (branchId !== null && hasPerBranchTracking) {
    await applyBranchStockDelta(tx, branchId, variantId, delta, { type: "order_restock", refType: "order", refId: meta.orderId, actorUserId: meta.actorUserId }, { itemLabel: meta.itemLabel });
  } else {
    await tx.update(productVariants).set({ stockQuantity: sql`${productVariants.stockQuantity} + ${delta}`, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
  }
}

/**
 * An order keyed in by staff for a customer who called or wrote on
 * Messenger. No coupon / loyalty / store credit -- staff quote the shelf
 * price; stock leaves the fulfilling branch exactly as an online order's
 * would, unpublished products may be sold, and the warehouse push goes out
 * so the pickers see it. Idempotent by clientRequestId like checkout.
 */
export async function createManualOrder(input: ManualOrderInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!input.items.length) throw new Error("Захиалгад дор хаяж нэг бараа хэрэгтэй.");
  if (input.clientRequestId) {
    const replay = await findOrderForClientRequest(db, input.clientRequestId, undefined);
    if (replay) return { ...replay, replayed: true as const };
  }
  const merged = new Map<number, number>();
  for (const line of input.items) merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  const sources = await loadOrderLineSources(db, Array.from(merged.keys()));
  const lines = Array.from(merged, ([variantId, quantity]) => {
    const source = sources.get(variantId);
    if (!source) throw new Error(`Бараа олдсонгүй (variant ${variantId}).`);
    return { ...source, quantity };
  });
  const digitalOnly = lines.every(line => line.kind === "gift_card");
  const branch = await resolveFulfillingBranch(input.deliveryMethod, input.pickupBranch, digitalOnly);
  if (input.deliveryMethod === "ub_delivery" && !input.deliveryAddress?.trim()) throw new Error("Хүргэлтийн хаяг оруулна уу.");
  const subtotalMnt = lines.reduce((sum, line) => sum + line.priceMnt * line.quantity, 0);
  const [deliveryFeeUbMnt, freeShippingThresholdMnt] = await Promise.all([getStoreSettingNumber("delivery-fee-ub-mnt"), getStoreSettingNumber("free-shipping-threshold-mnt")]);
  const deliveryFeeMnt = computeDeliveryFeeMnt({ deliveryMethod: input.deliveryMethod, subtotalMnt, deliveryFeeUbMnt, freeShippingThresholdMnt, digitalOnly });
  const totalMnt = subtotalMnt + deliveryFeeMnt;
  let orderId = 0;
  const place = (orderNumber: string) => db.transaction(async tx => {
    const inserted = await tx.insert(orders).values({
      userId: null, orderNumber, paymentMethod: input.paymentMethod, deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryMethod === "ub_delivery" ? input.deliveryAddress?.trim() ?? null : null,
      deliveryDistrict: input.deliveryMethod === "ub_delivery" ? input.district ?? null : null,
      pickupBranch: branch.pickupBranch, fulfillingBranchId: branch.fulfillingBranchId,
      salesChannel: input.salesChannel,
      customerName: input.customerName.trim(), customerPhone: input.customerPhone.trim(), customerEmail: input.customerEmail?.trim() || null,
      trafficSource: "staff", deviceType: "unknown", clientRequestId: input.clientRequestId ?? null,
      adminNote: input.adminNote?.trim() || null,
      subtotalMnt, deliveryFeeMnt, discountMnt: 0, couponDiscountMnt: 0, loyaltyDiscountMnt: 0, storeCreditAppliedMnt: 0, totalMnt,
    });
    orderId = Number(inserted[0].insertId);
    await tx.insert(orderItems).values(lines.map(line => ({ orderId, productId: line.productId, variantId: line.variantId, productName: line.productName, sku: line.sku, unitPriceMnt: line.priceMnt, quantity: line.quantity })));
    for (const line of lines) {
      if (line.kind === "gift_card") continue;
      await adjustOrderLineStock(tx, branch.fulfillingBranchId, line.variantId, -line.quantity, { orderId, actorUserId: input.actorUserId, itemLabel: line.productName });
    }
    await enqueueNotification(tx, "order.placed", {
      orderNumber, totalMnt, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0), deliveryMethod: input.deliveryMethod, paymentMethod: input.paymentMethod,
      pickupBranchName: branch.pickupBranch,
    }, { dedupeKey: `order:${orderId}` });
  });
  for (let attempt = 1; ; attempt++) {
    try { await place(generateOrderNumber()); break; } catch (error) {
      if (attempt < 3 && isDuplicateOrderNumberError(error)) continue;
      if (input.clientRequestId && isDuplicateKeyError(error, "orders_client_request_unique")) {
        const replay = await findOrderForClientRequest(db, input.clientRequestId, undefined);
        if (replay) return { ...replay, replayed: true as const };
      }
      throw error;
    }
  }
  invalidateCachedByPrefix("storefront:bestsellers:");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return { ...order, replayed: false as const, items: lines.map(line => ({ name: line.productName, quantity: line.quantity, priceMnt: line.priceMnt, attributesJson: null as string | null })) };
}

export type OrderEditInput = {
  id: number;
  actorUserId: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  deliveryMethod?: "ub_delivery" | "store_pickup";
  deliveryAddress?: string | null;
  district?: UbDistrict | null;
  pickupBranch?: string | null;
  /** The complete desired line list; a line missing here is removed, a new variantId is added. */
  items?: ManualOrderLine[];
};

/**
 * Edits an open order in place: contact and delivery details any time before
 * it is completed/closed; the line items only while it is still UNPAID
 * (money already taken must be refunded, not silently re-priced). Stock
 * follows every line change on the order's own fulfilling branch, with the
 * same ledger movements checkout and restock use. Discounts already granted
 * are kept as they were (never recomputed -- a coupon that has since expired
 * must not vanish from an order the customer was quoted); the delivery fee
 * follows the rule for the new basket/method.
 */
export async function editAdminOrder(input: OrderEditInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [current] = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current) throw new Error("Захиалга олдсонгүй.");
  if (current.status === "completed" || current.status === "cancelled" || current.status === "returned") throw new Error("Хаагдсан захиалгыг засах боломжгүй.");
  const existingLines = await db.select({ id: orderItems.id, variantId: orderItems.variantId, productName: orderItems.productName, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt, sku: orderItems.sku })
    .from(orderItems).where(eq(orderItems.orderId, input.id));
  const wantsItemChange = input.items !== undefined;
  if (wantsItemChange && current.paymentStatus !== "unpaid") throw new Error("Төлбөр төлөгдсөн захиалгын бараа өөрчлөх боломжгүй — буцаан олголт хийгээд шинэ захиалга үүсгэнэ үү.");

  // The desired line list, priced from the order's own snapshot for lines it
  // already has and from the catalogue for new ones.
  const desired = new Map<number, number>();
  if (wantsItemChange) {
    for (const line of input.items!) if (line.quantity > 0) desired.set(line.variantId, (desired.get(line.variantId) ?? 0) + line.quantity);
    if (!desired.size) throw new Error("Захиалгад дор хаяж нэг бараа үлдэх ёстой.");
  }
  const newVariantIds = wantsItemChange ? Array.from(desired.keys()).filter(id => !existingLines.some(line => line.variantId === id)) : [];
  // 2026-09-23: ОДОО байгаа ба ХҮССЭН variant-уудын ЭВЛЭЛ. Өмнө нь
  // `wantsItemChange` үед зөвхөн `desired`-ийг уншдаг тул УСТГАГДАЖ байгаа мөрийн
  // `kind` олдохгүй, бэлгийн картын мөр "physical" гэж үзэгдэж нөөц хөндөх
  // оролдлого болдог байв (0 үлдэгдэлтэй дижитал бараа → "хүрэлцэхгүй").
  const existingVariantIds = existingLines.map(line => line.variantId).filter((id): id is number => id !== null);
  const allVariantIds = wantsItemChange ? Array.from(new Set([...desired.keys(), ...existingVariantIds])) : existingVariantIds;
  const sources = await loadOrderLineSources(db, allVariantIds);
  for (const id of newVariantIds) if (!sources.get(id)) throw new Error(`Бараа олдсонгүй (variant ${id}).`);

  const deliveryMethod = input.deliveryMethod ?? current.deliveryMethod;
  const finalLines = wantsItemChange
    ? Array.from(desired, ([variantId, quantity]) => {
        const existing = existingLines.find(line => line.variantId === variantId);
        const source = sources.get(variantId);
        return { variantId, quantity, unitPriceMnt: existing?.unitPriceMnt ?? source!.priceMnt, productName: existing?.productName ?? source!.productName, sku: existing?.sku ?? source!.sku, productId: source?.productId ?? null, kind: source?.kind ?? "physical" };
      })
    : existingLines.map(line => ({ variantId: line.variantId, quantity: line.quantity, unitPriceMnt: line.unitPriceMnt, productName: line.productName, sku: line.sku, productId: null, kind: (line.variantId !== null ? sources.get(line.variantId)?.kind : undefined) ?? "physical" }));
  const digitalOnly = finalLines.length > 0 && finalLines.every(line => line.kind === "gift_card");
  const pickupBranchInput = input.pickupBranch !== undefined ? input.pickupBranch : current.pickupBranch;
  const branch = input.deliveryMethod !== undefined || input.pickupBranch !== undefined
    ? await resolveFulfillingBranch(deliveryMethod, pickupBranchInput, digitalOnly)
    : { fulfillingBranchId: current.fulfillingBranchId, pickupBranch: current.pickupBranch };
  const deliveryAddress = input.deliveryAddress !== undefined ? input.deliveryAddress?.trim() || null : current.deliveryAddress;
  if (deliveryMethod === "ub_delivery" && !deliveryAddress) throw new Error("Хүргэлтийн хаяг оруулна уу.");
  const subtotalMnt = finalLines.reduce((sum, line) => sum + line.unitPriceMnt * line.quantity, 0);
  const [deliveryFeeUbMnt, freeShippingThresholdMnt] = await Promise.all([getStoreSettingNumber("delivery-fee-ub-mnt"), getStoreSettingNumber("free-shipping-threshold-mnt")]);
  const computedDeliveryFeeMnt = computeDeliveryFeeMnt({ deliveryMethod, subtotalMnt, deliveryFeeUbMnt, freeShippingThresholdMnt, digitalOnly });
  // 2026-09-23: ТӨЛӨГДСӨН захиалгын дүнг хэзээ ч дахин бодохгүй. Барааны мөр
  // нь аль хэдийн хаалттай (дээрх шалгалт) ч хүргэлтийн арга/салбар солиход
  // `deliveryFeeMnt`/`totalMnt` дахин бичигддэг байсан тул мөнгө хөдөлгөөгүй
  // байхад 50 000₮ төлсөн захиалга 55 000₮ болж, борлуулалт/гишүүнчлэлийн
  // зарцуулалт/буцаалтын хязгаар бүгд хөрдөг байв.
  const isPaid = current.paymentStatus !== "unpaid";
  // ⚠️ Шалгуурт `computedDeliveryFeeMnt`-ийг дангаараа хэрэглэж БОЛОХГҮЙ: тэр нь
  // ӨНӨӨДРИЙН `delivery-fee-ub-mnt`/`free-shipping-threshold-mnt`-ээр бодогддог
  // тул Tom хүргэлтийн үнээ нэг удаа өсгөхөд түүнээс ӨМНӨ орсон бүх төлөгдсөн
  // захиалга бүхэлдээ засагдахаа болино — утасны буруу цифр ч зассагдахгүй
  // (2026-09-23). Зөвхөн хүргэлтийн арга/салбарыг БОДИТООР сольсон үед л
  // татгалзана; бусад тохиолдолд төлсөн дүн хэвээр (доорх `isPaid ? …`).
  const deliveryShapeChanged = (input.deliveryMethod !== undefined && input.deliveryMethod !== current.deliveryMethod)
    || (input.pickupBranch !== undefined && (input.pickupBranch || null) !== current.pickupBranch);
  if (isPaid && deliveryShapeChanged && computedDeliveryFeeMnt !== current.deliveryFeeMnt) {
    throw new Error("Төлбөр төлөгдсөн захиалгад хүргэлтийн төлбөр өөрчлөх сонголт хийх боломжгүй — буцаан олголт хийгээд шинэ захиалга үүсгэнэ үү.");
  }
  const deliveryFeeMnt = isPaid ? current.deliveryFeeMnt : computedDeliveryFeeMnt;
  const totalMnt = isPaid ? current.totalMnt : Math.max(0, subtotalMnt + deliveryFeeMnt - current.discountMnt - current.couponDiscountMnt - current.loyaltyDiscountMnt - current.storeCreditAppliedMnt);

  // 🔴 2026-09-23: хүргэлтийн арга/салбар солигдож `fulfillingBranchId`
  // өөрчлөгдвөл нөөцийг ХОЁР САЛБАР ХООРОНД ЗӨӨНӨ.
  //
  // Өмнө нь захиалга шинэ салбарыг бичдэг атлаа нөөц нь хуучин салбар дээр
  // хасагдсан хэвээр үлддэг байв — дараа нь цуцлахад `restoreStockForOrder`
  // ШИНЭ салбарт буцаана: хуучин нь мөнхөд дутуу, шинэ нь хуурамч нөөцтэй,
  // дэвтэр нь хоёр талдаа зөрүүтэй. Одоо хуучин салбарт буцааж, шинэ салбараас
  // хасна; шинэ салбарт хүрэлцэхгүй бол засвар бүхэлдээ татгалзана (нөөц
  // хуурамчаар үржихээс илүү тодорхой алдаа).
  const branchChanged = branch.fulfillingBranchId !== current.fulfillingBranchId;
  await db.transaction(async tx => {
    if (branchChanged) {
      for (const line of existingLines) {
        if (line.variantId === null) continue;
        if ((sources.get(line.variantId)?.kind ?? "physical") === "gift_card") continue;
        await adjustOrderLineStock(tx, current.fulfillingBranchId, line.variantId, line.quantity, { orderId: input.id, actorUserId: input.actorUserId, itemLabel: line.productName });
        await adjustOrderLineStock(tx, branch.fulfillingBranchId, line.variantId, -line.quantity, { orderId: input.id, actorUserId: input.actorUserId, itemLabel: line.productName });
      }
    }
    if (wantsItemChange) {
      // Removed or reduced lines give stock back; added or increased lines take it.
      for (const line of existingLines) {
        // A pre-variants line (variantId null) has no stock to move and no
        // way to be re-specified: it is left exactly as it is.
        if (line.variantId === null) continue;
        const next = desired.get(line.variantId) ?? 0;
        const delta = line.quantity - next; // positive = goods return
        const kind = sources.get(line.variantId)?.kind ?? "physical";
        // 2026-09-23: `branch.fulfillingBranchId` — салбар солигдсон бол
        // мөрүүд дээрх блокт аль хэдийн ШИНЭ салбар руу зөөгдсөн байна.
        if (delta !== 0 && kind !== "gift_card") await adjustOrderLineStock(tx, branch.fulfillingBranchId, line.variantId, delta, { orderId: input.id, actorUserId: input.actorUserId, itemLabel: line.productName });
        if (next === 0) await tx.delete(orderItems).where(eq(orderItems.id, line.id));
        else if (next !== line.quantity) await tx.update(orderItems).set({ quantity: next }).where(eq(orderItems.id, line.id));
      }
      for (const variantId of newVariantIds) {
        const source = sources.get(variantId)!;
        const quantity = desired.get(variantId)!;
        if (source.kind !== "gift_card") await adjustOrderLineStock(tx, branch.fulfillingBranchId, variantId, -quantity, { orderId: input.id, actorUserId: input.actorUserId, itemLabel: source.productName });
        await tx.insert(orderItems).values({ orderId: input.id, productId: source.productId, variantId, productName: source.productName, sku: source.sku, unitPriceMnt: source.priceMnt, quantity });
      }
    }
    await tx.update(orders).set({
      ...(input.customerName !== undefined ? { customerName: input.customerName.trim() } : {}),
      ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone.trim() } : {}),
      ...(input.customerEmail !== undefined ? { customerEmail: input.customerEmail?.trim() || null } : {}),
      deliveryMethod,
      deliveryAddress: deliveryMethod === "ub_delivery" ? deliveryAddress : null,
      deliveryDistrict: deliveryMethod === "ub_delivery" ? (input.district !== undefined ? input.district : current.deliveryDistrict) : null,
      pickupBranch: deliveryMethod === "store_pickup" ? branch.pickupBranch : null,
      fulfillingBranchId: branch.fulfillingBranchId,
      ...(isPaid ? {} : { subtotalMnt, deliveryFeeMnt, totalMnt }),
      updatedAt: new Date(),
    }).where(eq(orders.id, input.id));
  });
  invalidateCachedByPrefix("storefront:bestsellers:");
  const [updated] = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  const items = await db.select({ productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt, variantId: orderItems.variantId }).from(orderItems).where(eq(orderItems.orderId, input.id));
  return { ...updated, items };
}

/** The line items of one order as the staff panel and the PDFs need them (variantId included so an edit form can start from them). */
export async function getAdminOrderWithItems(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await db.select({ id: orderItems.id, productId: orderItems.productId, variantId: orderItems.variantId, productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt })
    .from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
  return { ...order, items };
}

// Admin overhaul (2026-09-08, Phase E): the refund/credit flow updateAdminOrder's
// own "returned" handling always deferred as separate, unscoped work.
// Deliberately its own function, not a branch of updateAdminOrder -- this is
// financeProcedure-gated (recording a refund is a money decision), while
// updateAdminOrder stays warehouseProcedure (moving an order through
// fulfilment). Guards enforce: only a "returned" order can be refunded, never
// twice, and the refund can never exceed what the customer actually paid.
export async function refundOrder(input: { id: number; refundAmountMnt: number; refundNote: string | null; restockItems: boolean; actorUserId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!current[0]) throw new Error("Order not found.");
  // Audit 2026-09-09: "returned" was the only refundable state, which left a
  // real dead end -- a QPay order becomes paymentStatus="paid" at webhook
  // time, while still pending/confirmed and therefore still cancellable
  // (orders.cancel / admin.updateOrder). Cancelling restores stock but the
  // money stays collected, and there was no path at all to record giving it
  // back: refundOrder refused (not "returned"), updateAdminOrder refused
  // (closed). A cancelled order that was actually paid is refundable here for
  // exactly that reason. An order that was never recorded as paid has nothing
  // to refund -- the guard below is also what makes the conditional UPDATE
  // race-proof (two concurrent refund clicks: one wins, one sees 0 rows).
  if (current[0].status !== "returned" && current[0].status !== "cancelled") throw new Error("Only a returned or cancelled order can be refunded.");
  if (current[0].paymentStatus === "refunded") throw new Error("This order has already been refunded.");
  if (current[0].paymentStatus !== "paid") throw new Error("This order was never recorded as paid, so there is nothing to refund.");
  // totalMnt is the CASH the customer paid (after any store credit). The
  // store-credit portion is returned as credit by reverseStoreCreditForOrder
  // below, so this cap and that reversal never overlap.
  if (input.refundAmountMnt > current[0].totalMnt) throw new Error("Refund amount cannot exceed the order total.");
  await db.transaction(async tx => {
    const flipped = await tx.update(orders).set({
      paymentStatus: "refunded",
      refundAmountMnt: input.refundAmountMnt,
      refundedAt: new Date(),
      refundNote: input.refundNote,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, input.id), eq(orders.paymentStatus, "paid")));
    if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new Error("This order has already been refunded.");
    if (input.restockItems) {
      await restoreStockForOrder(tx, input.id, { type: "refund_restock", actorUserId: input.actorUserId ?? null });
    }
    await reverseStoreCreditForOrder(tx, input.id, "буцаагдсан");
    await voidGiftCardsForOrder(tx, input.id);
    await enqueueNotification(tx, "refund.recorded", { orderNumber: current[0].orderNumber, refundMnt: input.refundAmountMnt, restocked: input.restockItems }, { dedupeKey: `order:${input.id}` });
  });
  const updated = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  return updated[0];
}

/**
 * Захиалгыг бүрмөсөн устгах (2026-09-16, Tom-ийн хүсэлт).
 *
 * Захиалга бол САНХҮҮГИЙН бичлэг тул энэ нь панелийн хамгийн эмзэг үйлдэл.
 * Тиймээс "цуцлах" (төлөв солих, түүх үлдэнэ) ба "устгах" (мөр алга болно)
 * хоёр нь ТУСДАА: устгах нь зөвхөн туршилтын/хог мөрийг арилгах зориулалттай.
 *
 * Дөрвөн хаалт, дараалалтайгаар:
 *  1. Зөвхөн `cancelled` — идэвхтэй захиалгыг устгаж болохгүй.
 *  2. Зөвхөн `unpaid` — мөнгө хөдөлсөн бол (paid/refunded) бичлэг үлдэнэ.
 *  3. Мөнгө/эрх үүсгэсэн мөр байвал татгалзана: бэлгийн карт (код гарт
 *     байж магад), дэлгүүрийн зээл, купоны ашиглалт, сэтгэгдэл.
 *  4. Нөөцийн хөдөлгөөний НИЙЛБЭР 0 байх ёстой. Цуцлагдсан захиалгад
 *     `sale_online` (-N) ба `order_restock` (+N) хосоороо байдаг тул 0
 *     гарна; 0 биш бол устгавал ledger ба `branch_stock` зөрнө (гарын
 *     авлагын "ledger drift" дүрэм).
 */
export async function deleteAdminOrder(input: { id: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [order] = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
  if (!order) throw new Error("Захиалга олдсонгүй.");

  if (order.status !== "cancelled") {
    throw new Error("Зөвхөн ЦУЦЛАГДСАН захиалгыг устгана. Эхлээд цуцлаарай.");
  }
  if (order.paymentStatus !== "unpaid") {
    throw new Error(`Төлбөрийн төлөв "${order.paymentStatus}" — мөнгө хөдөлсөн захиалга нь санхүүгийн бичлэг тул устгахгүй.`);
  }

  const [giftCard] = await db.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.purchaseOrderId, order.id)).limit(1);
  if (giftCard) throw new Error("Энэ захиалга бэлгийн карт гаргасан байна — устгахгүй (код хэрэглэгчийн гарт байж болно).");
  const [credit] = await db.select({ id: storeCreditLedger.id }).from(storeCreditLedger).where(eq(storeCreditLedger.orderId, order.id)).limit(1);
  if (credit) throw new Error("Энэ захиалгад дэлгүүрийн зээлийн хөдөлгөөн холбогдсон байна — устгахгүй.");
  const [redemption] = await db.select({ id: discountCodeRedemptions.id }).from(discountCodeRedemptions).where(eq(discountCodeRedemptions.orderId, order.id)).limit(1);
  if (redemption) throw new Error("Энэ захиалгад купоны ашиглалт бүртгэгдсэн байна — устгахгүй.");
  const [review] = await db.select({ id: productReviews.id }).from(productReviews).where(eq(productReviews.orderId, order.id)).limit(1);
  if (review) throw new Error("Энэ захиалгад сэтгэгдэл холбогдсон байна — устгахгүй.");

  const moves = await db.select().from(stockMovements).where(and(eq(stockMovements.refType, "order"), eq(stockMovements.refId, order.id)));
  const netDelta = moves.reduce((sum, move) => sum + Number(move.delta), 0);
  if (netDelta !== 0) {
    throw new Error(`Нөөцийн хөдөлгөөний нийлбэр ${netDelta} (0 биш) — устгавал агуулахын үлдэгдэл зөрнө. Эхлээд тооллогоор тэнцүүлнэ үү.`);
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  await db.transaction(async tx => {
    await tx.delete(stockMovements).where(and(eq(stockMovements.refType, "order"), eq(stockMovements.refId, order.id)));
    await tx.delete(paymentAttempts).where(eq(paymentAttempts.orderId, order.id));
    await tx.delete(orderItems).where(eq(orderItems.orderId, order.id));
    await tx.delete(orders).where(eq(orders.id, order.id));
  });

  // Аудитын мөрөнд бүтнээр нь буцаана: устгасны дараа өөр хаанаас ч
  // сэргээх боломжгүй тул юу устсаныг бичлэг дээр үлдээх ёстой.
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    totalMnt: order.totalMnt,
    createdAt: order.createdAt,
    deletedItemCount: items.length,
    deletedMovementCount: moves.length,
  };
}

// Admin overhaul (2026-09-08, Phase F): guest checkout customers have never
// had any way to check their order status after leaving the confirmation
// page -- this is the first one. Phone-first (not email) to match this
// project's own phone-first identity model: customerPhone is NOT NULL,
// customerEmail isn't, so phone is the only field guaranteed present for
// every order including the common cash-on-delivery/bank-transfer checkout.
// Single combined query (order number AND phone match together, same
// tolerant right-8-digits comparison findUserByPhone's own fallback uses,
// since customerPhone is checkout-collected free text, not guaranteed to
// already be in a normalized form) so a wrong order number and a right
// order number with a wrong phone produce the exact same "not found" --
// this is a public, anti-enumeration lookup, not a login.
export async function getOrderForTracking(orderNumber: string, phone: string) {
  const db = await getDb();
  if (!db) return null;
  const digitsOnlyPhone = phone.replace(/\D/g, "");
  if (digitsOnlyPhone.length < 8) return null;
  const localPhone = digitsOnlyPhone.slice(-8);
  const rows = await db.select().from(orders).where(and(eq(orders.orderNumber, orderNumber.trim()), sql`RIGHT(REGEXP_REPLACE(${orders.customerPhone}, '[^0-9]', ''), 8) = ${localPhone}`)).limit(1);
  const order = rows[0];
  if (!order) return null;
  const [items, cards] = await Promise.all([
    db.select({ productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt, kind: products.kind })
      .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, order.id)),
    // The guest who bought a gift card has no profile to read the code from:
    // order number + phone is their proof, same as for every other field here.
    db.select({ code: giftCards.code, amountMnt: giftCards.amountMnt, status: giftCards.status, expiresAt: giftCards.expiresAt })
      .from(giftCards).where(eq(giftCards.purchaseOrderId, order.id)).orderBy(asc(giftCards.id)),
  ]);
  return {
    orderNumber: order.orderNumber,
    giftCards: cards,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    pickupBranch: order.pickupBranch,
    deliveryAddress: order.deliveryAddress,
    deliveryTrackingRef: order.deliveryTrackingRef,
    totalMnt: order.totalMnt,
    createdAt: order.createdAt,
    items,
  };
}
