// server/db/site.ts — Онцлох брэнд, салбар, storefront кэш, site media/text/documents, ажлын байр, гишүүнчлэлийн зэрэглэл.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { branches, branchStock, featuredBrands, jobApplications, jobPostings, stockMovements, loyaltyTiers, products, siteDocuments, siteMedia, siteText, users } from "../../drizzle/schema";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { recomputeVariantTotalsForBranch } from "../stockLedger";
import { sanitizePostContent } from "../_core/sanitizeHtml";
import { getSiteTextSlot, type SiteTextSlotKey } from "../../shared/site-text";
import { LOYALTY_TIERS, type LoyaltyTier } from "../../shared/loyalty";
import { getDb } from "./connection";
import { DbOrTx } from "./admin-orders";

// NEWVISION.md §5 "Топ брэндүүд" -- same CRUD shape as posts above.
export type FeaturedBrandWriteInput = { brandName: string; tagline?: string | null; photoUrl?: string | null; logoUrl?: string | null; sortOrder?: number; isActive?: boolean };

/**
 * Public, customer-facing list -- active brands only, in admin-chosen
 * order. `photoUrl` falls back to the most recently added real, published,
 * imaged product carrying this brand when the admin hasn't uploaded a
 * dedicated brand photo, same "never show a broken/placeholder tile"
 * discipline as CategoryMasonry's per-category photo fallback.
 */
export async function getFeaturedBrands() {
  // 2026-09-14: cached like the other storefront reads (see STOREFRONT_CACHE_TTL_MS).
  return getOrSetCached("storefront:featuredBrands", STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    const brands = await db.select().from(featuredBrands).where(eq(featuredBrands.isActive, true)).orderBy(asc(featuredBrands.sortOrder));

    /*
     * 2026-09-11: this used to run one fallback query PER brand inside a
     * Promise.all -- nine active brands, most without an uploaded photo, meant
     * up to nine extra connections opened on every single homepage render
     * against a pool of ten (mysql2's default), with Aiven ~174ms away. On a
     * warm homepage that was the most expensive thing the page did.
     *
     * Now it is one query for all of them. MySQL has no DISTINCT ON, so the
     * "newest imaged product per brand" pick is done here instead: order by
     * createdAt descending and keep the first row seen for each brand. The
     * result is identical to the old per-brand `ORDER BY createdAt DESC LIMIT 1`.
     */
    const needsFallback = brands.filter(brand => !brand.photoUrl).map(brand => brand.brandName);
    if (!needsFallback.length) return brands;

    const fallbackRows = await db
      .select({ brand: products.brand, imageUrl: products.imageUrl, createdAt: products.createdAt })
      .from(products)
      .where(and(
        inArray(products.brand, needsFallback),
        eq(products.isPublished, true),
        isNotNull(products.imageUrl),
        ne(products.imageUrl, ""),
      ))
      .orderBy(desc(products.createdAt), desc(products.id));

    const newestByBrand = new Map<string, string>();
    for (const row of fallbackRows) {
      if (row.brand && !newestByBrand.has(row.brand)) newestByBrand.set(row.brand, row.imageUrl ?? "");
    }
    return brands.map(brand => brand.photoUrl
      ? brand
      : { ...brand, photoUrl: newestByBrand.get(brand.brandName) || null });
  });
}

export async function getAdminFeaturedBrands() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(featuredBrands).orderBy(asc(featuredBrands.sortOrder));
}

/** Admin's "add a brand" dropdown -- real, currently-used products.brand
 *  values only (never free text), so a featured-brand tile can never point
 *  at zero real products. Counts help the admin judge which brands are
 *  actually worth featuring. */
export async function getDistinctRealBrands() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ brand: products.brand, count: sql<number>`count(*)` }).from(products)
    .where(and(eq(products.isPublished, true), sql`${products.brand} IS NOT NULL AND ${products.brand} <> ''`))
    .groupBy(products.brand)
    .orderBy(desc(sql`count(*)`));
}

