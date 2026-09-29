// Admin аналитикийн самбар — бизнесийг бодитоор удирддаг хүмүүст (Tom + ажилтнууд)
// зориулсан борлуулалт, харилцагч, дүүргийн тайлан, худалдан авагчид зориулаагүй.
// Энд байгаа тоо бүр аль хэдийн байгаа бодит захиалга/хэрэглэгчийн өгөгдлөөс
// тооцоологдоно; "цоорхой нөхөх" гэж юу ч зохиогдох, тооцоолон таагдахгүй (өгөгдөл
// үнэхээр дутуу үед ч энэ зарчим хэрхэн хэрэгждэгийг доорх demographics хэсгээс
// үзнэ). routers.ts-д adminProcedure-ээр хамгаалагдсан, Security Center /
// Integrations-тай ижил нууцлалын түвшин.
import path from "node:path";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { carts, cartItems, orderItems, orders, productCategories, products, users, visitorSessions } from "../drizzle/schema";
import { getDb, getLoyaltyTierTable, getMarketingSpendRows, settledSaleSql, getSiteName, storeDaySql, storeDayString } from "./db";
import { getOrSetCached } from "./_core/ttlCache";
import { ubDistrictLabels, type UbDistrict } from "../shared/districts";
import { getLoyaltyTier } from "../shared/loyalty";
import { formatMnt } from "@shared/format";

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

/**
 * Raw `sql<string>` aggregates (min/max(createdAt) etc.) skip drizzle's
 * `timestamp` column type -- which is what appends "+0000" to the wire
 * value (see server/db/connection.ts) -- so mysql2 hands back a bare
 * "YYYY-MM-DD HH:MM:SS" string, UTC per `SET time_zone='+00:00'`. Plain
 * `new Date(thatString)` parses it in the VM's LOCAL zone (Asia/Ulaanbaatar,
 * UTC+8) instead, an 8h skew that silently miscounted new-vs-returning
 * customers and mislabeled when tracking started (2026-09-27).
 */
function parseDbUtcTimestamp(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`);
}

function dateRangeConditions(input: DateRangeInput) {
  const conditions = [];
  if (input.dateFrom) conditions.push(gte(orders.createdAt, input.dateFrom));
  if (input.dateTo) conditions.push(lte(orders.createdAt, input.dateTo));
  return conditions;
}


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

  const windowConditions = [settledSaleSql, ...dateRangeConditions(input)];
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
        .where(and(settledSaleSql, inArray(orders.userId, userIds)))
        .groupBy(orders.userId);
      for (const row of firstPaidOrderRows) {
        if (parseDbUtcTimestamp(row.firstPaidAt) >= input.dateFrom) newCustomerCount++;
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
  const dateExpr = storeDaySql(orders.createdAt);
  const rows = await db
    .select({ date: dateExpr, revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)`, orderCount: sql<number>`count(*)` })
    .from(orders)
    .where(and(settledSaleSql, ...dateRangeConditions(input)))
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
    .where(and(settledSaleSql, ...dateRangeConditions(input)))
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
    .where(and(settledSaleSql, ...dateRangeConditions(input)))
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
  const conditions = [settledSaleSql, ...dateRangeConditions(input)];

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

/**
 * Preference Profile v2 (2026-09-01): customers-by-preference-segment view.
 * Same "N of M told us" discipline as getCustomerDemographics above --
 * every bucket is reported against how many customers actually answered
 * that specific question, never against the whole user base. This is the
 * one admin-analytics view genuinely unique to this project (nothing like
 * it exists off-the-shelf) since it depends on the quiz-wizard data the
 * rest of this feature collects.
 */
