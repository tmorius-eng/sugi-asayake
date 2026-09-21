// server/db/catalog.ts — Storefront каталог: жагсаалт, хайлт, санал болголт, холбоотой бараа, slug/sku.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { sqlInt } from "../_core/sqlSafe";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { featuredBrands, orderItems, orders, productCategories, productReviews, products, users, wishlistItems } from "../../drizzle/schema";
import { looksLikeBarcode, normaliseBarcode } from "../../shared/barcode";
import { expandQueryGroups, normaliseSearchText } from "../../shared/search-synonyms";
import { getStoreSettingSlot, type StoreSettingKey } from "../../shared/store-settings";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { CATALOG_INDEX_CACHE_KEY } from "../search/cacheKeys";
import { applyDiversityCap, computeCategoryAffinity, DEFAULT_RECO_WEIGHTS, explainPreferenceMatch, filterCatalogBrand, filterCatalogPriceRange, filterCatalogProducts, filterCatalogSkinType, filterCatalogStock, getCatalogCategories, getCatalogSkinTypes, isEligibleForPreferenceRecommendation, scorePreferenceMatch, scorePriceBandAffinity, sortCatalogProducts, type CatalogSortOption, type PreferenceProfile, type RecoWeights, type SkinType } from "../../shared/catalog-filter";
import { getDb, settledSaleSql } from "./connection";
import { STOREFRONT_CACHE_TTL_MS } from "./site";
import { getStoreSettings } from "./ops";

// PREMIUM-FEATURES.md TIER 2: average rating + review count, shared by the
// catalog list, a single product page, and the admin product list. A LEFT
// JOIN + GROUP BY (rather than a per-row correlated subquery) so this stays
// cheap across the full ~900-product catalog. Only isApproved reviews count
// toward the public-facing average — a hidden review shouldn't move the
// star rating shoppers see.
// mysql2 returns AVG() results as a decimal *string* (e.g. "4.0000"), not a
// number, to avoid float precision loss — .mapWith coerces it back to a
// real number (or keeps null when there are no reviews yet) so callers on
// both the server and client can do plain arithmetic/toFixed on it.
const avgRatingExpr = sql<number | null>`AVG(CASE WHEN ${productReviews.isApproved} = 1 THEN ${productReviews.rating} END)`.mapWith(value => value === null ? null : Number(value));
const reviewCountExpr = sql<number>`COUNT(CASE WHEN ${productReviews.isApproved} = 1 THEN 1 END)`;

// Shared column shape for the two catalog readers below (getPublishedCatalog
// and getPublishedProductsByIds) so the row shape can't drift between them.
const catalogRowColumns = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  brand: products.brand,
  shortDescription: products.shortDescription,
  priceMnt: products.priceMnt,
  compareAtPriceMnt: products.compareAtPriceMnt,
  imageUrl: products.imageUrl,
  stockQuantity: products.stockQuantity,
  categoryName: productCategories.name,
  categorySlug: productCategories.slug,
  skinType: products.skinType,
  skinConcerns: products.skinConcerns,
  interiorStyle: products.interiorStyle,
  // Хайлт v3 + монгол нэр (2026-09-20): индекс sku/searchKeywords-ийг, карт
  // nameMn-ийг, санал болголт productType-ийг уншина — нэг мөрийн хэлбэр.
  sku: products.sku,
  nameMn: products.nameMn,
  productType: products.productType,
  searchKeywords: products.searchKeywords,
  avgRating: avgRatingExpr,
  reviewCount: reviewCountExpr,
};

export async function getPublishedCatalog() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select(catalogRowColumns)
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(eq(products.isPublished, true))
    .groupBy(products.id, productCategories.id)
    // `products.id`-ийн эцсийн тэнцвэр ЗААВАЛ хэрэгтэй (2026-09-16, E2E-ийн
    // хуудаслалтын тест тогтворгүй болсноор илэрсэн): 937 бараа нь нэг импортоор
    // орсон тул олон мөр яг ижил `createdAt`-тай. Ижил түлхүүртэй мөрүүдийн
    // дарааллыг MySQL баталгаажуулдаггүй — гүйцэтгэл бүрт өөр байж болно.
    // /shop нь энэ жагсаалтыг хуудаслах тул тогтворгүй дараалал гэдэг нь
    // худалдан авагч 2-р хуудсанд 1-р хуудсанд харсан бараагаа дахин харах,
    // эсвэл нэг барааг ОГТ харахгүй өнгөрөх боломж юм.
    .orderBy(asc(productCategories.sortOrder), desc(products.createdAt), asc(products.id));
}

// 2026-09-04 cohesion audit: the "800+" product-count claim on the homepage
// was hardcoded independently in 3 separate places (hero badge, category
// section description, "why choose us" card) with only a code comment (not
// a real mechanism) keeping them in sync -- one of them wasn't even
// admin-editable, so all 3 could silently drift from the real catalog size
// and from each other. A plain COUNT(*) rather than getPublishedCatalog()
// (which selects every column, joins reviews, and groups by product for the
// full catalog) since the homepage only ever needs the number.
export async function getPublishedProductCount(): Promise<number> {
  // 2026-09-14: cached like the other storefront reads (see STOREFRONT_CACHE_TTL_MS).
  return getOrSetCached("storefront:publishedCount", STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return 0;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.isPublished, true));
    return count;
  });
}

export type CatalogPageParams = {
  search?: string;
  category?: string;
  brand?: string;
  skinType?: SkinType | "all";
  // NEWVISION.md §14 (Phase 2): Isetan-style deep faceted filter, either
  // bound optional -- a shopper setting only a floor or only a ceiling
  // shouldn't have to also guess the other. See filterCatalogPriceRange.
  minPriceMnt?: number;
  maxPriceMnt?: number;
  inStockOnly?: boolean;
  sort?: CatalogSortOption;
  page?: number;
  pageSize?: number;
};