/**
 * Public brand directory behind /brands -- the "View Full Brand List" the
 * Featured Brands carousel links to (Tom, 2026-09-10, pointing at
 * matsuyaginza.com/en/brands).
 *
 * Deliberately built from real `products.brand` values rather than the
 * curated `featured_brands` table: that table holds a handful of hand-picked
 * tiles, while a "full brand list" that shows six of the catalogue's brands
 * would be a lie. The featured rows are only joined in for their artwork, so
 * a brand that has a logo shows it and every other brand still gets listed.
 */
export async function getBrandDirectory() {
  // 2026-09-14: cached like the other storefront reads (see STOREFRONT_CACHE_TTL_MS).
  return getOrSetCached("storefront:brandDirectory", STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    const [counts, featured] = await Promise.all([
      db.select({ brand: products.brand, count: sql<number>`count(*)` }).from(products)
        .where(and(eq(products.isPublished, true), sql`${products.brand} IS NOT NULL AND ${products.brand} <> ''`))
        .groupBy(products.brand),
      db.select().from(featuredBrands).where(eq(featuredBrands.isActive, true)),
    ]);
    const artwork = new Map(featured.map(row => [row.brandName, row]));
    return counts
      .filter((row): row is { brand: string; count: number } => Boolean(row.brand))
      .map(row => {
        const tile = artwork.get(row.brand);
        return {
          brandName: row.brand,
          productCount: Number(row.count),
          logoUrl: tile?.logoUrl ?? null,
          isFeatured: Boolean(tile),
        };
      })
      // Alphabetical by the visitor's locale, not MySQL's collation -- this list
      // mixes Latin and Cyrillic brand names and is read as an A-Z index.
      .sort((a, b) => a.brandName.localeCompare(b.brandName, "mn"));
  });
}

export async function createFeaturedBrand(input: FeaturedBrandWriteInput) {
  invalidateCached("storefront:featuredBrands"); invalidateCached("storefront:brandDirectory");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(featuredBrands).values({ ...input, tagline: input.tagline ?? null, photoUrl: input.photoUrl ?? null, logoUrl: input.logoUrl ?? null, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true });
  const created = await db.select().from(featuredBrands).where(eq(featuredBrands.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateFeaturedBrand(input: { id: number } & Partial<FeaturedBrandWriteInput>) {
  invalidateCached("storefront:featuredBrands"); invalidateCached("storefront:brandDirectory");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(featuredBrands).where(eq(featuredBrands.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Brand not found.");
  const { id, ...changes } = input;
  await db.update(featuredBrands).set({ ...changes, updatedAt: new Date() }).where(eq(featuredBrands.id, id));
  const updated = await db.select().from(featuredBrands).where(eq(featuredBrands.id, id)).limit(1);
  return updated[0];
}

export async function deleteFeaturedBrand(id: number) {
  invalidateCached("storefront:featuredBrands"); invalidateCached("storefront:brandDirectory");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(featuredBrands).where(eq(featuredBrands.id, id));
  return { id };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase J). Same
 * active-only/sortOrder-ordered shape as getFeaturedBrands, minus that
 * function's photo-fallback step (a branch's photo is optional decoration,
 * not the point of the record -- StoreLocatorSection already renders fine
 * with no photo at all).
 */
export async function getActiveBranches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.sortOrder));
}

export /** The branches a shopper sees: active STORES only (2026-09-11). A
 *  warehouse is a stock location -- never listed, never a pickup point. */
/**
 * Storefront reads that every page load performs and almost nobody changes
 * (2026-09-12 performance pass). A homepage view used to make ~11 separate
 * trips to Aiven, which sits ~174ms away in Bangalore -- so the first paint
 * waited on a round trip per widget even when the answer had been identical
 * all week.
 *
 * A short TTL rather than a long one with perfect invalidation: the writers
 * drop their own key immediately, so an admin edit shows at once, and the TTL
 * is only the backstop for a path that forgets to (the second laptop writing
 * to the same database, a script, a manual SQL fix).
 *
 * Per-process, like every other cache here -- see _core/ttlCache.ts on why
 * there is no Redis. With one process that IS the cache; with several, each
 * keeps its own copy for 30 seconds.
 */
const STOREFRONT_CACHE_TTL_MS = 30_000;
export const STOREFRONT_CACHE_KEYS = {
  branches: "storefront:branches",
  siteMedia: "storefront:siteMedia",
  siteText: "storefront:siteText",
  siteDocuments: "storefront:siteDocuments",
  storeSettings: "storefront:storeSettings",
  categories: "storefront:categories",
  loyaltyTiers: "storefront:loyaltyTiers",
  posts: "storefront:posts",
  jobPostings: "storefront:jobPostings",
} as const;

type StorefrontCacheKey = keyof typeof STOREFRONT_CACHE_KEYS;

export /** Called by every writer that can change what a storefront page shows. */
function invalidateStorefront(...keys: StorefrontCacheKey[]) {
  for (const key of keys) invalidateCached(STOREFRONT_CACHE_KEYS[key]);
}

export async function getStorefrontBranches() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.branches, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(branches).where(and(eq(branches.isActive, true), eq(branches.kind, "store"))).orderBy(asc(branches.sortOrder));
  });
}