export async function getPreferenceSegmentBreakdown() {
  const db = await getDb();
  const empty = { totalCustomerCount: 0, genderProvidedCount: 0, genderBreakdown: [], skinTypeProvidedCount: 0, skinTypeBreakdown: [], topSkinConcerns: [], hairTypeProvidedCount: 0, hairTypeBreakdown: [], districtProvidedCount: 0, districtBreakdown: [], hasYoungChildrenCount: 0 } as {
    totalCustomerCount: number; genderProvidedCount: number; genderBreakdown: Array<{ value: string; count: number }>;
    skinTypeProvidedCount: number; skinTypeBreakdown: Array<{ value: string; count: number }>;
    topSkinConcerns: Array<{ value: string; count: number }>;
    hairTypeProvidedCount: number; hairTypeBreakdown: Array<{ value: string; count: number }>;
    districtProvidedCount: number; districtBreakdown: Array<{ district: UbDistrict; label: string; count: number }>;
    hasYoungChildrenCount: number;
  };
  if (!db) return empty;

  const rows = await db.select({
    gender: users.gender, skinType: users.skinType, skinConcerns: users.skinConcerns,
    hairType: users.hairType, primaryDistrict: users.primaryDistrict, hasYoungChildren: users.hasYoungChildren,
  }).from(users).where(eq(users.role, "user"));

  const genderCounts = new Map<string, number>();
  const skinTypeCounts = new Map<string, number>();
  const concernCounts = new Map<string, number>();
  const hairTypeCounts = new Map<string, number>();
  const districtCounts = new Map<UbDistrict, number>();
  let hasYoungChildrenCount = 0;

  for (const row of rows) {
    if (row.gender) genderCounts.set(row.gender, (genderCounts.get(row.gender) ?? 0) + 1);
    if (row.skinType) skinTypeCounts.set(row.skinType, (skinTypeCounts.get(row.skinType) ?? 0) + 1);
    if (row.skinConcerns) row.skinConcerns.split(",").map(v => v.trim()).filter(Boolean).forEach(concern => concernCounts.set(concern, (concernCounts.get(concern) ?? 0) + 1));
    if (row.hairType) hairTypeCounts.set(row.hairType, (hairTypeCounts.get(row.hairType) ?? 0) + 1);
    if (row.primaryDistrict) districtCounts.set(row.primaryDistrict, (districtCounts.get(row.primaryDistrict) ?? 0) + 1);
    if (row.hasYoungChildren === true) hasYoungChildrenCount++;
  }

  const toRows = (map: Map<string, number>) => Array.from(map.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  return {
    totalCustomerCount: rows.length,
    genderProvidedCount: Array.from(genderCounts.values()).reduce((sum, n) => sum + n, 0),
    genderBreakdown: toRows(genderCounts),
    skinTypeProvidedCount: Array.from(skinTypeCounts.values()).reduce((sum, n) => sum + n, 0),
    skinTypeBreakdown: toRows(skinTypeCounts),
    topSkinConcerns: toRows(concernCounts).slice(0, 10),
    hairTypeProvidedCount: Array.from(hairTypeCounts.values()).reduce((sum, n) => sum + n, 0),
    hairTypeBreakdown: toRows(hairTypeCounts),
    districtProvidedCount: Array.from(districtCounts.values()).reduce((sum, n) => sum + n, 0),
    districtBreakdown: Array.from(districtCounts.entries()).map(([district, count]) => ({ district, label: ubDistrictLabels[district], count })).sort((a, b) => b.count - a.count),
    hasYoungChildrenCount,
  };
}

// Admin overhaul (2026-09-08, Phase I): the drill-down behind
// getPreferenceSegmentBreakdown's aggregate counts above -- reuses the
// *exact same* base query (`eq(users.role, "user")`) and the *exact same*
// per-field matching (including skinConcerns' comma-list split/trim/filter/
// includes) as the loop just above, rather than a second, separately-
// maintained copy of that logic. This is what makes "click 25, get 25" a
// guarantee rather than a hope: if this ever drifted from the aggregate
// above, the two would silently disagree.
export type PreferenceSegmentField = "gender" | "skinType" | "skinConcerns" | "hairType" | "primaryDistrict" | "hasYoungChildren";

export async function getUsersBySegment(field: PreferenceSegmentField, value: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: users.id, name: users.name, phone: users.phone, email: users.email,
    gender: users.gender, skinType: users.skinType, skinConcerns: users.skinConcerns,
    hairType: users.hairType, primaryDistrict: users.primaryDistrict, hasYoungChildren: users.hasYoungChildren,
  }).from(users).where(eq(users.role, "user"));

  const matches = (row: (typeof rows)[number]): boolean => {
    switch (field) {
      case "gender": return row.gender === value;
      case "skinType": return row.skinType === value;
      case "hairType": return row.hairType === value;
      case "primaryDistrict": return row.primaryDistrict === value;
      // hasYoungChildren's breakdown above is a single boolean count, not a
      // value-keyed bucket -- value is ignored, matching that shape.
      case "hasYoungChildren": return row.hasYoungChildren === true;
      case "skinConcerns": return Boolean(row.skinConcerns) && row.skinConcerns!.split(",").map(v => v.trim()).filter(Boolean).includes(value);
      default: return false;
    }
  };

  return rows.filter(matches).map(row => ({ id: row.id, name: row.name, phone: row.phone, email: row.email }));
}

// Admin overhaul (2026-09-08, Phase J): the campaign composer's "бүх
// хэрэглэгч" (all users) targeting source -- real customers only (role
// "user"), same scope every other segment/tier query on this page already
// uses, never staff/marketing/etc. accounts.
export async function getAllCustomersForCampaign() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email }).from(users).where(eq(users.role, "user"));
}

/**
 * Preference Profile v2 (2026-09-01): answers the exact gap a live read of
 * the catalog found (4/937 products tagged) directly in the dashboard --
 * how much of the published catalog actually has SOME personalization tag,
 * overall and by category, so this doesn't stay an invisible data-quality
 * problem. "Tagged" = any of the 6 preference columns is non-null (matches
 * scripts/auto-tag-products.ts's own isTagged definition).
 */
export async function getRecommendationCoverage() {
  const db = await getDb();
  if (!db) return { totalPublishedProductCount: 0, taggedProductCount: 0, taggedPercent: 0, byCategory: [] as Array<{ categoryName: string; total: number; tagged: number }> };

  const rows = await db.select({
    categoryName: productCategories.name,
    skinType: products.skinType, skinConcerns: products.skinConcerns, interiorStyle: products.interiorStyle,
    hairType: products.hairType, hairConcerns: products.hairConcerns, fragrancePreference: products.fragrancePreference, wellnessInterests: products.wellnessInterests,
    // 2026-09-23: 2026-09-20-ны tagger v2 нь `skinTypes` (олон утга) ба
    // `productType` руу бичдэг (PROJECT-GUIDE: "шинэ tag `skinTypes`-д") атлаа
    // энэ хучилт зөвхөн хуучин `skinType`-ыг хардаг тул зөвхөн шинэ замаар
    // тэмдэглэгдсэн бараа "тэмдэглээгүй" гэж тоологдож байв.
    skinTypes: products.skinTypes, productType: products.productType,
  }).from(products).leftJoin(productCategories, eq(products.categoryId, productCategories.id)).where(eq(products.isPublished, true));

  const byCategory = new Map<string, { total: number; tagged: number }>();
  let taggedProductCount = 0;
  for (const row of rows) {
    const isTagged = Boolean(row.skinType || row.skinTypes || row.productType || row.skinConcerns || row.interiorStyle || row.hairType || row.hairConcerns || row.fragrancePreference || row.wellnessInterests);
    if (isTagged) taggedProductCount++;
    const key = row.categoryName ?? "(ангилалгүй)";
    const tally = byCategory.get(key) ?? { total: 0, tagged: 0 };
    tally.total++;
    if (isTagged) tally.tagged++;
    byCategory.set(key, tally);
  }

  return {
    totalPublishedProductCount: rows.length,
    taggedProductCount,
    taggedPercent: rows.length ? Math.round((taggedProductCount / rows.length) * 100) : 0,
    byCategory: Array.from(byCategory.entries()).map(([categoryName, tally]) => ({ categoryName, ...tally })).sort((a, b) => b.total - a.total),
  };
}

/** How many real customers sit in each loyalty tier right now (cumulative
 *  paid spend + any admin-credited in-store history — same formula as
 *  getUserLoyaltyStatus in server/db.ts, just aggregated across everyone
 *  instead of one shopper). */