// Short in-memory memoization of getPublishedCatalog(), used ONLY by
// getPublishedCatalogPage below -- NOT applied to getPublishedCatalog()
// itself, so every other caller (admin writes, commerce.database.
// integration.test.ts's immediate-read-after-write check) keeps seeing
// fully fresh data with zero behavior change.
//
// Why this exists: getPublishedCatalogPage now runs once per /shop filter/
// page/sort change (previously the browser fetched the full catalog once
// per VISIT and did all filtering/pagination client-side) -- each of those
// still needs the full catalog to filter/sort/paginate against server-side.
// Aiven has documented, real network-latency spikes (docs/PROJECT-GUIDE.md; vitest's
// integration-test timeout was raised from 5s to 30s specifically because
// of this), so re-querying it on every click would trade "one large
// payload over a slow client connection" for "one Aiven round trip per
// click" -- a real regression on this specific database, not a
// hypothetical one. This is deliberately NOT a general caching layer or
// Redis (this project isn't building one at current near-zero traffic --
// see ROADMAP.md); it's a short-lived memoization of one already-cheap
// query, local to this one function. A product/category edit becomes
// visible on /shop within CATALOG_PAGE_CACHE_TTL_MS instead of instantly --
// an acceptable trade at this traffic level.
const CATALOG_PAGE_CACHE_TTL_MS = 10_000;

/**
 * Ачааллын бэлтгэл (2026-09-16): өөрийн гэсэн `let`-ээс нийтийн ttlCache руу
 * шилжив. Хоёр шалтгаан, хоёулаа ачааллын:
 *  1. **Thundering herd.** Хуучин хувилбарт 10 секунд дуусах агшинд ирсэн бүх
 *     зэрэгцээ хүсэлт бүгд бүтэн каталогийн query-г зэрэг эхлүүлдэг байв —
 *     энэ нь /shop-ийн хамгийн хүнд query. ttlCache одоо нэг түлхүүрт нэг л
 *     тооцоолол явуулж, бусдыг нь түүнд нэгтгэнэ.
 *  2. **Admin-ий засвар шууд харагдана.** Бүтээгдэхүүн бичигч бүр энэ түлхүүрийг
 *     `invalidateCached`-ээр унагаадаг болсон тул "10 секунд хүлээх" шинж
 *     (дээрх тайлбарын хүлээн зөвшөөрсөн буулт) бодитоор арилав; TTL нь зөвхөн
 *     нөгөө лаптоп/скрипт шууд DB-д бичсэн тохиолдлын хамгаалалт болж үлдэнэ.
 */
const CATALOG_SOURCE_CACHE_KEY = "storefront:catalogSource";

export async function getPublishedCatalogCached() {
  return getOrSetCached(CATALOG_SOURCE_CACHE_KEY, CATALOG_PAGE_CACHE_TTL_MS, () => getPublishedCatalog());
}

/**
 * Хайлт v3 (2026-09-20): хайлтын индекс (server/search/catalogSearch.ts)
 * энэ каталогийн кэшээс баригддаг тул каталог өөрчлөгдөх бүрт индекс ч
 * унах ЁСТОЙ — хоёуланг нэг дуудлагаар. Бараа, ангилал бичигч бүр үүнийг дуудна.
 */
export function invalidateCatalogSource(): void {
  invalidateCached(CATALOG_SOURCE_CACHE_KEY);
  invalidateCached(CATALOG_INDEX_CACHE_KEY);
}

/**
 * Frontend performance audit (2026-09-02): /shop used to call the no-arg
 * getPublishedCatalog() unconditionally and do ALL filtering, sorting, and
 * pagination in the BROWSER over the full ~937-row payload -- shipping
 * every product's full metadata (including tag columns nothing on /shop
 * renders) across the actual public network hop on every visit, regardless
 * of what page/filter the shopper wanted. Mongolia's median mobile
 * connection (17 Mbps, 92ms latency -- well below the 33.9 Mbps global
 * median) makes that payload weight a real cost, not a cosmetic one.
 *
 * Fix: keep the full-catalog fetch (cheap, and short-TTL-cached -- see
 * getPublishedCatalogCached above), but filter/sort/paginate HERE, reusing
 * the exact same shared/catalog-filter.ts functions Shop.tsx used to run
 * client-side -- single source of truth, zero behavior drift -- and ship
 * only the requested page's rows across the slow hop. Facets (categories/
 * skinTypes) are computed from the FULL catalog, unfiltered by the
 * shopper's other active selections, matching Shop.tsx's original
 * behavior: the filter pills always list every possible value, not just
 * ones matching whatever else is currently selected.
 */
export async function getPublishedCatalogPage(params: CatalogPageParams) {
  const fullCatalog = await getPublishedCatalogCached();

  const categories = getCatalogCategories(fullCatalog);
  const skinTypes = getCatalogSkinTypes(fullCatalog);

  const matching = sortCatalogProducts(
    filterCatalogStock(
      filterCatalogPriceRange(
        filterCatalogSkinType(
          filterCatalogBrand(
            filterCatalogProducts(fullCatalog, params.search ?? "", params.category ?? "all"),
            params.brand ?? "all",
          ),
          params.skinType ?? "all",
        ),
        params.minPriceMnt,
        params.maxPriceMnt,
      ),
      params.inStockOnly ?? false,
    ),
    params.sort ?? "featured",
  );

  const pageSize = params.pageSize ?? 24;
  const page = Math.max(1, params.page ?? 1);
  const items = matching.slice((page - 1) * pageSize, page * pageSize);

  return { items, totalCount: matching.length, totalPublishedCount: fullCatalog.length, categories, skinTypes };
}

/**
 * Resolves specific product ids against the published catalog -- backs
 * Shop.tsx's "Таны сүүлд үзсэн" (recently viewed) rail, which needs to look
 * up a handful of arbitrary product ids (read from localStorage) regardless
 * of the shopper's current category/skinType/page selection, now that
 * catalog.list no longer ships the full catalog for the client to resolve
 * IDs against locally. Bounded by the caller's own cap (see
 * shared/recently-viewed.ts's rememberRecentlyViewed, limit 6), so this can
 * never become an unbounded fetch itself.
 */