/** Assigns (or clears) the location a staff member works at. */
export async function updateAdminUserBranch(userId: number, branchId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (branchId !== null) {
    const [branch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, branchId), eq(branches.isActive, true))).limit(1);
    if (!branch) throw new Error("Идэвхтэй салбар сонгоно уу.");
  }
  const updated = await db.update(users).set({ branchId, updatedAt: new Date() }).where(eq(users.id, userId));
  if (Number(updated[0].affectedRows ?? 0) !== 1) throw new Error("Хэрэглэгч олдсонгүй.");
  return { userId, branchId };
}

export async function getAdminBranches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).orderBy(asc(branches.sortOrder));
}

export type BranchWriteInput = {
  name: string;
  slug: string;
  address: string;
  phone?: string | null;
  mapUrl?: string | null;
  photoUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isFulfillmentDefault?: boolean;
  kind?: "store" | "warehouse";
  countsTowardOnlineStock?: boolean;
  lowStockThreshold?: number | null;
};

/** The branch every online delivery ships from must be a real, active shelf
 *  whose stock is what the website sells -- otherwise the storefront would
 *  show one number and checkout would draw from another (2026-09-11). */
function assertValidFulfillmentBranch(branch: { isFulfillmentDefault: boolean; isActive: boolean; countsTowardOnlineStock: boolean }) {
  if (!branch.isFulfillmentDefault) return;
  if (!branch.isActive) throw new Error("Онлайн захиалгын үндсэн салбар идэвхтэй байх ёстой.");
  if (!branch.countsTowardOnlineStock) throw new Error("Онлайн захиалгын үндсэн салбарын нөөц онлайн нөөцөд тооцогдох ёстой.");
}

/** At most one branch can be the fulfillment default (Phase L reads exactly
 *  one row for UB-delivery stock decrements) -- setting one on clears it
 *  from every other row in the same write, so the admin toggle behaves like
 *  a radio button, not an independent checkbox per row. */
async function clearOtherFulfillmentDefaults(db: DbOrTx, exceptId?: number) {
  const condition = exceptId ? and(eq(branches.isFulfillmentDefault, true), sql`${branches.id} <> ${exceptId}`) : eq(branches.isFulfillmentDefault, true);
  await db.update(branches).set({ isFulfillmentDefault: false, updatedAt: new Date() }).where(condition);
}