export async function getLoyaltyTierBreakdown() {
  const db = await getDb();
  // 2026-09-12: the ladder is admin-editable (loyalty_tiers), so both the
  // row labels and the classification below read the same live table the
  // storefront and checkout price against -- otherwise renaming a tier in
  // /admin would leave this report counting customers into tiers that no
  // longer exist.
  const tiers = await getLoyaltyTierTable();
  if (!db) return tiers.map(tier => ({ tierName: tier.name, customerCount: 0 }));

  const rows = await db
    .select({
      userId: users.id,
      loyaltyManualAdjustmentMnt: users.loyaltyManualAdjustmentMnt,
      totalSpendMnt: sql<number>`coalesce(sum(case when ${settledSaleSql} then ${orders.totalMnt} else 0 end), 0)`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.loyaltyManualAdjustmentMnt);

  const tierCounts = new Map<string, number>();
  for (const row of rows) {
    const tier = getLoyaltyTier(Number(row.totalSpendMnt) + row.loyaltyManualAdjustmentMnt, tiers);
    tierCounts.set(tier.name, (tierCounts.get(tier.name) ?? 0) + 1);
  }
  return tiers.map(tier => ({ tierName: tier.name, customerCount: tierCounts.get(tier.name) ?? 0 }));
}

// Admin overhaul (2026-09-08, Phase J): the campaign composer's loyalty-tier
// targeting source -- reuses the exact same aggregate query and
// getLoyaltyTier classification as getLoyaltyTierBreakdown just above (same
// "click a tier, get exactly that tier's customers" guarantee Phase I's
// getUsersBySegment already established for preference segments), just
// returning rows instead of a count.
export async function getUsersByLoyaltyTier(tierName: string) {
  const db = await getDb();
  if (!db) return [];
  const tiers = await getLoyaltyTierTable();

  const rows = await db
    .select({
      id: users.id, name: users.name, phone: users.phone, email: users.email,
      loyaltyManualAdjustmentMnt: users.loyaltyManualAdjustmentMnt,
      totalSpendMnt: sql<number>`coalesce(sum(case when ${settledSaleSql} then ${orders.totalMnt} else 0 end), 0)`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.name, users.phone, users.email, users.loyaltyManualAdjustmentMnt);

  return rows
    .filter(row => getLoyaltyTier(Number(row.totalSpendMnt) + row.loyaltyManualAdjustmentMnt, tiers).name === tierName)
    .map(row => ({ id: row.id, name: row.name, phone: row.phone, email: row.email }));
}

const CHANNEL_LABELS: Record<string, string> = { ub_delivery: "УБ хүргэлт", store_pickup: "Салбараас авах", qpay: "QPay", storepay: "StorePay", bank_transfer: "Банкны шилжүүлэг", card: "Карт", cash_on_delivery: "Бэлэн мөнгө" };

/** "Orders by channel" adapted to what this business actually has, rather
 *  than a generic marketplace/shop/store split that doesn't apply here:
 *  how the order was fulfilled (delivery vs. pickup) and how it was paid
 *  for. Both are real columns on every order already. */
export async function getOrdersByChannel(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return { byDeliveryMethod: [], byPaymentMethod: [] };
  const conditions = [settledSaleSql, ...dateRangeConditions(input)];

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
/**
 * Stock KPIs for the admin dashboard.
 *
 * Gift cards are excluded (2026-09-16). They are `products.kind = 'gift_card'`
 * rows carrying a placeholder stockQuantity that means "unlimited", not a
 * shelf count -- on the live catalogue four of them sat at 999 each and added
 * 374,625,000₮ of imaginary stock, 27% of the figure this card was showing.
 * The same placeholder also makes them permanently invisible to the
 * out-of-stock and low-stock alarms, so counting them served nothing: a gift
 * card can never be out of stock. Every merchandising view that measures
 * shelves (sell-through, dead stock, days of cover) must filter the same way.
 */
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
    .where(and(eq(products.isPublished, true), eq(products.kind, "physical")));
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
  const conditions = [settledSaleSql, ...dateRangeConditions(input)];

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
  const conditions = [settledSaleSql, ...dateRangeConditions(input)];

  const [sourceRows, deviceRows] = await Promise.all([
    // revenueMnt added here (Tier D) so "Sales by referer" can be a real
    // ranked-$ list, matching the district breakdown's shape above.
    db.select({ source: orders.trafficSource, orderCount: sql<number>`count(*)`, revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)` }).from(orders).where(and(...conditions)).groupBy(orders.trafficSource).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ device: orders.deviceType, orderCount: sql<number>`count(*)` }).from(orders).where(and(...conditions)).groupBy(orders.deviceType),
  ]);
  // 2026-09-09 deep audit: GROUP BY keeps NULL and the literal "unknown" /
  // "Тодорхойгүй" as separate rows, and the "?? fallback" then produced two
  // rows with the same label -- React logged "two children with the same
  // key `unknown`" on the Analytics section and the admin saw the count
  // split across two identical lines. Merge by the displayed label.
  const mergeBy = <T extends { label: string }>(rows: T[], add: (into: T, row: T) => void) => {
    const byLabel = new Map<string, T>();
    for (const row of rows) { const existing = byLabel.get(row.label); if (existing) add(existing, row); else byLabel.set(row.label, { ...row }); }
    return Array.from(byLabel.values());
  };
  const sources = mergeBy(
    sourceRows.map(row => ({ label: row.source ?? "Тодорхойгүй", orderCount: Number(row.orderCount), revenueMnt: Number(row.revenueMnt) })),
    (into, row) => { into.orderCount += row.orderCount; into.revenueMnt += row.revenueMnt; },
  ).sort((a, b) => b.revenueMnt - a.revenueMnt).map(({ label, ...rest }) => ({ source: label, ...rest }));
  const deviceTypes = mergeBy(
    deviceRows.map(row => ({ label: row.device ?? "unknown", orderCount: Number(row.orderCount) })),
    (into, row) => { into.orderCount += row.orderCount; },
  ).sort((a, b) => b.orderCount - a.orderCount).map(({ label, ...rest }) => ({ device: label, ...rest }));
  return { sources, deviceTypes };
}

/**
 * Period-over-period comparison for the KPI band's sparklines/deltas
 * (Tier D). Only meaningful when a concrete dateFrom is given -- "all time"
 * has no equal-length prior window to compare against (same reasoning
 * getSalesOverview already uses for new-vs-returning), so `available` is
 * false and every other field is a harmless zero/empty rather than a
 * fabricated comparison. The previous window is the same duration,
 * immediately preceding dateFrom.
 */
export type PeriodComparisonMetrics = {
  revenueMnt: number; orderCount: number; aovMnt: number; profitMnt: number;
  // 2026-09-06: for the new admin dashboard's stat cards -- same
  // "getConversionOverview" honesty rules apply (avgSessionDurationSec/
  // conversionRatePercent are null, not 0, whenever sessionsCount is 0).
  sessionsCount: number; totalPageViews: number; avgSessionDurationSec: number | null; conversionRatePercent: number | null;
};
export type PeriodComparison = {
  available: boolean;
  current: PeriodComparisonMetrics;
  previous: PeriodComparisonMetrics | null;
  deltaPercent: { revenueMnt: number | null; orderCount: number | null; aovMnt: number | null; profitMnt: number | null; sessionsCount: number | null; totalPageViews: number | null; avgSessionDurationSec: number | null; conversionRatePercent: number | null };
  previousRevenueTimeseries: { date: string; revenueMnt: number; orderCount: number }[];
  previousVisitorSessionTimeseries: { date: string; sessionCount: number; pageViewCount: number }[];
};

export async function getPeriodComparison(input: DateRangeInput = {}): Promise<PeriodComparison> {
  const emptyMetrics: PeriodComparisonMetrics = { revenueMnt: 0, orderCount: 0, aovMnt: 0, profitMnt: 0, sessionsCount: 0, totalPageViews: 0, avgSessionDurationSec: null, conversionRatePercent: null };
  const unavailable: PeriodComparison = {
    available: false,
    current: emptyMetrics,
    previous: null,
    deltaPercent: { revenueMnt: null, orderCount: null, aovMnt: null, profitMnt: null, sessionsCount: null, totalPageViews: null, avgSessionDurationSec: null, conversionRatePercent: null },
    previousRevenueTimeseries: [],
    previousVisitorSessionTimeseries: [],
  };
  if (!input.dateFrom) return unavailable;
  const dateTo = input.dateTo ?? new Date();
  const durationMs = dateTo.getTime() - input.dateFrom.getTime();
  if (durationMs <= 0) return unavailable;

  const previousDateTo = new Date(input.dateFrom.getTime() - 1);
  const previousInput: DateRangeInput = { dateFrom: new Date(previousDateTo.getTime() - durationMs), dateTo: previousDateTo };

  const [currentOverview, currentProfit, currentConversion, previousOverview, previousProfit, previousConversion, previousRevenueTimeseries, previousVisitorSessionTimeseries] = await Promise.all([
    getSalesOverview(input),
    getProfitOverview(input),
    getConversionOverview(input),
    getSalesOverview(previousInput),
    getProfitOverview(previousInput),
    getConversionOverview(previousInput),
    getRevenueTimeseries(previousInput),
    getVisitorSessionTimeseries(previousInput),
  ]);

  const current: PeriodComparisonMetrics = { revenueMnt: currentOverview.revenueMnt, orderCount: currentOverview.orderCount, aovMnt: currentOverview.aovMnt, profitMnt: currentProfit.profitMnt, sessionsCount: currentConversion.sessionsCount, totalPageViews: currentConversion.totalPageViews, avgSessionDurationSec: currentConversion.avgSessionDurationSec, conversionRatePercent: currentConversion.conversionRatePercent };
  const previous: PeriodComparisonMetrics = { revenueMnt: previousOverview.revenueMnt, orderCount: previousOverview.orderCount, aovMnt: previousOverview.aovMnt, profitMnt: previousProfit.profitMnt, sessionsCount: previousConversion.sessionsCount, totalPageViews: previousConversion.totalPageViews, avgSessionDurationSec: previousConversion.avgSessionDurationSec, conversionRatePercent: previousConversion.conversionRatePercent };
  const deltaOf = (curr: number, prev: number) => prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
  // Nullable pair (avgSessionDurationSec/conversionRatePercent): only a real
  // delta when BOTH periods have at least one session -- never compare
  // against/produce a fabricated number for a period with no tracking data.
  const deltaOfNullable = (curr: number | null, prev: number | null) => curr == null || prev == null || prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

  return {
    available: true,
    current,
    previous,
    deltaPercent: {
      revenueMnt: deltaOf(current.revenueMnt, previous.revenueMnt),
      orderCount: deltaOf(current.orderCount, previous.orderCount),
      aovMnt: deltaOf(current.aovMnt, previous.aovMnt),
      profitMnt: deltaOf(current.profitMnt, previous.profitMnt),
      sessionsCount: deltaOf(current.sessionsCount, previous.sessionsCount),
      totalPageViews: deltaOf(current.totalPageViews, previous.totalPageViews),
      avgSessionDurationSec: deltaOfNullable(current.avgSessionDurationSec, previous.avgSessionDurationSec),
      conversionRatePercent: deltaOfNullable(current.conversionRatePercent, previous.conversionRatePercent),
    },
    previousRevenueTimeseries,
    previousVisitorSessionTimeseries,
  };
}

/**
 * The "P&L statement" card's data -- real fields only, no invented line
 * items (the Geckoboard reference this was modeled on shows things like
 * "Referer cut"/"Paypal transactions" that have no equivalent in this
 * business). deliveryFeesCollectedMnt/discountsGivenMnt are informational
 * context rows ONLY -- both are already netted into netRevenueMnt
 * (orders.totalMnt), so the card's one real subtraction is
 * netRevenueMnt - costOfGoodsMnt. Never subtract them a second time.
 */
export type PnlOverview = {
  subtotalMnt: number;
  deliveryFeesCollectedMnt: number;
  discountsGivenMnt: number;
  netRevenueMnt: number;
  costOfGoodsMnt: number;
  itemsWithCostCount: number;
  totalItemsSold: number;
  netProfitMnt: number;
};

export async function getPnlOverview(input: DateRangeInput = {}): Promise<PnlOverview> {
  const db = await getDb();
  const empty: PnlOverview = { subtotalMnt: 0, deliveryFeesCollectedMnt: 0, discountsGivenMnt: 0, netRevenueMnt: 0, costOfGoodsMnt: 0, itemsWithCostCount: 0, totalItemsSold: 0, netProfitMnt: 0 };
  if (!db) return empty;
  const conditions = [settledSaleSql, ...dateRangeConditions(input)];

  const [row] = await db
    .select({
      subtotalMnt: sql<number>`coalesce(sum(${orders.subtotalMnt}), 0)`,
      deliveryFeesCollectedMnt: sql<number>`coalesce(sum(${orders.deliveryFeeMnt}), 0)`,
      discountsGivenMnt: sql<number>`coalesce(sum(${orders.discountMnt} + ${orders.couponDiscountMnt} + ${orders.loyaltyDiscountMnt}), 0)`,
      netRevenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)`,
    })
    .from(orders)
    .where(and(...conditions));

  const profit = await getProfitOverview(input);
  const netRevenueMnt = Number(row?.netRevenueMnt ?? 0);
  return {
    subtotalMnt: Number(row?.subtotalMnt ?? 0),
    deliveryFeesCollectedMnt: Number(row?.deliveryFeesCollectedMnt ?? 0),
    discountsGivenMnt: Number(row?.discountsGivenMnt ?? 0),
    netRevenueMnt,
    costOfGoodsMnt: profit.costMnt,
    itemsWithCostCount: profit.itemsWithCostCount,
    totalItemsSold: profit.totalItemsSold,
    netProfitMnt: netRevenueMnt - profit.costMnt,
  };
}

/** "YYYY-MM" for every calendar month between dateFrom and dateTo
 *  inclusive -- e.g. a range spanning Aug 20 - Sep 5 returns ["2026-08",
 *  "2026-09"], since marketing spend is only ever entered per whole month. */
function enumerateMonthKeys(dateFrom: Date, dateTo: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
  const end = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

/**
 * CAC = total marketing spend for the period / new customers acquired in
 * that same period (Tier F) -- the standard formula (Shopify/CFI/Yotpo all
 * agree). "New" reuses getSalesOverview's own new-customer count (first-
 * ever paid order falls inside the range) rather than re-deriving it.
 * cacMnt is only ever set when EVERY calendar month touched by the range
 * has an admin-entered marketing_spend row -- a missing month is reported
 * as unavailable, never silently treated as ₮0 spend (the same "N of M"
 * honesty discipline as getProfitOverview, adapted from item-coverage to
 * month-coverage). "All time" has no bounded month list, so it's
 * unavailable too -- same rule getPeriodComparison already uses.
 */
export type CacOverview = {
  totalSpendMnt: number;
  monthsWithSpendCount: number;
  monthsInRangeCount: number;
  newCustomerCount: number;
  cacMnt: number | null;
  unavailableReason: "all_time_not_supported" | "no_spend_entered" | "partial_months" | "no_new_customers" | null;
};

export async function getCacOverview(input: DateRangeInput = {}): Promise<CacOverview> {
  const unavailable = (reason: NonNullable<CacOverview["unavailableReason"]>, extra: Partial<CacOverview> = {}): CacOverview => ({ totalSpendMnt: 0, monthsWithSpendCount: 0, monthsInRangeCount: 0, newCustomerCount: 0, cacMnt: null, unavailableReason: reason, ...extra });
  if (!input.dateFrom) return unavailable("all_time_not_supported");
  const db = await getDb();
  if (!db) return unavailable("no_spend_entered");

  const dateTo = input.dateTo ?? new Date();
  const monthKeys = enumerateMonthKeys(input.dateFrom, dateTo);
  const [spendRows, overview] = await Promise.all([getMarketingSpendRows(monthKeys), getSalesOverview(input)]);
  const totalSpendMnt = spendRows.reduce((sum, row) => sum + row.spendMnt, 0);
  const newCustomerCount = overview.newCustomerCount;

  if (spendRows.length === 0) return unavailable("no_spend_entered", { monthsInRangeCount: monthKeys.length, newCustomerCount });
  if (spendRows.length < monthKeys.length) return unavailable("partial_months", { totalSpendMnt, monthsWithSpendCount: spendRows.length, monthsInRangeCount: monthKeys.length, newCustomerCount });
  if (newCustomerCount === 0) return unavailable("no_new_customers", { totalSpendMnt, monthsWithSpendCount: spendRows.length, monthsInRangeCount: monthKeys.length });

  return { totalSpendMnt, monthsWithSpendCount: spendRows.length, monthsInRangeCount: monthKeys.length, newCustomerCount, cacMnt: Math.round(totalSpendMnt / newCustomerCount), unavailableReason: null };
}

/**
 * Conversion Rate (Tier E) = orders ÷ sessions, the standard formula
 * (Shopify's own published definition explicitly uses sessions, not unique
 * visitors -- it reads lower on purpose). A session "converts" if it
 * produced at least one paid order (server/routers.ts's checkout.createOrder
 * resolves and stores the link at order time). Every order placed before
 * this shipped has visitorSessionId=null forever -- trackingStartedAt lets
 * the UI say "tracking started on X" for a range that predates the
 * feature, rather than implying a real (near-zero) rate for it.
 * conversionRatePercent is null whenever sessionsCount is 0 -- never a
 * fabricated 0%.
 */
export type ConversionOverview = {
  sessionsCount: number;
  convertedSessionsCount: number;
  conversionRatePercent: number | null;
  trackingStartedAt: string | null;
  // 2026-09-06: added for the new admin dashboard's "Дундаж сессийн
  // хугацаа"/"Хуудас үзэлт" stat cards -- both computed in this same
  // query (one extra aggregate each), not a second round trip.
  // avgSessionDurationSec is null under the same "no sessions yet" rule as
  // conversionRatePercent, never a fabricated 0. A genuine single-pageview
  // session contributes 0 seconds to the average -- that's correct (GA's
  // own definition of a bounce), not a data gap.
  totalPageViews: number;
  avgSessionDurationSec: number | null;
};

export async function getConversionOverview(input: DateRangeInput = {}): Promise<ConversionOverview> {
  const db = await getDb();
  const empty: ConversionOverview = { sessionsCount: 0, convertedSessionsCount: 0, conversionRatePercent: null, trackingStartedAt: null, totalPageViews: 0, avgSessionDurationSec: null };
  if (!db) return empty;

  const sessionConditions = [];
  if (input.dateFrom) sessionConditions.push(gte(visitorSessions.createdAt, input.dateFrom));
  if (input.dateTo) sessionConditions.push(lte(visitorSessions.createdAt, input.dateTo));

  const [[sessionsRow], [convertedRow], [earliestRow]] = await Promise.all([
    db.select({
      count: sql<number>`count(*)`,
      totalPageViews: sql<number>`coalesce(sum(${visitorSessions.pageViewCount}), 0)`,
      avgSessionDurationSec: sql<number | null>`avg(timestampdiff(second, ${visitorSessions.createdAt}, ${visitorSessions.lastSeenAt}))`,
    }).from(visitorSessions).where(sessionConditions.length ? and(...sessionConditions) : undefined),
    db.select({ count: sql<number>`count(distinct ${orders.visitorSessionId})` })
      .from(orders)
      .innerJoin(visitorSessions, eq(orders.visitorSessionId, visitorSessions.id))
      .where(and(settledSaleSql, ...sessionConditions)),
    db.select({ earliest: sql<string | null>`min(${visitorSessions.createdAt})` }).from(visitorSessions),
  ]);

  const sessionsCount = Number(sessionsRow?.count ?? 0);
  const convertedSessionsCount = Number(convertedRow?.count ?? 0);
  return {
    sessionsCount,
    convertedSessionsCount,
    conversionRatePercent: sessionsCount > 0 ? Math.round((convertedSessionsCount / sessionsCount) * 100) : null,
    trackingStartedAt: earliestRow?.earliest ? parseDbUtcTimestamp(earliestRow.earliest).toISOString() : null,
    totalPageViews: Number(sessionsRow?.totalPageViews ?? 0),
    avgSessionDurationSec: sessionsCount > 0 && sessionsRow?.avgSessionDurationSec != null ? Math.round(Number(sessionsRow.avgSessionDurationSec)) : null,
  };
}

/** One point per calendar day with at least one session -- mirrors
 *  getRevenueTimeseries's exact sparse-day convention (gap days simply
 *  absent, the chart fills them) for the new "Network Activities" card. */
export async function getVisitorSessionTimeseries(input: DateRangeInput = {}) {
  const db = await getDb();
  if (!db) return [];
  const dateExpr = storeDaySql(visitorSessions.createdAt);
  const conditions = [];
  if (input.dateFrom) conditions.push(gte(visitorSessions.createdAt, input.dateFrom));
  if (input.dateTo) conditions.push(lte(visitorSessions.createdAt, input.dateTo));
  const rows = await db
    .select({ date: dateExpr, sessionCount: sql<number>`count(*)`, pageViewCount: sql<number>`coalesce(sum(${visitorSessions.pageViewCount}), 0)` })
    .from(visitorSessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(dateExpr)
    .orderBy(dateExpr);
  return rows.map(row => ({ date: row.date, sessionCount: Number(row.sessionCount), pageViewCount: Number(row.pageViewCount) }));
}

/**
 * Return Rate (Tier G). By-order (not by-item -- this app has no per-line
 * return granularity, and building that would be a much bigger lift than
 * asked for), windowed by order-placement date (orders.createdAt) for BOTH
 * the numerator and denominator -- same field every sibling function in
 * this file uses, so the ratio stays coherent. Mixing in orders.returnedAt
 * for only one half would let the "rate" exceed 100% or read near-zero
 * purely because recent orders haven't had time to be returned yet.
 * returnsProcessedInRangeCount is a deliberately separate, honestly-
 * different figure ("how many returns did we process this period",
 * windowed by returnedAt instead) -- never folded into the same ratio.
 */
export type ReturnRateOverview = {
  returnRatePercent: number;
  returnedOrderCount: number;
  completedOrReturnedOrderCount: number;
  returnsProcessedInRangeCount: number;
};

export async function getReturnRateOverview(input: DateRangeInput = {}): Promise<ReturnRateOverview> {
  const db = await getDb();
  const empty: ReturnRateOverview = { returnRatePercent: 0, returnedOrderCount: 0, completedOrReturnedOrderCount: 0, returnsProcessedInRangeCount: 0 };
  if (!db) return empty;

  // 🔴 2026-09-23: `settledSaleSql` (paymentStatus = 'paid') БИШ. `refundOrder`
  // нь paymentStatus-ыг "refunded" болгодог тул буцаагдсан захиалга финанс
  // мөнгийг буцаасан ТЭР МӨЧИД тоологчоос БОЛОН хуваарилагчаас хоёуланд нь
  // хаягдаж, буцаалтын хувь бодит байдлын эсрэг 0% руу дөхдөг байв (тэгэхэд
  // тэр нэг картын "энэ хугацаанд боловсруулсан буцаалт" тоо нь тэднийг
  // тоолсоор — нэг дэлгэц дээрх хоёр тоо хоорондоо зөрнө).
  const conditions = [
    sql`(${orders.paymentStatus} IN ('paid', 'refunded') AND ${orders.status} <> 'cancelled')`,
    ...dateRangeConditions(input),
  ];
  const [row] = await db
    .select({
      completedOrReturnedOrderCount: sql<number>`coalesce(sum(case when ${orders.status} in ('completed','returned') then 1 else 0 end), 0)`,
      returnedOrderCount: sql<number>`coalesce(sum(case when ${orders.status} = 'returned' then 1 else 0 end), 0)`,
    })
    .from(orders)
    .where(and(...conditions));

  const returnedAtConditions = [isNotNull(orders.returnedAt)];
  if (input.dateFrom) returnedAtConditions.push(gte(orders.returnedAt, input.dateFrom));
  if (input.dateTo) returnedAtConditions.push(lte(orders.returnedAt, input.dateTo));
  const [processedRow] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(and(...returnedAtConditions));

  const completedOrReturnedOrderCount = Number(row?.completedOrReturnedOrderCount ?? 0);
  const returnedOrderCount = Number(row?.returnedOrderCount ?? 0);
  return {
    returnRatePercent: completedOrReturnedOrderCount > 0 ? Math.round((returnedOrderCount / completedOrReturnedOrderCount) * 100) : 0,
    returnedOrderCount,
    completedOrReturnedOrderCount,
    returnsProcessedInRangeCount: Number(processedRow?.count ?? 0),
  };
}

/** Bundles every section above into one payload — the admin analytics panel
 *  fetches this once per date-range change instead of firing 6 separate
 *  round trips, and the two export functions below render from the exact
 *  same object so the downloaded file always matches what's on screen. */
export async function getAnalyticsReport(input: DateRangeInput = {}) {
  // 60 с кэш (2026-09-21, аудит #5): 29 query-тай тайланг admin таб бүр, refetch бүр
  // дахин тооцдог байв. Тестэд кэшгүй (захиалга үүсгээд шууд тайлан уншдаг).
  if (process.env.NODE_ENV === "test") return computeAnalyticsReport(input);
  const key = `analytics:report:${input.dateFrom?.toISOString() ?? ""}:${input.dateTo?.toISOString() ?? ""}`;
  return getOrSetCached(key, 60_000, () => computeAnalyticsReport(input));
}

async function computeAnalyticsReport(input: DateRangeInput) {
  const [overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers, ordersByChannel, cartAbandonment, inventory, profit, traffic, periodComparison, pnl, returnRate, cac, conversion, visitorSessionTimeseries, preferenceSegments, recommendationCoverage] = await Promise.all([
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
    getPeriodComparison(input),
    getPnlOverview(input),
    getReturnRateOverview(input),
    getCacOverview(input),
    getConversionOverview(input),
    getVisitorSessionTimeseries(input),
    getPreferenceSegmentBreakdown(),
    getRecommendationCoverage(),
  ]);
  return { overview, revenueTimeseries, topProducts, topCategories, districtBreakdown, demographics, loyaltyTiers, ordersByChannel, cartAbandonment, inventory, profit, traffic, periodComparison, pnl, returnRate, cac, conversion, visitorSessionTimeseries, preferenceSegments, recommendationCoverage };
}

type AnalyticsReport = Awaited<ReturnType<typeof getAnalyticsReport>>;

// 2026-09-23: Улаанбаатарын өдрөөр. `toISOString()` нь UTC тул 2026-09-01
// 00:00 (UB) = 2026-08-31T16:00Z бөгөөд Excel/PDF дээр "2026-08-31 — …" гэж
// хэвлэгдэж, харилцагчийн нягтлан буруу хугацаа харж байв.
const ubDayLabel = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const rangeLabel = (input: DateRangeInput) => {
  const from = input.dateFrom ? ubDayLabel(input.dateFrom) : "эхнээс нь";
  const to = input.dateTo ? ubDayLabel(input.dateTo) : "өнөөдөр хүртэл";
  return `${from} — ${to}`;
};

const cacUnavailableLabel = (reason: CacOverview["unavailableReason"]) => {
  switch (reason) {
    case "all_time_not_supported": return "\"Бүх цаг үе\" сонголтод тодорхой хугацааны цонх байхгүй";
    case "no_spend_entered": return "энэ хугацаанд зар сурталчилгааны зардал оруулаагүй";
    case "partial_months": return "зарим сар(ууд)-д зардал оруулаагүй";
    case "no_new_customers": return "энэ хугацаанд шинэ харилцагч алга";
    default: return "мэдээлэл дутуу";
  }
};

/** Multi-sheet workbook: одоо буцах өгөгдлийн бүх хэсэг тус тусдаа sheet
 *  болно. Written for a human to open in Excel and scroll/filter, not as a
 *  machine-readable data dump — hence real column headers and a title row
 *  per sheet, not just a raw table. */
export async function exportAnalyticsExcel(report: AnalyticsReport, input: DateRangeInput = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = await getSiteName();
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
  overviewSheet.addRow([]);
  if (report.conversion.sessionsCount > 0) {
    overviewSheet.addRow(["Хөрвүүлэлтийн хувь (%)", report.conversion.conversionRatePercent]);
    overviewSheet.addRow(["Захиалга болсон / нийт сесс", `${report.conversion.convertedSessionsCount} / ${report.conversion.sessionsCount}`]);
  } else {
    overviewSheet.addRow([report.conversion.trackingStartedAt ? `Хөрвүүлэлтийн хувь: энэ хугацаанд сесс бүртгэгдээгүй (${storeDayString(new Date(report.conversion.trackingStartedAt))}-с хойш хэмжигдэж эхэлсэн)` : "Хөрвүүлэлтийн хувь: хараахан хэмжиж эхлээгүй байна"]);
  }
  overviewSheet.addRow([]);
  overviewSheet.addRow(["Буцаалтын хувь (%)", report.returnRate.returnRatePercent]);
  overviewSheet.addRow(["Буцаагдсан / дууссан+буцаагдсан захиалга", `${report.returnRate.returnedOrderCount} / ${report.returnRate.completedOrReturnedOrderCount}`]);
  overviewSheet.addRow(["Энэ хугацаанд боловсруулсан буцаалт", report.returnRate.returnsProcessedInRangeCount]);
  overviewSheet.addRow([]);
  if (report.cac.cacMnt !== null) {
    overviewSheet.addRow(["Нэг харилцагч татах зардал (CAC, ₮)", report.cac.cacMnt]);
    overviewSheet.addRow(["Зар сурталчилгааны нийт зардал (₮)", report.cac.totalSpendMnt]);
    overviewSheet.addRow(["Шинэ харилцагч (CAC-д ашигласан)", report.cac.newCustomerCount]);
  } else {
    overviewSheet.addRow([`CAC тооцоолох боломжгүй (${cacUnavailableLabel(report.cac.unavailableReason)})`]);
  }
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
  // pdfkit-ийн callback дотор await хийх боломжгүй тул нэрийг урьдчилж уншина.
  const siteName = await getSiteName();
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

    doc.font("Heading").fontSize(20).fillColor("#17181b").text(`${siteName} — Борлуулалтын тайлан`, { align: "left" });
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

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Хөрвүүлэлтийн хувь");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    if (report.conversion.sessionsCount > 0) {
      doc.text(`Хөрвүүлэлтийн хувь: ${report.conversion.conversionRatePercent}% (${report.conversion.convertedSessionsCount} / ${report.conversion.sessionsCount} сесс)`);
    } else if (report.conversion.trackingStartedAt) {
      doc.text(`Энэ хугацаанд сесс бүртгэгдээгүй (${storeDayString(new Date(report.conversion.trackingStartedAt))}-с хойш хэмжигдэж эхэлсэн).`);
    } else {
      doc.text("Тодорхойгүй — хараахан хэмжиж эхлээгүй байна.");
    }
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("Буцаалт");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    doc.text(`Буцаалтын хувь: ${report.returnRate.returnRatePercent}% (${report.returnRate.returnedOrderCount} / ${report.returnRate.completedOrReturnedOrderCount} дууссан захиалга)`);
    doc.text(`Энэ хугацаанд боловсруулсан буцаалт: ${report.returnRate.returnsProcessedInRangeCount}`);
    doc.moveDown(1);

    doc.font("Heading").fontSize(13).fillColor("#17181b").text("CAC (Нэг харилцагч татах зардал)");
    doc.font("Body").fontSize(10).fillColor("#3a3b3f");
    if (report.cac.cacMnt !== null) {
      doc.text(`CAC: ${formatMnt(report.cac.cacMnt)} / шинэ харилцагч`);
      doc.text(`Нийт зар сурталчилгааны зардал: ${formatMnt(report.cac.totalSpendMnt)} — Шинэ харилцагч: ${report.cac.newCustomerCount}`);
    } else {
      doc.text(`CAC тооцоолох боломжгүй: ${cacUnavailableLabel(report.cac.unavailableReason)}.`);
    }
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

/* ---------------------------------------------------------------------------
 * Dashboard highlights (2026-09-08, reference-driven admin redesign)
 *
 * Two ranked lists the new dashboard's "Их зарагдсан бүтээгдэхүүн" /
 * "Шилдэг харилцагчид" cards render. Deliberately NOT folded into
 * getAnalyticsReport: that report is also the Excel/PDF export's data
 * source, and these two carry presentation-only extras (an image URL, an
 * avatar) that have no place in a spreadsheet. Separate procedure, separate
 * query -- the dashboard pays for exactly what it shows.
 * ------------------------------------------------------------------------ */

/** getTopProducts + the product's own photo/SKU, for the dashboard's
 *  thumbnail list. LEFT JOIN (not inner) so a since-deleted product still
 *  reports its historical sales, exactly like getTopProducts -- it just
 *  renders with the placeholder image instead of a photo. */
export async function getTopProductsWithMedia(input: DateRangeInput & { limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const soldQtyExpr = sql<number>`sum(${orderItems.quantity})`;
  const rows = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      sku: sql<string>`min(${orderItems.sku})`,
      imageUrl: sql<string | null>`min(${products.imageUrl})`,
      slug: sql<string | null>`min(${products.slug})`,
      soldQuantity: soldQtyExpr,
      revenueMnt: sql<number>`coalesce(sum(${orderItems.unitPriceMnt} * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(and(settledSaleSql, ...dateRangeConditions(input)))
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(desc(soldQtyExpr))
    .limit(input.limit ?? 5);
  return rows.map(row => ({
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    imageUrl: row.imageUrl ?? null,
    slug: row.slug ?? null,
    soldQuantity: Number(row.soldQuantity),
    revenueMnt: Number(row.revenueMnt),
  }));
}

/** Customers ranked by paid orders placed inside the window. Signed-in
 *  customers only -- a guest checkout has no stable identity to rank across
 *  orders (same limitation getSalesOverview's new/returning split already
 *  documents). Falls back to the order's own customerName when the user row
 *  has no name set, so a real buyer never renders as a blank row. */
export async function getTopCustomers(input: DateRangeInput & { limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const orderCountExpr = sql<number>`count(*)`;
  const rows = await db
    .select({
      userId: orders.userId,
      name: sql<string | null>`min(coalesce(${users.name}, ${orders.customerName}))`,
      phone: sql<string | null>`min(${users.phone})`,
      avatarUrl: sql<string | null>`min(${users.avatarUrl})`,
      orderCount: orderCountExpr,
      revenueMnt: sql<number>`coalesce(sum(${orders.totalMnt}), 0)`,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(settledSaleSql, isNotNull(orders.userId), ...dateRangeConditions(input)))
    .groupBy(orders.userId)
    .orderBy(desc(orderCountExpr))
    .limit(input.limit ?? 5);
  return rows.map(row => ({
    userId: row.userId as number,
    name: row.name ?? "Нэргүй харилцагч",
    phone: row.phone ?? null,
    avatarUrl: row.avatarUrl ?? null,
    orderCount: Number(row.orderCount),
    revenueMnt: Number(row.revenueMnt),
  }));
}

export async function getDashboardHighlights(input: DateRangeInput = {}) {
  const [topProducts, topCustomers] = await Promise.all([
    getTopProductsWithMedia({ ...input, limit: 5 }),
    getTopCustomers({ ...input, limit: 5 }),
  ]);
  return { topProducts, topCustomers };
}
