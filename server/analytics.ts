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
import { orderItems, orders, productCategories, products, users } from "../drizzle/schema";
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

/** Bundles every section above into one payload — the admin analytics panel
 *  fetches this once per date-range change instead of firing 6 separate
 *  round trips, and the two export functions below render from the exact
 *  same object so the downloaded file always matches what's on screen. */
export async function getAnalyticsReport(input: DateRangeInput = {}) {
  const [overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers] = await Promise.all([
    getSalesOverview(input),
    getRevenueTimeseries(input),
    getTopProducts({ ...input, limit: 15 }),
    getTopCategories({ ...input, limit: 15 }),
    getDistrictBreakdown(input),
    getCustomerDemographics(),
    getLoyaltyTierBreakdown(),
  ]);
  return { overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers };
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
  overviewSheet.getColumn(1).width = 32;

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

    doc.end();
  });
}