export async function getPublishedProductsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || !ids.length) return [];

  return db
    .select(catalogRowColumns)
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.isPublished, true), inArray(products.id, ids)))
    .groupBy(products.id, productCategories.id);
}

/**
 * "Хамт авдаг" — NEWVISION.md §14-ийн cross-sell (2026-09-16).
 *
 * Энэ нь PDP дээрх өмнөх хоёр зөвлөмжөөс ЯЛГААТАЙ: `getRelatedProducts` нь
 * шинж чанараар (ангилал, арьсны төрөл …) "үүнтэй төстэй" барааг олдог,
 * `RoutineCrossSell` нь admin-ий гараар зассан routine-ийг харуулдаг. Энд бол
 * бодит захиалгын түүх: тухайн барааг авсан хүмүүс ижил захиалгад өөр юу авсан
 * бэ. Гараар засах зүйл байхгүй, худал өгөгдөл байхгүй.
 *
 * Зөвхөн ТӨЛӨГДСӨН, цуцлагдаагүй захиалгыг тоолно (`settledSaleSql` — bestseller
 * rail-тай ижил "бодитоор болсон" шалгуур). Түүх хангалтгүй бол хоосон буцаана
 * — дуудагч тал хэсгийг бүхэлд нь нуух ёстой (энэ төслийн "хоосон хэсгийг
 * зохиомол өгөгдлөөр дүүргэхгүй" дүрэм).
 *
 * Хоёр query: нэгд хамтын тоо, хоёрт каталогийн мөрүүд — order_items ба
 * product_reviews-ийг нэг query-д хамт join хийвэл тоо олшрох урхи
 * (getBestsellingProducts-ийн ижил тайлбарыг үз).
 */
export async function getFrequentlyBoughtTogether(productId: number, limit = 4) {
  return getOrSetCached(`storefront:boughtTogether:${productId}:${limit}`, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];

    const partner = alias(orderItems, "partner");
    const togetherExpr = sql<number>`COUNT(DISTINCT ${orders.id})`;
    const rows = await db
      .select({ productId: partner.productId, together: togetherExpr })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(partner, eq(partner.orderId, orders.id))
      .where(and(eq(orderItems.productId, sqlInt(productId)), ne(partner.productId, sqlInt(productId)), settledSaleSql))
      .groupBy(partner.productId)
      .orderBy(desc(togetherExpr), asc(partner.productId))
      .limit(limit * 3); // нөөц: заримыг нь нийтлэлээс хассан байж болно

    const ids = rows.map(row => row.productId).filter((id): id is number => id != null);
    if (!ids.length) return [];
    const togetherById = new Map(rows.map(row => [row.productId, Number(row.together)]));
    const published = await getPublishedProductsByIds(ids);
    return published
      .sort((a, b) => (togetherById.get(b.id) ?? 0) - (togetherById.get(a.id) ?? 0) || a.id - b.id)
      .slice(0, limit);
  });
}

/**
 * Homepage "Их зарагддаг бараа" rail (inspired by matsukiyococokara-online.com's
 * 売れ筋ランキング section, 2026-08-26) — real order history, not a manually
 * curated list. Only counts order_items belonging to a paid order (same
 * "actually happened" bar as loyalty spend in getUserLoyaltyStatus) so a
 * cancelled or still-unpaid cash-on-delivery order can't inflate a product's
 * rank.
 *
 * Two plain queries instead of one big join: order_items already fans out
 * 1:many against product_reviews once both are joined onto products in a
 * single query (the same trap getPublishedCatalog avoids), which would
 * double- or triple-count sold quantity. Summing sold quantity in its own
 * query first, then fetching the winning products' catalog rows separately,
 * sidesteps that without a SQL subquery.
 */
