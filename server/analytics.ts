// Admin analytics dashboard — sales, customer, and district reporting for
// people who actually run the business (Tom + staff), not shopper-facing.
// Every figure here is computed from real orders/users data that already
// exists; nothing is fabricated or estimated to "fill a gap" (see the
// demographics section below for how that discipline is enforced even when
// data is genuinely incomplete). adminProcedure-gated in routers.ts, same
// sensitivity tier as Security Center / Integrations.
import path from "node:path";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { carts, cartItems, orderItems, orders, productCategories, products, users } from "../drizzle/schema";
import { getDb } from "./db";
import { ubDistrictLabels, type UbDistrict } from "../shared/districts";
import { LOYALTY_TIERS, getLoyaltyTier } from "../shared/loyalty";

// pdfkit's built-in standard-14 fonts (Helvetica etc.) are Latin-only per
// the PDF spec — Cyrillic text renders as garbage without embedding a real
// Unicode font. DejaVu Sans has broad, well-established Cyrillic coverage
// (including Mongolian Cyrillic) and a permissive bundling license — see
// server/assets/fonts/DejaVuSans-LICENSE.txt. Resolved relative to this
// file (import.meta.dirname) rather than process.cwd() so it works
// identically under `tsx` (dev, unbundled -- resolves to server/assets/…)
// and the esbuild production bundle (dist/index.js -- resolves to
// dist/assets/…, which is why the build script also copies this folder).
const FONT_REGULAR = path.resolve(import.meta.dirname, "assets", "fonts", "DejaVuSans.ttf");
const FONT_BOLD = path.resolve(import.meta.dirname, "assets", "fonts", "DejaVuSans-Bold.ttf");

export type DateRangeInput = { dateFrom?: Date; dateTo?: Date };

function dateRangeConditions(input: DateRangeInput) {
  const conditions = [];
  if (input.dateFrom) conditions.push(gte(orders.createdAt, input.dateFrom));
  if (input.dateTo) conditions.push(lte(orders.createdAt, input.dateTo));
  return conditions;
}

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;

/**
 * Headline KPIs. Only counts paymentStatus="paid" orders (same "actually
 * charged" discipline as getBestsellingProducts in server/db.ts) so a
 * pending/cancelled order never inflates revenue. New-vs-returning is only
 * meaningful when a dateFrom is given (an "all time" view has no way to
 * define "new" — everyone's first order is somewhere in all time) and only
 * covers signed-in customers (a guest checkout has no stable identity to
 * track across orders).
 */
export async function getSalesOverview(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { revenueMnt: 0, orderCount: 0, aovMnt: 0, newCustomerCount: 0, returningCustomerCount: 0 };

  const windowConditions = [eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)];
  const [totalsRow] = await db
    .select({ revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)`, orderCount: sql<number>`count(*)` })
    .from(orders)
    .where(and(...windowConditions));

  let newCustomerCount = 0;
  let returningCustomerCount = 0;
  if (input.dateFrom) {
    const customersInWindow = await db
      .selectDistinct({ userId: orders.userId })
      .from(orders)
      .where(and(...windowConditions, isNotNull(orders.userId)));
    const userIds = customersInWindow.map(row => row.userId).filter((id): id is number => id != null);
    if (userIds.length) {
      const firstPaidOrderRows = await db
        .select({ userId: orders.userId, firstPaidAt: sql<string>`min(${orders.createdAt})` })
        .from(orders)
        .where(and(eq(orders.paymentStatus, "paid"), inArray(orders.userId, userIds)))
        .groupBy(orders.userId);
      for (const row of firstPaidOrderRows) {
        if (new Date(row.firstPaidAt) >= input.dateFrom) newCustomerCount++;
        else returningCustomerCount++;
      }
    }
  }

  const orderCount = Number(totalsRow?.orderCount ?? 0);
  const revenueMnt = Number(totalsRow?.revenueMnt ?? 0);
  return { revenueMnt, orderCount, aovMnt: orderCount > 0 ? Math.round(revenueMnt / orderCount) : 0, newCustomerCount, returningCustomerCount };
}

/** One point per calendar day with at least one paid order — for the
 *  revenue line chart. Days with zero orders are simply absent (the chart
 *  fills gaps itself) rather than padded with synthetic zero rows here. */
export async function getRevenueTimeseries(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return [];
  const dateExpr = sql<string>`date(${orders.createdAt})`;
  const rows = await db
    .select({ date: dateExpr, revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)`, orderCount: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)))
    .groupBy(dateExpr)
    .orderBy(dateExpr);
  return rows.map(row => ({ date: row.date, revenueMnt: Number(row.revenueMnt), orderCount: Number(row.orderCount) }));
}