export async function createBranch(input: BranchWriteInput) {
  invalidateStorefront("branches");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  assertValidFulfillmentBranch({ isFulfillmentDefault: input.isFulfillmentDefault ?? false, isActive: input.isActive ?? true, countsTowardOnlineStock: input.countsTowardOnlineStock ?? true });
  let id = 0;
  // One transaction (2026-09-11): the "only one default" swap used to run as
  // two separate writes, so a crash between them could leave no default --
  // and every UB delivery checkout failing.
  await db.transaction(async tx => {
    const inserted = await tx.insert(branches).values({
      name: input.name, slug: input.slug, address: input.address,
      phone: input.phone ?? null, mapUrl: input.mapUrl ?? null, photoUrl: input.photoUrl ?? null,
      sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true, isFulfillmentDefault: input.isFulfillmentDefault ?? false,
      kind: input.kind ?? "store", countsTowardOnlineStock: input.countsTowardOnlineStock ?? true, lowStockThreshold: input.lowStockThreshold ?? null,
    });
    id = Number(inserted[0].insertId);
    if (input.isFulfillmentDefault) await clearOtherFulfillmentDefaults(tx, id);
  });
  const created = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return created[0];
}

export async function updateBranch(input: { id: number } & Partial<BranchWriteInput>) {
  invalidateStorefront("branches");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(branches).where(eq(branches.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Branch not found.");
  const { id, ...changes } = input;
  const next = { ...existing[0], ...changes };
  assertValidFulfillmentBranch(next);
  if (existing[0].isFulfillmentDefault && changes.isFulfillmentDefault === false) {
    throw new Error("Онлайн захиалгын үндсэн салбарыг шууд унтраах боломжгүй — өөр салбарыг үндсэн болгоход энэ нь автоматаар солигдоно.");
  }
  const countingChanged = changes.countsTowardOnlineStock !== undefined && changes.countsTowardOnlineStock !== existing[0].countsTowardOnlineStock;
  await db.transaction(async tx => {
    await tx.update(branches).set({ ...changes, updatedAt: new Date() }).where(eq(branches.id, id));
    if (changes.isFulfillmentDefault) await clearOtherFulfillmentDefaults(tx, id);
  });
  // Whether this shelf counts as online stock changes every cached variant
  // total that includes it -- recompute them, so the storefront reflects it now.
  if (countingChanged) await recomputeVariantTotalsForBranch(db, id);
  const updated = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return updated[0];
}

/**
 * 2026-09-11: refuses to delete a branch that still matters. Deleting one
 * cascade-deleted its branch_stock rows WITHOUT recomputing the variants'
 * cached totals (so the storefront kept selling stock that no longer existed
 * anywhere), and would now also erase its stock history. A branch that has
 * ever held stock is deactivated instead, which keeps both.
 */
export async function deleteBranch(id: number) {
  invalidateStorefront("branches");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [branch] = await db.select({ isFulfillmentDefault: branches.isFulfillmentDefault }).from(branches).where(eq(branches.id, id)).limit(1);
  if (!branch) return { id };
  if (branch.isFulfillmentDefault) throw new Error("Онлайн захиалгын үндсэн салбарыг устгах боломжгүй. Эхлээд өөр салбарыг үндсэн болгоно уу.");
  const [stock] = await db.select({ total: sql<number>`COALESCE(SUM(ABS(${branchStock.stockQuantity})), 0)` }).from(branchStock).where(eq(branchStock.branchId, id));
  const [history] = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.branchId, id)).limit(1);
  if (Number(stock?.total ?? 0) > 0 || history) throw new Error("Энэ салбарт нөөц эсвэл нөөцийн түүх байгаа тул устгах боломжгүй. Оронд нь идэвхгүй болгоно уу.");
  await db.delete(branches).where(eq(branches.id, id));
  return { id };
}

export async function getSiteMedia() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.siteMedia, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ slotKey: siteMedia.slotKey, imageUrl: siteMedia.imageUrl, altText: siteMedia.altText, updatedAt: siteMedia.updatedAt })
      .from(siteMedia)
      .orderBy(asc(siteMedia.slotKey));
  });
}