export async function getBestsellingProducts(limit = 8) {
  // 2026-09-14: cached like the other storefront reads (see STOREFRONT_CACHE_TTL_MS).
  return getOrSetCached(`storefront:bestsellers:${limit}`, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];

    const soldQtyExpr = sql<number>`SUM(${orderItems.quantity})`;
    const soldRows = await db
      .select({ productId: orderItems.productId, soldQuantity: soldQtyExpr })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(settledSaleSql)
      .groupBy(orderItems.productId)
      .orderBy(desc(soldQtyExpr))
      .limit(limit * 3); // headroom: some winners may since have gone unpublished

    const productIds = soldRows.map(row => row.productId).filter((id): id is number => id != null);
    const soldQuantityByProduct = new Map(soldRows.map(row => [row.productId, Number(row.soldQuantity)]));

    const catalogColumns = {
      id: products.id,
      name: products.name,
      nameMn: products.nameMn,
      slug: products.slug,
      brand: products.brand,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    };

    const catalogRows = productIds.length
      ? await db
          .select(catalogColumns)
          .from(products)
          .leftJoin(productReviews, eq(productReviews.productId, products.id))
          .where(and(inArray(products.id, productIds), eq(products.isPublished, true)))
          .groupBy(products.id)
      : [];

    const picked = catalogRows
      .map(row => ({ ...row, soldQuantity: soldQuantityByProduct.get(row.id) ?? 0 }))
      .sort((a, b) => b.soldQuantity - a.soldQuantity)
      .slice(0, limit);

    if (picked.length >= limit) return picked;

    /*
     * 2026-09-11 (Tom): with 3 settled orders in the whole catalogue this rail
     * rendered a single card in a full-width band -- a real empty-state defect,
     * not a data problem that fixes itself. Same remedy, and the same ordering
     * contract the removed category shelves used: genuinely sold products keep
     * the top slots and their real sold counts, then the remaining slots fill
     * from the brands an admin has already marked featured (/admin -> Брэнд,
     * the `featured_brands` table that also backs the Топ брэнд rail), in that
     * panel's own sortOrder. Nothing here writes or invents an order, so the
     * moment real sales exist they displace the filler automatically and the
     * section becomes a true ranking again.
     *
     * Round-robin across brands rather than brand-by-brand: PRIECLAT alone has
     * 21 published products and would otherwise take every free slot, hiding
     * the other featured brands the admin chose.
     */
    const excludeIds = picked.map(row => row.id);
    const notAlreadyPicked = excludeIds.length
      ? sql`${products.id} NOT IN (${sql.join(excludeIds, sql`, `)})`
      : sql`1=1`;

    const featuredRows = await db
      .select({ ...catalogColumns, brandSort: featuredBrands.sortOrder, brandId: featuredBrands.id })
      .from(products)
      .innerJoin(featuredBrands, eq(featuredBrands.brandName, products.brand))
      .leftJoin(productReviews, eq(productReviews.productId, products.id))
      .where(and(
        eq(featuredBrands.isActive, true),
        eq(products.isPublished, true),
        gte(products.stockQuantity, 1),
        isNotNull(products.imageUrl),
        ne(products.imageUrl, ""),
        notAlreadyPicked,
      ))
      .groupBy(products.id, featuredBrands.id)
      // products.id is the final tiebreak on purpose: createdAt ties are common
      // here (bulk imports share a timestamp), and without a stable last key
      // MySQL may order tied rows differently per query. The cold-start
      // recommender asks for a deeper page of this same list and takes the
      // tail, so an unstable prefix would leak one product into both homepage
      // rails.
      .orderBy(asc(featuredBrands.sortOrder), asc(featuredBrands.id), desc(products.createdAt), desc(products.id))
      // Fixed cap, NOT a multiple of `limit`: rows come back in brand order, so
      // a limit-scaled cap truncated later brands out of a small request while
      // including them in a large one -- which changed how many queues the
      // round-robin interleaved and produced exactly that leak. 400 covers
      // every product behind the featured brands today (~180).
      .limit(400);

    const byBrand = new Map<number, typeof featuredRows>();
    for (const row of featuredRows) {
      const bucket = byBrand.get(row.brandId);
      if (bucket) bucket.push(row); else byBrand.set(row.brandId, [row]);
    }
    const queues = Array.from(byBrand.values());
    let cursor = 0;
    while (picked.length < limit && queues.some(queue => queue.length)) {
      const queue = queues[cursor % queues.length];
      cursor += 1;
      const next = queue.shift();
      if (!next) continue;
      const { brandSort: _brandSort, brandId: _brandId, ...row } = next;
      picked.push({ ...row, soldQuantity: 0 });
    }

    return picked.slice(0, limit);
  });
}

/* 2026-09-11: getCategoryShelfProducts + getHomeCategoryShelves removed here.
 * They backed catalog.categoryShelves, the six homepage category rails that the
 * 2026-09-06 consolidation cut. The procedure stayed public and unauthenticated
 * long after its last caller went away, running 1 + 6 + 6 queries per request
 * against a 10-connection pool. getBestsellingProducts above keeps the one part
 * worth keeping -- rank by real sales, then fill the remaining slots. */

/**
 * ROADMAP.md TIER 2: server-side catalog search, replacing a client-side
 * substring filter over the entire ~937-row published catalog. Uses the
 * `products_search_idx` FULLTEXT index (drizzle/0027_catalog_fulltext_search.sql)
 * over (name, brand, shortDescription) in BOOLEAN MODE with a trailing `*`
 * wildcard on every term, so "крем нью" behaves like a prefix search per
 * word ("find rows where some indexed word starts with крем AND some
 * indexed word starts with нью") — the closest FULLTEXT equivalent to the
 * old client-side "substring anywhere" behavior, though not identical:
 * MySQL's default InnoDB FULLTEXT parser only indexes whole words of at
 * least 3 characters (innodb_ft_min_token_size), so a query like "ню" alone
 * won't match a 4-letter word by prefix the way the old JS .includes() did
 * for genuinely tiny fragments — real product/brand names are essentially
 * always long enough for this not to matter in practice.
 */