/** Ranked by units sold. Reads order_items' own denormalized productName
 *  (not a live join to products) so a since-deleted or renamed product
 *  still reports correctly against its historical sales — same
 *  denormalization the order confirmation email/receipt already relies on. */
export async function getTopProducts(input: DateRangeInput & { limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const soldQtyExpr = sql<number>`sum(${orderItems.quantity})`;
  const rows = await db
    .select({ productId: orderItems.productId, productName: orderItems.productName, soldQuantity: soldQtyExpr, revenueMnt: sql<number>`coalesce(sum(${orderItems.unitPriceMnt} * ${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)))
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(desc(soldQtyExpr))
    .limit(input.limit ?? 10);
  return rows.map(row => ({ productId: row.productId, productName: row.productName, soldQuantity: Number(row.soldQuantity), revenueMnt: Number(row.revenueMnt) }));
}

/** Same idea, grouped by category — requires the product to still exist
 *  (categoryId lives on products, not denormalized onto order_items), so a
 *  deleted product's historical sales drop out of this specific view (they
 *  still count in getTopProducts/getSalesOverview). Acceptable: category
 *  mix is a "what kind of things sell" question, not a legal/financial one. */
export async function getTopCategories(input: DateRangeInput & { limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const soldQtyExpr = sql<number>`sum(${orderItems.quantity})`;
  const rows = await db
    .select({ categoryName: productCategories.name, soldQuantity: soldQtyExpr, revenueMnt: sql<number>`coalesce(sum(${orderItems.unitPriceMnt} * ${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)))
    .groupBy(productCategories.id, productCategories.name)
    .orderBy(desc(soldQtyExpr))
    .limit(input.limit ?? 10);
  return rows.map(row => ({ categoryName: row.categoryName, soldQuantity: Number(row.soldQuantity), revenueMnt: Number(row.revenueMnt) }));
}

/** Real district breakdown of *orders* (who actually bought, via their
 *  delivery address's дүүрэг) — not website *visits*, which this app has no
 *  infrastructure to track yet (see the analytics router comment in
 *  routers.ts). store_pickup orders have no delivery district by
 *  definition; ub_delivery orders placed before the district field existed
 *  report as unknownCount unless scripts/backfill-order-districts.ts has
 *  been run against them. */
export async function getDistrictBreakdown(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { districts: [], storePickupCount: 0, unknownCount: 0 };
  const conditions = [eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)];

  const deliveryRows = await db
    .select({ district: orders.deliveryDistrict, orderCount: sql<number>`count(*)`, revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` })
    .from(orders)
    .where(and(...conditions, eq(orders.deliveryMethod, "ub_delivery")))
    .groupBy(orders.deliveryDistrict);

  const [storePickupRow] = await db
    .select({ orderCount: sql<number>`count(*)` })
    .from(orders)
    .where(and(...conditions, eq(orders.deliveryMethod, "store_pickup")));

  const districts = deliveryRows
    .filter((row): row is typeof row & { district: UbDistrict } => row.district !== null)
    .map(row => ({ district: row.district, districtLabel: ubDistrictLabels[row.district], orderCount: Number(row.orderCount), revenueMnt: Number(row.revenueMnt) }))
    .sort((a, b) => b.orderCount - a.orderCount);
  const unknownCount = Number(deliveryRows.find(row => row.district === null)?.orderCount ?? 0);

  return { districts, storePickupCount: Number(storePickupRow?.orderCount ?? 0), unknownCount };
}

/**
 * Age/occupation are optional profile fields nobody is required to fill in
 * (see the schema comment on users.birthYear) — so this MUST report against
 * "N of M customers told us", never silently pretend the sample is
 * everyone. providedCount/totalCustomerCount are always returned alongside
 * the breakdowns specifically so the admin UI can't accidentally render a
 * pie chart that looks like a complete picture when it isn't.
 */
export async function getCustomerDemographics() {
  const db = await getDb();
  if (!db) return { totalCustomerCount: 0, ageProvidedCount: 0, ageBuckets: [], occupationProvidedCount: 0, topOccupations: [] };

  const [[{ totalCustomerCount }], [{ ageProvidedCount }], [{ occupationProvidedCount }]] = await Promise.all([
    db.select({ totalCustomerCount: sql<number>`count(*)` }).from(users).where(eq(users.role, "user")),
    db.select({ ageProvidedCount: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "user"), isNotNull(users.birthYear))),
    db.select({ occupationProvidedCount: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "user"), isNotNull(users.occupation))),
  ]);

  const currentYear = new Date().getFullYear();
  const ageBucketExpr = sql<string>`case
    when (${currentYear} - ${users.birthYear}) < 18 then '<18'
    when (${currentYear} - ${users.birthYear}) between 18 and 24 then '18-24'
    when (${currentYear} - ${users.birthYear}) between 25 and 34 then '25-34'
    when (${currentYear} - ${users.birthYear}) between 35 and 44 then '35-44'
    when (${currentYear} - ${users.birthYear}) between 45 and 54 then '45-54'
    else '55+'
  end`;
  const ageBuckets = await db
    .select({ bucket: ageBucketExpr, count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "user"), isNotNull(users.birthYear)))
    .groupBy(ageBucketExpr);

  const topOccupations = await db
    .select({ occupation: users.occupation, count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "user"), isNotNull(users.occupation)))
    .groupBy(users.occupation)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    totalCustomerCount: Number(totalCustomerCount),
    ageProvidedCount: Number(ageProvidedCount),
    ageBuckets: ageBuckets.map(row => ({ bucket: row.bucket, count: Number(row.count) })),
    occupationProvidedCount: Number(occupationProvidedCount),
    topOccupations: topOccupations.map(row => ({ occupation: row.occupation!, count: Number(row.count) })),
  };
}

/** How many real customers sit in each loyalty tier right now (cumulative
 *  paid spend + any admin-credited in-store history — same formula as
 *  getUserLoyaltyStatus in server/db.ts, just aggregated across everyone
 *  instead of one shopper). */
export async function getLoyaltyTierBreakdown() {
  const db = await getDb();
  if (!db) return LOYALTY_TIERS.map(tier => ({ tierName: tier.name, customerCount: 0 }));

  const rows = await db
    .select({
      userId: users.id,
      loyaltyManualAdjustmentMnt: users.loyaltyManualAdjustmentMnt,
      totalSpendMnt: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalMnt} else 0 end), 0)`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.loyaltyManualAdjustmentMnt);

  const tierCounts = new Map<string, number>();
  for (const row of rows) {
    const tier = getLoyaltyTier(Number(row.totalSpendMnt) + row.loyaltyManualAdjustmentMnt);
    tierCounts.set(tier.name, (tierCounts.get(tier.name) ?? 0) + 1);
  }
  return LOYALTY_TIERS.map(tier => ({ tierName: tier.name, customerCount: tierCounts.get(tier.name) ?? 0 }));
}

const CHANNEL_LABELS: Record<string, string> = { ub_delivery: "УБ хүргэлт", store_pickup: "Салбараас авах", qpay: "QPay", bank_transfer: "Банкны шилжүүлэг", card: "Карт", cash_on_delivery: "Бэлэн мөнгө" };

/** "Orders by channel" adapted to what this business actually has, rather
 *  than a generic marketplace/shop/store split that doesn't apply here:
 *  how the order was fulfilled (delivery vs. pickup) and how it was paid
 *  for. Both are real columns on every order already. */
export async function getOrdersByChannel(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { byDeliveryMethod: [], byPaymentMethod: [] };
  const conditions = [eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)];

  const [byDelivery, byPayment] = await Promise.all([
    db.select({ key: orders.deliveryMethod, orderCount: sql<number>`count(*)` }).from(orders).where(and(...conditions)).groupBy(orders.deliveryMethod),
    db.select({ key: orders.paymentMethod, orderCount: sql<number>`count(*)` }).from(orders).where(and(...conditions)).groupBy(orders.paymentMethod),
  ]);
  return {
    byDeliveryMethod: byDelivery.map(row => ({ key: row.key, label: CHANNEL_LABELS[row.key] ?? row.key, orderCount: Number(row.orderCount) })),
    byPaymentMethod: byPayment.map(row => ({ key: row.key, label: CHANNEL_LABELS[row.key] ?? row.key, orderCount: Number(row.orderCount) })),
  };
}

/**
 * Cart abandonment, computed from real cart data rather than a status flag
 * nothing in the app actually sets (carts.status has an "abandoned" enum
 * value, but no code path writes it — see cartOwnerCondition/
 * createOrderFromActiveCart in server/db.ts, which only ever write "active"
 * or "converted"). A cart counts as abandoned here if it has at least one
 * item, was created inside the window, was never converted to an order,
 * and hasn't been touched in the last 24h (still mid-session otherwise —
 * counting a cart someone is actively shopping in right now as "abandoned"
 * would be misleading).
 */
export async function getCartAbandonment(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { cartsWithItems: 0, convertedCount: 0, abandonedCount: 0, abandonmentRatePercent: 0 };
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const conditions = [];
  if (input.dateFrom) conditions.push(gte(carts.createdAt, input.dateFrom));
  if (input.dateTo) conditions.push(lte(carts.createdAt, input.dateTo));

  const cartRows = await db
    .selectDistinct({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .where(conditions.length ? and(...conditions) : undefined);

  const convertedCount = cartRows.filter(row => row.status === "converted").length;
  const abandonedCount = cartRows.filter(row => row.status !== "converted" && new Date(row.updatedAt) < staleCutoff).length;
  const cartsWithItems = cartRows.length;
  const decidedCount = convertedCount + abandonedCount; // excludes still-in-progress carts from the rate, same reasoning as new-vs-returning above
  return { cartsWithItems, convertedCount, abandonedCount, abandonmentRatePercent: decidedCount > 0 ? Math.round((abandonedCount / decidedCount) * 100) : 0 };
}

/** Real-time stock snapshot (not date-ranged — this is "right now", not a
 *  historical figure) — total stock value at current selling price, plus
 *  how many products are out of stock vs. running low, mirroring the
 *  low-stock widget already on the main dashboard (AdminDashboardHome)
 *  but as one summary tile here instead of a live product list. */
export async function getInventorySnapshot() {
  const db = await getDb();
  if (!db) return { publishedProductCount: 0, outOfStockCount: 0, lowStockCount: 0, stockValueMnt: 0 };
  const [row] = await db
    .select({
      publishedProductCount: sql<number>`count(*)`,
      outOfStockCount: sql<number>`sum(case when ${products.stockQuantity} = 0 then 1 else 0 end)`,
      lowStockCount: sql<number>`sum(case when ${products.stockQuantity} > 0 and ${products.stockQuantity} <= 5 then 1 else 0 end)`,
      stockValueMnt: sql<number>`coalesce(sum(${products.priceMnt} * ${products.stockQuantity}), 0)`,
    })
    .from(products)
    .where(eq(products.isPublished, true));
  return {
    publishedProductCount: Number(row?.publishedProductCount ?? 0),
    outOfStockCount: Number(row?.outOfStockCount ?? 0),
    lowStockCount: Number(row?.lowStockCount ?? 0),
    stockValueMnt: Number(row?.stockValueMnt ?? 0),
  };
}

/**
 * Real gross profit -- ONLY for order lines whose product has a costMnt an
 * admin actually entered (see the schema comment on products.costMnt).
 * itemsWithCostCount/totalItemsSold are always returned alongside so the
 * UI can say "N/M зарагдсан барааны cost мэдээлэлтэй" and never present a
 * partial-coverage profit figure as the true total. profitMnt itself is
 * therefore a floor (real profit is >= this number, never less), which is
 * the honest way to show a partial figure rather than silently omitting it.
 */
export async function getProfitOverview(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { revenueWithCostDataMnt: 0, costMnt: 0, profitMnt: 0, marginPercent: 0, itemsWithCostCount: 0, totalItemsSold: 0 };
  const conditions = [eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)];

  const [totalsRow] = await db
    .select({ totalItemsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(...conditions));

  const [costRow] = await db
    .select({
      revenueWithCostDataMnt: sql<number>`coalesce(sum(${orderItems.unitPriceMnt} * ${orderItems.quantity}), 0)`,
      costMnt: sql<number>`coalesce(sum(${products.costMnt} * ${orderItems.quantity}), 0)`,
      itemsWithCostCount: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(...conditions, isNotNull(products.costMnt)));

  const revenueWithCostDataMnt = Number(costRow?.revenueWithCostDataMnt ?? 0);
  const costMnt = Number(costRow?.costMnt ?? 0);
  const profitMnt = revenueWithCostDataMnt - costMnt;
  return {
    revenueWithCostDataMnt,
    costMnt,
    profitMnt,
    marginPercent: revenueWithCostDataMnt > 0 ? Math.round((profitMnt / revenueWithCostDataMnt) * 100) : 0,
    itemsWithCostCount: Number(costRow?.itemsWithCostCount ?? 0),
    totalItemsSold: Number(totalsRow?.totalItemsSold ?? 0),
  };
}

/** Traffic source / device -- see the schema comment on orders.trafficSource
 *  and orders.deviceType. Both are null for every order placed before this
 *  shipped, and stay null for any order this specific capture step doesn't
 *  recognize -- reported as an explicit "тодорхойгүй" bucket, not silently
 *  dropped, so the totals always still add up to orderCount. */
export async function getTrafficBreakdown(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { sources: [], deviceTypes: [] };
  const conditions = [eq(orders.paymentStatus, "paid"), ...dateRangeConditions(input)];

  const [sourceRows, deviceRows] = await Promise.all([
    db.select({ source: orders.trafficSource, orderCount: sql<number>`count(*)` }).from(orders).where(and(...conditions)).groupBy(orders.trafficSource).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ device: orders.deviceType, orderCount: sql<number>`count(*)` }).from(orders).where(and(...conditions)).groupBy(orders.deviceType),
  ]);
  return {
    sources: sourceRows.map(row => ({ source: row.source ?? "Тодорхойгүй", orderCount: Number(row.orderCount) })),
    deviceTypes: deviceRows.map(row => ({ device: row.device ?? "unknown", orderCount: Number(row.orderCount) })),
  };
}

/** Bundles every section above into one payload — the admin analytics panel
 *  fetches this once per date-range change instead of firing 6 separate
 *  round trips, and the two export functions below render from the exact
 *  same object so the downloaded file always matches what's on screen. */
export async function getAnalyticsReport(input: DateRangeInput = {}) {
  const [overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers, ordersByChannel, cartAbandonment, inventory, profit, traffic] = await Promise.all([
    getSalesOverview(input),
    getRevenueTimeseries(input),
    getTopProducts({ ...input, limit: 15 }),
    getTopCategories({ ...input, limit: 15 }),
    getDistrictBreakdown(input),
    getCustomerDemographics(),
    getLoyaltyTierBreakdown(),
    getOrdersByChannel(input),
    getCartAbandonment(input),
    getInventorySnapshot(),
    getProfitOverview(input),
    getTrafficBreakdown(input),
  ]);
  return { overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers, ordersByChannel, cartAbandonment, inventory, profit, traffic };
}

type AnalyticsReport = Awaited<ReturnType<typeof getAnalyticsReport>>;

const rangeLabel = (input: DateRangeInput) => {
  const from = input.dateFrom ? input.dateFrom.toISOString().slice(0, 10) : "эхнээс нь";
  const to = input.dateTo ? input.dateTo.toISOString().slice(0, 10) : "өнөөдөр хүртэл";
  return `${from} — ${to}`;
};

/** Multi-sheet workbook: одоо буцах өгөгдлийн бүх хэсэг тус тусдаа sheet
 *  болно. Written for a human to open in Excel and scroll/filter, not as a
 *  machine-readable data dump — hence real column headers and a title row
 *  per sheet, not just a raw table. */
export async function exportAnalyticsExcel(report: AnalyticsReport, input: DateRangeInput = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SUGI ASAYAKE";
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet("Тойм");
  overviewSheet.addRow([`Борлуулалтын тайлан — ${rangeLabel(input)}`]);
  overviewSheet.addRow([]);
  overviewSheet.addRow(["Нийт борлуулалт (₮)", report.overview.revenueMnt]);
  overviewSheet.addRow(["Захиалгын тоо", report.overview.orderCount]);
  overviewSheet.addRow(["Дундаж захиалгын дүн (₮)", report.overview.aovMnt]);
  overviewSheet.addRow(["Шинэ харилцагч", report.overview.newCustomerCount]);
  overviewSheet.addRow(["Давтан харилцагч", report.overview.returningCustomerCount]);
  overviewSheet.addRow([]);
  overviewSheet.addRow([`Цэвэр ашиг (cost мэдээлэлтэй ${report.profit.itemsWithCostCount}/${report.profit.totalItemsSold} зарагдсан ширхэгээр)`]);
  overviewSheet.addRow(["Ашиг (₮, доод тал нь)", report.profit.profitMnt]);
  overviewSheet.addRow(["Ашгийн хувь (%)", report.profit.marginPercent]);
  overviewSheet.addRow([]);
  overviewSheet.addRow(["Сагс орхилтын хувь (%)", report.cartAbandonment.abandonmentRatePercent]);
  overviewSheet.addRow(["Нөөцийн үнэ цэн (₮)", report.inventory.stockValueMnt]);
  overviewSheet.addRow(["Дууссан бараа", report.inventory.outOfStockCount]);
  overviewSheet.addRow(["Бага үлдэгдэлтэй бараа", report.inventory.lowStockCount]);
  overviewSheet.getColumn(1).width = 40;

  const revenueSheet = workbook.addWorksheet("Өдөр тутмын орлого");
  revenueSheet.addRow(["Огноо", "Орлого (₮)", "Захиалгын тоо"]);
  for (const row of report.revenueTimeseries) revenueSheet.addRow([row.date, row.revenueMnt, row.orderCount]);
  revenueSheet.columns.forEach(column => { column.width = 18; });

  const productsSheet = workbook.addWorksheet("Их зарагдсан бараа");
  productsSheet.addRow(["Бараа", "Зарагдсан тоо", "Орлого (₮)"]);
  for (const row of report.topProducts) productsSheet.addRow([row.productName, row.soldQuantity, row.revenueMnt]);
  productsSheet.columns.forEach(column => { column.width = 30; });

  const categoriesSheet = workbook.addWorksheet("Ангиллаар");
  categoriesSheet.addRow(["Ангилал", "Зарагдсан тоо", "Орлого (₮)"]);
  for (const row of report.topCategories) categoriesSheet.addRow([row.categoryName, row.soldQuantity, row.revenueMnt]);
  categoriesSheet.columns.forEach(column => { column.width = 24; });

  const districtSheet = workbook.addWorksheet("Дүүргээр");
  districtSheet.addRow(["Дүүрэг", "Захиалгын тоо", "Орлого (₮)"]);
  for (const row of report.districtBreakdown.districts) districtSheet.addRow([row.districtLabel, row.orderCount, row.revenueMnt]);
  districtSheet.addRow(["Салбараас авсан", report.districtBreakdown.storePickupCount, ""]);
  districtSheet.addRow(["Тодорхойгүй", report.districtBreakdown.unknownCount, ""]);
  districtSheet.columns.forEach(column => { column.width = 26; });

  const demographicsSheet = workbook.addWorksheet("Харилцагчийн мэдээлэл");
  demographicsSheet.addRow([`Нас өгсөн: ${report.demographics.ageProvidedCount} / ${report.demographics.totalCustomerCount} харилцагч`]);
  demographicsSheet.addRow(["Насны бүлэг", "Тоо"]);
  for (const row of report.demographics.ageBuckets) demographicsSheet.addRow([row.bucket, row.count]);
  demographicsSheet.addRow([]);
  demographicsSheet.addRow([`Мэргэжил өгсөн: ${report.demographics.occupationProvidedCount} / ${report.demographics.totalCustomerCount} харилцагч`]);
  demographicsSheet.addRow(["Мэргэжил", "Тоо"]);
  for (const row of report.demographics.topOccupations) demographicsSheet.addRow([row.occupation, row.count]);
  demographicsSheet.columns.forEach(column => { column.width = 28; });

  const loyaltySheet = workbook.addWorksheet("Гишүүнчлэл");
  loyaltySheet.addRow(["Түвшин", "Харилцагчийн тоо"]);
  for (const row of report.loyaltyTiers) loyaltySheet.addRow([row.tierName, row.customerCount]);
  loyaltySheet.columns.forEach(column => { column.width = 22; });

  const channelSheet = workbook.addWorksheet("Суваг");
  channelSheet.addRow(["Хүргэлтийн хэлбэр", "Захиалгын тоо"]);
  for (const row of report.ordersByChannel.byDeliveryMethod) channelSheet.addRow([row.label, row.orderCount]);
  channelSheet.addRow([]);
  channelSheet.addRow(["Төлбөрийн хэлбэр", "Захиалгын тоо"]);
  for (const row of report.ordersByChannel.byPaymentMethod) channelSheet.addRow([row.label, row.orderCount]);
  channelSheet.columns.forEach(column => { column.width = 26; });

  const trafficSheet = workbook.addWorksheet("Эх сурвалж, Төхөөрөмж");
  trafficSheet.addRow(["Эх сурвалж (referrer/UTM)", "Захиалгын тоо"]);
  for (const row of report.traffic.sources) trafficSheet.addRow([row.source, row.orderCount]);
  trafficSheet.addRow([]);
  trafficSheet.addRow(["Төхөөрөмж", "Захиалгын тоо"]);
  for (const row of report.traffic.deviceTypes) trafficSheet.addRow([row.device, row.orderCount]);
  trafficSheet.columns.forEach(column => { column.width = 30; });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** One-page-ish formatted PDF summary — the "send this to someone" format,
 *  covering the headline numbers and top-N tables rather than every raw
 *  row (that's what the Excel export is for). pdfkit builds the PDF
 *  synchronously into a stream; wrapped in a Promise so the caller can just
 *  await a Buffer like the Excel export above. */
export async function exportAnalyticsPdf(report: AnalyticsReport, input: DateRangeInput = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Must be registered before any .text() call -- the standard-14
    // fonts pdfkit defaults to have no Cyrillic glyphs at all (see the
    // FONT_REGULAR/FONT_BOLD comment above).
    doc.registerFont("Body", FONT_REGULAR);
    doc.registerFont("Heading", FONT_BOLD);

    doc.font("Heading").fontSize(20).fillColor("#17181b").text("SUGI ASAYAKE — Борлуулалтын тайлан", { align: "left" });
    doc.font("Body").fontSize(10).fillColor("#75767b").text(rangeLabel(input));
    doc.moveDown(1.2);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Тойм");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    doc.text(`Нийт борлуулалт: ${formatMnt(report.overview.revenueMnt)}`);
    doc.text(`Захиалгын тоо: ${report.overview.orderCount}`);
    doc.text(`Дундаж захиалгын дүн: ${formatMnt(report.overview.aovMnt)}`);
    doc.text(`Шинэ / давтан харилцагч: ${report.overview.newCustomerCount} / ${report.overview.returningCustomerCount}`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Их зарагдсан бараа (эхний 10)");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    for (const row of report.topProducts.slice(0, 10)) doc.text(`${row.productName} — ${row.soldQuantity}ш — ${formatMnt(row.revenueMnt)}`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Дүүргээр захиалга");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    for (const row of report.districtBreakdown.districts) doc.text(`${row.districtLabel} — ${row.orderCount} захиалга — ${formatMnt(row.revenueMnt)}`);
    doc.text(`Салбараас авсан — ${report.districtBreakdown.storePickupCount} захиалга`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Гишүүнчлэлийн түвшин");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    for (const row of report.loyaltyTiers) doc.text(`${row.tierName} — ${row.customerCount} харилцагч`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Ашиг / маржин");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    if (report.profit.itemsWithCostCount > 0) {
      doc.text(`Ашиг: ${formatMnt(report.profit.profitMnt)} (${report.profit.marginPercent}% маржин)`);
      doc.text(`Өртөг мэдэгдэж буй бараа: ${report.profit.itemsWithCostCount} / ${report.profit.totalItemsSold} зарагдсан ширхэг`);
    } else {
      doc.text("Ямар ч бараанд өртгийн үнэ (costMnt) оруулаагүй тул ашиг тооцоолох боломжгүй.");
    }
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Сагс, хаягдал");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    doc.text(`Идэвхтэй/хуучин сагс (бараатай): ${report.cartAbandonment.cartsWithItems}`);
    doc.text(`Захиалга болсон: ${report.cartAbandonment.convertedCount}`);
    doc.text(`Хаягдсан (24ц+ идэвхгүй): ${report.cartAbandonment.abandonedCount} (${report.cartAbandonment.abandonmentRatePercent}%)`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Нөөц");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    doc.text(`Нийтлэгдсэн бараа: ${report.inventory.publishedProductCount}`);
    doc.text(`Дууссан нөөц: ${report.inventory.outOfStockCount}`);
    doc.text(`Бага нөөц (≤5): ${report.inventory.lowStockCount}`);
    doc.text(`Нөөцийн үнэлгээ: ${formatMnt(report.inventory.stockValueMnt)}`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Хүргэлт, төлбөрийн суваг");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    for (const row of report.ordersByChannel.byDeliveryMethod) doc.text(`${row.label} — ${row.orderCount} захиалга`);
    for (const row of report.ordersByChannel.byPaymentMethod) doc.text(`${row.label} — ${row.orderCount} захиалга`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Эх сурвалж, төхөөрөмж");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    if (report.traffic.sources.length === 0) {
      doc.text("Одоогоор бүртгэгдсэн эх сурвалжийн мэдээлэл алга.");
    } else {
      for (const row of report.traffic.sources.slice(0, 10)) doc.text(`${row.source} — ${row.orderCount} захиалга`);
    }
    for (const row of report.traffic.deviceTypes) doc.text(`${row.device} — ${row.orderCount} захиалга`);

    doc.end();
  });
}