export async function upsertSiteMedia(input: { slotKey: string; imageUrl: string; altText?: string | null; updatedByUserId: number }) {
  invalidateStorefront("siteMedia");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalizedAltText = input.altText?.trim() || null;
  await db.insert(siteMedia).values({
    slotKey: input.slotKey,
    imageUrl: input.imageUrl,
    altText: normalizedAltText,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { imageUrl: input.imageUrl, altText: normalizedAltText, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(siteMedia).where(eq(siteMedia.slotKey, input.slotKey)).limit(1);
  return updated[0];
}

export async function deleteSiteMedia(slotKey: string) {
  invalidateStorefront("siteMedia");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteMedia).where(eq(siteMedia.slotKey, slotKey));
  return { slotKey };
}

/** Text-equivalent of the 3 functions above -- see drizzle/schema.ts's
 *  siteText table and shared/site-text.ts's slot registry. */
export async function getSiteText() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.siteText, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ slotKey: siteText.slotKey, textValue: siteText.textValue, updatedAt: siteText.updatedAt })
      .from(siteText)
      .orderBy(asc(siteText.slotKey));
  });
}

/**
 * Нэг site_text slot-ийн утга: admin хадгалсан бол түүнийг, үгүй бол кодын
 * `fallbackValue` (`getStoreSettingValue`-тэй яг ижил гэрээ).
 *
 * 2026-09-20: сайтыг ӨӨР эзэнд зарах бэлтгэл. Өмнө нь "SUGI ASAYAKE" гэдэг нэр
 * баримт PDF, бэлгийн картын имэйл, төлбөрийн нэхэмжлэхийн тайлбар, Excel/PDF
 * тайлан, Google Merchant feed зэрэгт ХАТУУ бичигдсэн байсан тул шинэ эзэн
 * /admin-аас нэрээ сольсон ч эдгээр нь хуучин нэрээр гардаг байв. Бүгд одоо
 * үүгээр уншина.
 */
export async function getSiteTextValue(key: SiteTextSlotKey): Promise<string> {
  const fallback = getSiteTextSlot(key).fallbackValue;
  const db = await getDb();
  if (!db) return fallback;
  const row = await db.select({ textValue: siteText.textValue }).from(siteText).where(eq(siteText.slotKey, key)).limit(1);
  return row[0]?.textValue?.trim() || fallback;
}

/** Баримт, имэйл, тайлан дээр гарах дэлгүүрийн нэр (`seo-text-site-name`). */
export async function getSiteName(): Promise<string> {
  return getSiteTextValue("seo-text-site-name");
}

export async function upsertSiteText(input: { slotKey: string; textValue: string; updatedByUserId: number }) {
  invalidateStorefront("siteText");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(siteText).values({
    slotKey: input.slotKey,
    textValue: input.textValue,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { textValue: input.textValue, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(siteText).where(eq(siteText.slotKey, input.slotKey)).limit(1);
  return updated[0];
}

export async function deleteSiteText(slotKey: string) {
  invalidateStorefront("siteText");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteText).where(eq(siteText.slotKey, slotKey));
  return { slotKey };
}

/**
 * The three legal pages (2026-09-12) -- same override-a-fallback contract
 * as siteText above. Returns only the rows an admin has actually saved;
 * the caller merges them over shared/site-documents.ts, so a key that has
 * never been edited simply isn't here.
 */
export async function getSiteDocuments() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.siteDocuments, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        documentKey: siteDocuments.documentKey,
        locale: siteDocuments.locale,
        title: siteDocuments.title,
        lead: siteDocuments.lead,
        contentHtml: siteDocuments.contentHtml,
        updatedLabel: siteDocuments.updatedLabel,
        updatedAt: siteDocuments.updatedAt,
      })
      .from(siteDocuments)
      .orderBy(asc(siteDocuments.documentKey), asc(siteDocuments.locale));
  });
}