/** Хуучин MySQL FULLTEXT зам — зөвхөн SEARCH_ENGINE=fulltext буцаалтад (server/search/catalogSearch.ts). */
export async function searchPublishedCatalogFulltext(query: string) {
  const db = await getDb();
  if (!db) return [];

  // Strip MySQL boolean-mode operator characters so user input can't change
  // the query's structure (e.g. a leading "-" would exclude instead of
  // require a term) — a search relevance concern, not a SQL-injection one
  // (drizzle still parameterizes the whole string).
  const sanitise = (term: string) => term.replace(/[+\-<>()~*"@]/g, "");

  /**
   * 2026-09-12, Tom: "хүмүүс морины тос, морины шампуунь гэж бичнэ",
   * "заавал кириллээр бичихгүй, латинаар бичих ч хүн байгаа".
   *
   * Shoppers search in Mongolian (or romanised Mongolian) against a
   * catalogue whose 937 product names are 100% Latin, and whose Mongolian
   * text is one formulaic sentence per product — carrying no useful word at
   * all for 220 of them. Each word of the query is expanded through the
   * bilingual dictionary in shared/search-synonyms.ts, which is what lets
   * "морины тос" reach the English "horse"/"oil" printed in the name.
   *
   * The expansion comes back as one GROUP PER CONCEPT rather than a flat
   * list, because the two are searched very differently below.
   */
  const groups = expandQueryGroups(query)
    .map(group => group.map(sanitise).filter(Boolean))
    .filter(group => group.length);
  const words = Array.from(new Set(groups.flat()));
  if (!words.length) return [];

  /**
   * MySQL's FULLTEXT index holds no word shorter than
   * innodb_ft_min_token_size (3 on this server, verified). Under the
   * previous query every term was `+required`, so one short word matched
   * nothing and zeroed the ENTIRE search: "шүдний оо" returned 0 while 12
   * products were literally described as "шүдний оо", and "гарын тос"
   * returned 0 while "тос" alone returned 70.
   */
  const MIN_FULLTEXT_TOKEN = 3;
  const isCyrillic = (word: string) => /[а-яөүё]/i.test(word);
  const isSingleWord = (word: string) => !word.includes(" ");
  const ownWords = new Set(normaliseSearchText(query).split(" ").map(sanitise).filter(Boolean));

  /**
   * Prefix matching is what lets a half-typed word still find things, but
   * applied to the dictionary's own Cyrillic entries it does more harm than
   * good: a prefix search on "маск" also matches "маскара", so "нүүрний
   * маск" came back led by mascara instead of face masks. The dictionary
   * already enumerates the Mongolian inflections worth matching, so those
   * are matched exactly. The shopper's OWN words always keep the wildcard,
   * and so does English — product names carry base forms, and "sheet"
   * legitimately needs to reach "sheets".
   */
  const asTerm = (word: string) => (isCyrillic(word) && !ownWords.has(word) ? word : `${word}*`);

  /**
   * Multi-word dictionary entries ("шүдний оо", "нүх сүв") stay OUT of the
   * boolean expression. Unquoted, boolean mode reads them as independent
   * tokens, so the group matched every toothBRUSH on "шүдний" alone.
   * Quoted, InnoDB nullifies the whole parenthesised group — measured
   * directly: the group without the phrase returns 4 rows, the same group
   * with the quoted phrase added returns 0. Nesting a phrase inside a group
   * is simply not supported. Nothing is lost: a description reading
   * "нүүрний маск" still matches the single token "маск", and the phrases
   * are matched as plain substrings separately below.
   */
  const searchable = (group: string[]) =>
    group.filter(word => isSingleWord(word) && word.length >= MIN_FULLTEXT_TOKEN);

  /**
   * STRICT: one word from EVERY concept the shopper typed, via boolean
   * mode's group syntax. "гарын тос" requires a hand-word AND an
   * oil/cream-word, so a hand cream matches and an oil-blotting PAPER does
   * not. Searched as a flat OR instead, that blotting paper came back
   * first — a widened search that felt worse than the broken one.
   */
  const strictGroups = groups.map(searchable).filter(group => group.length);
  /**
   * The shopper's OWN words, used purely for ranking (see orderExpr below).
   *
   * They cannot simply be appended to the boolean query as optional terms:
   * MySQL's manual says an unprefixed word only affects relevance, but
   * InnoDB measurably widens the match set instead — the same query grew
   * from 11 rows to 69, and from 3 to 46, once the typed words were added
   * that way. So the requirement stays in WHERE and the preference goes
   * into ORDER BY, where it can only reorder what already matched.
   */
  const boostWords = Array.from(ownWords).filter(word => word.length >= MIN_FULLTEXT_TOKEN);
  const boostExpr = boostWords.length
    ? sql`MATCH(${products.name}, ${products.brand}, ${products.shortDescription}) AGAINST(${boostWords.map(word => `${word}*`).join(" ")} IN BOOLEAN MODE)`
    : sql`0`;

  const strictQuery = strictGroups.map(group => `+(${group.map(asTerm).join(" ")})`).join(" ");
  const strictExpr = strictGroups.length
    ? sql`MATCH(${products.name}, ${products.brand}, ${products.shortDescription}) AGAINST(${strictQuery} IN BOOLEAN MODE)`
    : sql`FALSE`;

  /** BROAD: any word from any concept. Used only when STRICT finds nothing. */
  const broadWords = words.filter(word => isSingleWord(word) && word.length >= MIN_FULLTEXT_TOKEN);
  const broadQuery = broadWords.map(asTerm).join(" ");
  const broadExpr = broadWords.length
    ? sql`MATCH(${products.name}, ${products.brand}, ${products.shortDescription}) AGAINST(${broadQuery} IN BOOLEAN MODE)`
    : sql`FALSE`;

  /**
   * Substring passes for what FULLTEXT structurally cannot answer: the
   * multi-word phrases excluded above, and a query made entirely of words
   * too short to index at all ("оо", "үс"). Both stay a handful of LIKEs
   * over 937 rows. The short-word pass is gated on there being no indexable
   * word anywhere, because as a general OR it was far too loose — a
   * substring search for "оо" also matched "хоол" and "тоос".
   */
  const phrases = Array.from(new Set(groups.flat().filter(word => !isSingleWord(word))));
  const shortOwnWords = Array.from(ownWords).filter(word => word.length === 2);
  const substrings = [...phrases, ...(broadWords.length ? [] : shortOwnWords)];
  const likeExpr = substrings.length
    ? or(...substrings.map(value => sql`${products.shortDescription} LIKE ${`%${value}%`}`))
    : null;

  // 2026-09-11: a barcode typed (or scanned) into the search box used to
  // return nothing at all -- the FULLTEXT index covers name/brand/
  // shortDescription, and no product's prose contains its own SKU. Rather
  // than widen the index (a migration, and 13-digit tokens would bloat it
  // for no relevance benefit), match the barcode against the already
  // UNIQUE `sku` column. Only attempted when the query actually looks like
  // a code, so a normal phrase still costs exactly one FULLTEXT scan.
  const scannedCode = looksLikeBarcode(query) ? normaliseBarcode(query) : null;

  const rowsFor = (rankExpr: SQL<unknown>) => db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      categoryName: productCategories.name,
      categorySlug: productCategories.slug,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      sku: products.sku,
      nameMn: products.nameMn,
      productType: products.productType,
      searchKeywords: products.searchKeywords,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.isPublished, true), or(
      rankExpr,
      ...(likeExpr ? [likeExpr] : []),
      ...(scannedCode ? [eq(products.sku, scannedCode)] : []),
    )!))
    .groupBy(products.id, productCategories.id)
    .orderBy(desc(sql`${rankExpr} + (${boostExpr} * 3)`))
    .limit(200);

  // Strict first. Only when requiring every concept finds nothing at all do
  // we widen — an empty shelf is the one outcome worse than a loose one.
  const strictRows = await rowsFor(strictExpr);
  if (strictRows.length) return strictRows;
  return rowsFor(broadExpr);
}

// Preference Profile v2 (2026-09-01): "recommended for you" v2. A real read
// of the live catalog found only 4/937 products carry any personalization
// tag, so a pure tag-intersection recommender (the v1 version this
// replaced) would render near-empty for almost everyone. This version:
// (1) scores preference-tag matches via shared/catalog-filter.ts's
//     scorePreferenceMatch (pure, unit-tested there) — the permanent
//     backbone, matching industry practice for a catalog this size;
// (2) adds free behavioral signals that need zero manual tagging — category
//     affinity from the shopper's own paid order history, price-band
//     affinity, wishlist-adjacency;
// (3) applies a diversity cap so one generically-named brand can't fill the
//     whole list;
// (4) backfills with bestsellers whenever the scored result is thin —
//     including the true cold-start case (guest, or a shopper with no
//     preferences/history yet) — so the section never renders empty.
// Public-facing (routers.ts's catalog.recommended is now a publicProcedure):
// userId is null for a guest, who still gets a bestseller-backed list.
/**
 * `personalOnly` (2026-09-12, Tom: "zaawal login hiij profile aa iinhaa
 * reference hiisen hun deer garga") -- with it set, a shopper who has no
 * preferences and no history gets an EMPTY list instead of the
 * bestseller-backed fallback, so a rail headed "Танд санал болгож байна"
 * can hide itself rather than show strangers' bestsellers under a heading
 * addressed to that person. /shop's own rail keeps the fallback: there the
 * rail is a discovery aid, and empty would be worse than generic.
 */
/**
 * Санал болголтын жин (2026-09-20) — store settings "Санал болголт" бүлэг.
 * Кэшлэсэн getStoreSettings()-оос нэг удаад; буруу/хоосон утга анхдагч руу.
 */
export async function getRecoWeights(): Promise<RecoWeights> {
  const rows = await getStoreSettings();
  const byKey = new Map(rows.map(row => [row.settingKey, row.settingValue]));
  const read = (key: StoreSettingKey, fallback: number) => {
    const value = Number(byKey.get(key) ?? getStoreSettingSlot(key).fallbackValue);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    skinType: read("reco-weight-skin-type", DEFAULT_RECO_WEIGHTS.skinType),
    hairType: read("reco-weight-hair-type", DEFAULT_RECO_WEIGHTS.hairType),
    bodyType: read("reco-weight-body-type", DEFAULT_RECO_WEIGHTS.bodyType),
    concern: read("reco-weight-concern", DEFAULT_RECO_WEIGHTS.concern),
    allMatch: read("reco-weight-all-match", DEFAULT_RECO_WEIGHTS.allMatch),
    maxPerBrand: Math.max(1, read("reco-max-per-brand", DEFAULT_RECO_WEIGHTS.maxPerBrand)),
    maxPerCategory: Math.max(1, read("reco-max-per-category", DEFAULT_RECO_WEIGHTS.maxPerCategory)),
    maxPerProductType: Math.max(1, read("reco-max-per-product-type", DEFAULT_RECO_WEIGHTS.maxPerProductType)),
  };
}