export async function upsertSiteDocument(input: {
  documentKey: string;
  locale: string;
  title: string;
  lead: string | null;
  contentHtml: string;
  updatedLabel: string | null;
  updatedByUserId: number;
}) {
  invalidateStorefront("siteDocuments");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // Same trust boundary as posts.content: the admin editor's "Text" tab can
  // paste arbitrary HTML, so it is sanitized server-side on every write
  // rather than trusted at render time.
  const contentHtml = sanitizePostContent(input.contentHtml);
  await db.insert(siteDocuments).values({
    documentKey: input.documentKey,
    locale: input.locale,
    title: input.title,
    lead: input.lead,
    contentHtml,
    updatedLabel: input.updatedLabel,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: {
      title: input.title,
      lead: input.lead,
      contentHtml,
      updatedLabel: input.updatedLabel,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
    },
  });
  const updated = await db.select().from(siteDocuments)
    .where(and(eq(siteDocuments.documentKey, input.documentKey), eq(siteDocuments.locale, input.locale))).limit(1);
  return updated[0];
}

export async function deleteSiteDocument(documentKey: string, locale: string) {
  invalidateStorefront("siteDocuments");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(siteDocuments).where(and(eq(siteDocuments.documentKey, documentKey), eq(siteDocuments.locale, locale)));
  return { documentKey, locale };
}

/**
 * Нээлттэй ажлын байр (/careers, 2026-09-14).
 *
 * Нийтийн хуудас зөвхөн нийтлэгдсэн мөрийг харна; админ бүгдийг (ноорог
 * хамт) хардаг. Дараалал нь sortOrder — ижил байвал шинэ нь дээрээ, учир нь
 * шинээр зарласан ажлын байрыг эхэнд харуулах нь хамгийн энгийн хүлээлт.
 */
export async function getPublishedJobPostings() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.jobPostings, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        employmentType: jobPostings.employmentType,
        location: jobPostings.location,
        salaryRange: jobPostings.salaryRange,
        description: jobPostings.description,
        applyEmail: jobPostings.applyEmail,
        applyUrl: jobPostings.applyUrl,
      })
      .from(jobPostings)
      .where(eq(jobPostings.isPublished, true))
      .orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
  });
}

export async function getAdminJobPostings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobPostings).orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
}

export type JobPostingWriteInput = {
  title: string;
  employmentType: string;
  location: string;
  salaryRange: string;
  description: string | null;
  applyEmail: string | null;
  applyUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
};

export async function createJobPosting(input: JobPostingWriteInput, actorUserId: number) {
  invalidateStorefront("jobPostings");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [result] = await db.insert(jobPostings).values({ ...input, createdByUserId: actorUserId });
  return { id: Number(result.insertId) };
}

export async function updateJobPosting(id: number, input: Partial<JobPostingWriteInput>) {
  invalidateStorefront("jobPostings");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(jobPostings).set({ ...input, updatedAt: new Date() }).where(eq(jobPostings.id, id));
  return { id };
}

export async function deleteJobPosting(id: number) {
  invalidateStorefront("jobPostings");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(jobPostings).where(eq(jobPostings.id, id));
  return { id };
}

/**
 * /careers-аас ирсэн анкетууд (2026-09-14). Storefront кэшгүй — зөвхөн админ
 * уншдаг, нийтийн хуудас хэзээ ч жагсаадаггүй.
 */
export type JobApplicationInput = {
  jobPostingId: number | null;
  positionTitle: string;
  fullName: string;
  phone: string;
  email: string | null;
  message: string | null;
  cvKey: string | null;
  cvFileName: string | null;
  cvSizeBytes: number | null;
  ipAddress: string | null;
};

export async function createJobApplication(input: JobApplicationInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [result] = await db.insert(jobApplications).values(input);
  return { id: Number(result.insertId) };
}

export async function getJobApplication(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(jobApplications).where(eq(jobApplications.id, id)).limit(1);
  return row ?? null;
}