export async function getRecommendedProducts(userId: number | null, limit = 8, personalOnly = false) {
  const db = await getDb();
  if (!db) return [];

  const bestsellers = () => getBestsellingProducts(limit);

  let preferences: PreferenceProfile = {};
  let categoryAffinity = new Map<number, number>();
  let avgHistoricalUnitPriceMnt: number | null = null;
  let wishlistCategoryIds = new Set<number>();

  if (userId != null) {
    const userRows = await db.select({
      skinType: users.skinType,
      skinConcerns: users.skinConcerns,
      hairType: users.hairType,
      hairConcerns: users.hairConcerns,
      fragrancePreference: users.fragrancePreference,
      wellnessInterests: users.wellnessInterests,
      interiorStyle: users.interiorStyle,
      hasYoungChildren: users.hasYoungChildren,
      bodySkinType: users.bodySkinType,
      bodyConcerns: users.bodyConcerns,
    }).from(users).where(eq(users.id, userId)).limit(1);
    preferences = userRows[0] ?? {};

    const paidOrderItemRows = await db.select({ categoryId: products.categoryId, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orders.userId, userId), settledSaleSql));
    categoryAffinity = computeCategoryAffinity(paidOrderItemRows.map(row => ({ categoryId: row.categoryId, quantity: row.quantity })));
    if (paidOrderItemRows.length) {
      avgHistoricalUnitPriceMnt = paidOrderItemRows.reduce((sum, row) => sum + row.unitPriceMnt, 0) / paidOrderItemRows.length;
    }

    const wishlistRows = await db.select({ categoryId: products.categoryId })
      .from(wishlistItems)
      .innerJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(wishlistItems.userId, userId));
    wishlistCategoryIds = new Set(wishlistRows.map(row => row.categoryId).filter((id): id is number => id != null));
  }

  const hasAnyPreference = Boolean(preferences.skinType || preferences.skinConcerns || preferences.hairType || preferences.hairConcerns || preferences.fragrancePreference || preferences.wellnessInterests || preferences.interiorStyle || preferences.hasYoungChildren || preferences.bodySkinType || preferences.bodyConcerns);
  const hasAnyHistory = categoryAffinity.size > 0 || wishlistCategoryIds.size > 0;
  if (!hasAnyPreference && !hasAnyHistory) {
    if (personalOnly) return [];
    // Cold start: a guest, or a shopper who has stated nothing and bought
    // nothing. Bestsellers are the right answer WHEN THERE ARE ANY -- but
    // this catalog currently has ~0 paid orders, so bestsellers() came back
    // empty and RecommendedForYou (which renders null on an empty list)
    // made the whole rail vanish for every guest on the homepage. Falling
    // through instead reaches the same final "any in-stock published
    // product" tier the scored path below already uses, so the rail always
    // has content -- which is what this component's contract already
    // claimed. With no preferences every score is 0, so the scoring work
    // below is skipped naturally and only that last tier fills the list.
    // 2026-09-11: since getBestsellingProducts now backfills its empty slots
    // from the featured brands, returning it verbatim here printed the SAME
    // six cards twice on the homepage -- "Их зарагддаг" and "Танд санал
    // болгож байна" became identical rails stacked on each other. Asking for
    // twice the depth and taking the SECOND page keeps the same ranking logic
    // while guaranteeing the two rails never overlap; if the catalog is too
    // thin to fill both, fall back to the first page rather than nothing.
    const deep = await getBestsellingProducts(limit * 2);
    const second = deep.slice(limit);
    if (second.length >= Math.min(4, limit)) return second;
    if (deep.length) return deep.slice(0, limit);
  }

  const candidates = await db.select({
    id: products.id,
    categoryId: products.categoryId,
    name: products.name,
    nameMn: products.nameMn,
    slug: products.slug,
    brand: products.brand,
    shortDescription: products.shortDescription,
    priceMnt: products.priceMnt,
    compareAtPriceMnt: products.compareAtPriceMnt,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    categoryName: productCategories.name,
    categorySlug: productCategories.slug,
    skinType: products.skinType,
    skinConcerns: products.skinConcerns,
    hairType: products.hairType,
    hairConcerns: products.hairConcerns,
    fragrancePreference: products.fragrancePreference,
    wellnessInterests: products.wellnessInterests,
    interiorStyle: products.interiorStyle,
    // Санал болголт v3 (2026-09-20).
    skinTypes: products.skinTypes,
    productType: products.productType,
    bodySkinType: products.bodySkinType,
    bodyConcerns: products.bodyConcerns,
    kind: products.kind,
  }).from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), gte(products.stockQuantity, 1)));

  // v3 (2026-09-20): жин /admin → Дэлгүүрийн тохиргоо → "Санал болголт"-оос;
  // оноо + ЯАГААД (reasons) нэг функцээс; бэлгийн карт/хүнс/гэр ахуй профайлаар
  // санал болгогдохгүй (isEligibleForPreferenceRecommendation).
  const weights = await getRecoWeights();
  const scored = candidates
    .filter(isEligibleForPreferenceRecommendation)
    .map(product => {
      const explained = explainPreferenceMatch(product, preferences, weights);
      let score = explained.score;
      const affinity = categoryAffinity.get(product.categoryId);
      if (affinity) score += affinity * 2;
      score += scorePriceBandAffinity(product.priceMnt, avgHistoricalUnitPriceMnt);
      if (wishlistCategoryIds.has(product.categoryId)) score += 0.5;
      return { product: { ...product, reasons: explained.reasons }, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id);

  // maxPerCategory tightened 4->3 after a real QA run: with tag coverage
  // still thin catalog-wide, a single coarse signal (e.g. hasYoungChildren)
  // could otherwise fill most of the list from one category (see the
  // hasYoungChildren weight comment in scorePreferenceMatch). v3: төрлийн
  // хязгаар нэмэгдэв — 8 санал routine хэлбэртэй (8 маск биш).
  const diversified = applyDiversityCap(scored, { maxPerBrand: weights.maxPerBrand, maxPerCategory: weights.maxPerCategory, maxPerProductType: weights.maxPerProductType }).slice(0, limit);
  if (diversified.length >= Math.min(4, limit)) return diversified.map(entry => entry.product);

  // personalOnly (2026-09-21): "Танд зориулсан" rail-д ХЭЗЭЭ Ч дүүргэгч
  // (bestseller / дурын бараа) нэмэхгүй — зөвхөн профайлтай бодитоор таарсан,
  // "яагаад" чиптэй бараа. Өмнө нь зөвхөн "профайл огт хоосон" үед л ингэдэг
  // байсан (дээрх early return); профайл нь 4-өөс цөөн бараатай таарвал доорх
  // дүүргэгч хуурай арьстай хүнд тослог арьсны угаагч, төрлийн хязгаараас
  // илүү гурав дахь тос, "мэдрэмтгий" биеийн угаагчийг "танд зориулсан" гарчиг
  // дор харуулдаг байв. Бодит каталогт (984) энэ бараг тохиолддоггүй тул
  // локал тест ногоон, харин цэвэр схемтэй CI-д 3 тест унаж илэрсэн.
  if (personalOnly) return diversified.map(entry => entry.product);

  // Thin result — backfill remaining slots with bestsellers rather than
  // showing a near-empty rail.
  const alreadyIncluded = new Set(diversified.map(entry => entry.product.id));
  const fillers = (await bestsellers()).filter(product => !alreadyIncluded.has(product.id));
  fillers.forEach(product => alreadyIncluded.add(product.id));
  const combined = [...diversified.map(entry => entry.product), ...fillers];
  if (combined.length >= limit) return combined.slice(0, limit);

  // Real edge case found via post-apply QA (2026-09-01): a shopper whose
  // ONLY stated preference is a specific enum value most real products
  // aren't tagged with (e.g. hairType exactly "dry" -- most untagged hair
  // products default to "normal", see scripts/auto-tag-products.ts's tier
  // 2) can score 0 candidates, and this catalog currently has 0 paid
  // orders so bestsellers() is ALSO empty -- both fallback tiers thin at
  // once. Rather than a genuinely empty rail, fill remaining slots with
  // any other in-stock published candidates (no scoring claim attached).
  const anyFillers = candidates.filter(product => !alreadyIncluded.has(product.id)).slice(0, limit - combined.length);
  return [...combined, ...anyFillers].slice(0, limit);
}

// Preference Profile v2 (2026-09-01): ProductDetail's related-products rail
// -- deliberately a separate, smaller feature from getRecommendedProducts
// above (no concept of "the current user", works for an anonymous
// visitor). Reuses the same pure scorePreferenceMatch by treating the
// VIEWED product's own tags as if they were a "preference profile" to
// match other products against -- same scoring math, no separate logic to
// maintain. Public (no auth needed).
export async function getRelatedProducts(productId: number, limit = 6) {
  // 2026-09-14: cached like the other storefront reads (see STOREFRONT_CACHE_TTL_MS).
  return getOrSetCached(`storefront:related:${productId}:${limit}`, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];

    const viewedRows = await db.select({
      categoryId: products.categoryId,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
      interiorStyle: products.interiorStyle,
    }).from(products).where(eq(products.id, productId)).limit(1);
    const viewed = viewedRows[0];
    if (!viewed) return [];
    const viewedAsPreference: PreferenceProfile = viewed;

    const candidates = await db.select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      nameMn: products.nameMn,
      slug: products.slug,
      brand: products.brand,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
      categoryName: productCategories.name,
      categorySlug: productCategories.slug,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
      interiorStyle: products.interiorStyle,
    }).from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(eq(products.isPublished, true), gte(products.stockQuantity, 1)));

    // Same paid-order sold-quantity signal getBestsellingProducts uses, as a
    // tiebreaker only (ranked "by overlap then bestseller count" per plan).
    const soldQtyExpr = sql<number>`SUM(${orderItems.quantity})`;
    const soldRows = await db.select({ productId: orderItems.productId, soldQuantity: soldQtyExpr })
      .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(settledSaleSql).groupBy(orderItems.productId);
    const soldByProduct = new Map(soldRows.map(row => [row.productId, Number(row.soldQuantity)]));

    const scored = candidates
      .filter(candidate => candidate.id !== productId)
      .map(candidate => {
        let score = scorePreferenceMatch(candidate, viewedAsPreference);
        if (candidate.categoryId === viewed.categoryId) score += 1;
        return { product: candidate, score, sold: soldByProduct.get(candidate.id) ?? 0 };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.sold - a.sold || tiebreakHash(productId, a.product.id) - tiebreakHash(productId, b.product.id));

    if (scored.length >= Math.min(3, limit)) return scored.slice(0, limit).map(entry => entry.product);

    // Thin match (very likely today, given real tagging coverage) -- backfill
    // with other same-category products rather than showing a near-empty rail.
    const alreadyIncluded = new Set(scored.map(entry => entry.product.id));
    const sameCategoryFillers = candidates
      .filter(candidate => candidate.id !== productId && candidate.categoryId === viewed.categoryId && !alreadyIncluded.has(candidate.id))
      .sort((a, b) => tiebreakHash(productId, a.id) - tiebreakHash(productId, b.id))
      .slice(0, limit - scored.length);
    return [...scored.map(entry => entry.product), ...sameCategoryFillers].slice(0, limit);
  });
}