/** Сүүлийн 500 анкет, шинэ нь дээрээ. CV-ийн түлхүүр нь клиентэд ил гардаг ч /cdn-аар зурагдахгүй (гарын үсэгтэй URL л нээнэ). */
export async function getAdminJobApplications() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobApplications).orderBy(desc(jobApplications.createdAt)).limit(500);
}

export async function updateJobApplication(id: number, patch: { status?: "new" | "reviewed" | "contacted" | "rejected"; adminNote?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(jobApplications).set({ ...patch, updatedAt: new Date() }).where(eq(jobApplications.id, id));
  return { id };
}

export async function deleteJobApplication(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getJobApplication(id);
  await db.delete(jobApplications).where(eq(jobApplications.id, id));
  return { id, cvKey: existing?.cvKey ?? null };
}

/**
 * The loyalty ladder (2026-09-12). Reads the `loyalty_tiers` table, and
 * falls back to shared/loyalty.ts's constant when the table is empty or
 * the DB is unreachable.
 *
 * That fallback is not defensive decoration: this list PRICES ORDERS
 * (getApplicableLoyaltyDiscount below), so "no rows" must mean "today's
 * known-good ladder", never "everyone's discount silently becomes 0%".
 * Sorted by minSpendMnt because getLoyaltyTier walks the list in ascending
 * order and takes the last tier the shopper qualifies for.
 */
export async function getLoyaltyTierTable(): Promise<LoyaltyTier[]> {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.loyaltyTiers, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return LOYALTY_TIERS;
    const rows = await db
      .select({ name: loyaltyTiers.name, discountPercent: loyaltyTiers.discountPercent, minSpendMnt: loyaltyTiers.minSpendMnt })
      .from(loyaltyTiers)
      .orderBy(asc(loyaltyTiers.minSpendMnt), asc(loyaltyTiers.sortOrder));
    return rows.length ? rows : LOYALTY_TIERS;
  });
}

export async function getAdminLoyaltyTiers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(loyaltyTiers).orderBy(asc(loyaltyTiers.minSpendMnt), asc(loyaltyTiers.sortOrder));
}

export async function upsertLoyaltyTier(input: {
  id?: number;
  name: string;
  discountPercent: number;
  minSpendMnt: number;
  sortOrder: number;
  updatedByUserId: number;
}) {
  invalidateStorefront("loyaltyTiers");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (input.id) {
    await db.update(loyaltyTiers).set({
      name: input.name,
      discountPercent: input.discountPercent,
      minSpendMnt: input.minSpendMnt,
      sortOrder: input.sortOrder,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
    }).where(eq(loyaltyTiers.id, input.id));
    const updated = await db.select().from(loyaltyTiers).where(eq(loyaltyTiers.id, input.id)).limit(1);
    return updated[0];
  }
  const inserted = await db.insert(loyaltyTiers).values({
    name: input.name,
    discountPercent: input.discountPercent,
    minSpendMnt: input.minSpendMnt,
    sortOrder: input.sortOrder,
    updatedByUserId: input.updatedByUserId,
  });
  const created = await db.select().from(loyaltyTiers).where(eq(loyaltyTiers.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

/**
 * Refuses to delete the last remaining tier: an empty table falls back to
 * the code constant (see getLoyaltyTierTable), so "delete them all" would
 * look like it worked in the admin list and then silently restore the four
 * original tiers on the storefront -- the most confusing possible outcome.
 */
export async function deleteLoyaltyTier(id: number) {
  invalidateStorefront("loyaltyTiers");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const remaining = await db.select({ id: loyaltyTiers.id }).from(loyaltyTiers);
  if (remaining.length <= 1) throw new Error("Хамгийн багадаа нэг зэрэглэл үлдэх ёстой.");
  await db.delete(loyaltyTiers).where(eq(loyaltyTiers.id, id));
  return { id };
}