// Deterministic, per-viewed-product tiebreak for candidates that score
// identically -- extremely common today: most products still carry the same
// "normal"/null placeholder tags (see PRODUCT-IMPORT.md), so the category-match
// "+1" alone ties nearly an entire category together. Without this, both
// `.sort()` calls above are stable, so ties always fell back to raw,
// viewed-product-independent DB row order -- meaning almost every product in a
// category showed the exact same handful of "related" products (real bug,
// Tom, 2026-09-06: "most of them present these products"). This hash varies
// by (viewedProductId, candidateId), so ties resolve differently per product
// page, while staying 100% stable across repeat visits to the SAME page (no
// randomness, no flicker between renders, safely cacheable).
function tiebreakHash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 40503);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export async function getProductBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      brand: products.brand,
      shortDescription: products.shortDescription,
      description: products.description,
      priceMnt: products.priceMnt,
      compareAtPriceMnt: products.compareAtPriceMnt,
      sku: products.sku,
      imageUrl: products.imageUrl,
      galleryJson: products.galleryJson,
      stockQuantity: products.stockQuantity,
      kind: products.kind,
      ingredients: products.ingredients,
      netContent: products.netContent,
      countryOfOrigin: products.countryOfOrigin,
      shelfLifeMonths: products.shelfLifeMonths,
      categoryName: productCategories.name,
      categorySlug: productCategories.slug,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      interiorStyle: products.interiorStyle,
      nameMn: products.nameMn,
      productType: products.productType,
      searchKeywords: products.searchKeywords,
      avgRating: avgRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productReviews, eq(productReviews.productId, products.id))
    .where(and(eq(products.slug, slug), eq(products.isPublished, true)))
    .groupBy(products.id, productCategories.id)
    .limit(1);

  return result[0] ?? null;
}

/**
 * Resolves a scanned/typed barcode to the product page it should open
 * (2026-09-11, barcode scanning).
 *
 * Deliberately narrow: it returns only what the scan handler needs to
 * navigate and show a confirmation toast, NOT the full product payload --
 * the product page itself re-fetches through `getProductBySlug` the moment
 * it mounts, so returning the whole row here would just be a second copy
 * of the same data on the wire for every scan.
 *
 * `products.sku` is NOT NULL + UNIQUE, so this is an indexed single-row
 * fetch. Unpublished products resolve to null on purpose: a shopper
 * scanning a box on the shelf must not be sent to a page they cannot see,
 * and the caller can then say "not on the site" rather than 404.
 */
export async function getPublishedProductBySku(sku: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: products.id,
      name: products.name,
      nameMn: products.nameMn,
      slug: products.slug,
      brand: products.brand,
      sku: products.sku,
      priceMnt: products.priceMnt,
      imageUrl: products.imageUrl,
      stockQuantity: products.stockQuantity,
    })
    .from(products)
    .where(and(eq(products.sku, sku), eq(products.isPublished, true)))
    .limit(1);

  return result[0] ?? null;
}
