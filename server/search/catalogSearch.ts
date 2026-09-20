import { getOrSetCached } from "../_core/ttlCache";
import { getPublishedCatalogCached, searchPublishedCatalogFulltext } from "../db";
import { getBrandAliasMap, getSynonymDictionary } from "./dictionaries";
import { buildCatalogIndex, runCatalogSearch, type CatalogIndex, type SearchOutcome } from "./catalogSearchIndex";
import { CATALOG_INDEX_CACHE_KEY } from "./cacheKeys";

/**
 * Хайлтын индексийн кэш ба hydrate давхарга (2026-09-20, хайлт v3).
 *
 * Индекс = кэшлэсэн каталогийн мөрүүд (getPublishedCatalogCached, аль хэдийн
 * avgRating/reviewCount-тэй) + DB-ийн толь + брэндийн alias → MiniSearch.
 * Нэг түлхүүрт нэг л тооцоолол (ttlCache single-flight); бараа/ангилал/толь
 * бичигч бүр түлхүүрийг унагаадаг тул admin-ий засвар дараагийн хайлтад
 * шууд тусна. Cluster-д worker бүр өөрийнхөө индексийг барина (≤60 с хоцрол —
 * clusterRole.ts-д баримтжуулсан ижил загвар).
 */
const CATALOG_INDEX_TTL_MS = 60_000;

export async function getCatalogIndexCached(): Promise<CatalogIndex> {
  return getOrSetCached(CATALOG_INDEX_CACHE_KEY, CATALOG_INDEX_TTL_MS, async () => {
    const startedAt = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    const [rows, dictionary, aliases] = await Promise.all([getPublishedCatalogCached(), getSynonymDictionary(), getBrandAliasMap()]);
    const index = buildCatalogIndex({ rows, dictionary, aliases });
    const heapDelta = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
    // VM-ийн RAM хатуу (954 MB, pm2 700 MB хязгаар) тул бүтэц бүр өөрийн
    // зардлаа хэвлэнэ — AUDIT-2026-09-20 §4.1-ийн "хэмжээгүй санах ой" сургамж.
    console.log(`[search] index built: ${index.documentCount} products in ${Math.round(performance.now() - startedAt)} ms, heap +${heapDelta.toFixed(1)} MB`);
    return index;
  });
}

export type CatalogSearchRow = Awaited<ReturnType<typeof getPublishedCatalogCached>>[number];

export type CatalogSearchResult = {
  products: CatalogSearchRow[];
  outcome: SearchOutcome;
};

/** Индексийн id-уудыг кэшлэсэн каталогийн мөрөөр (харуулах бүх талбартай) солино. */
export async function searchCatalog(query: string, options: { limit?: number } = {}): Promise<CatalogSearchResult> {
  const [index, rows] = await Promise.all([getCatalogIndexCached(), getPublishedCatalogCached()]);
  const outcome = runCatalogSearch(index, query, options);
  const byId = new Map(rows.map(row => [row.id, row]));
  const products: CatalogSearchRow[] = [];
  for (const hit of outcome.hits) {
    const row = byId.get(hit.id);
    if (row) products.push(row);
  }
  return { products, outcome };
}

/**
 * catalog.search-ийн хуучин гэрээ: мөрийн массив, ≤200. `SEARCH_ENGINE=fulltext`
 * env нь хуучин MySQL FULLTEXT замыг сэргээнэ (`pm2 restart --update-env`) —
 * store setting биш, учир нь энэ бол хамгийн халуун public endpoint.
 */
export async function searchPublishedCatalog(query: string): Promise<CatalogSearchRow[]> {
  if (process.env.SEARCH_ENGINE === "fulltext") return searchPublishedCatalogFulltext(query);
  return (await searchCatalog(query, { limit: 200 })).products;
}

/** Толгойн хайлтын санал: цөөн бараа + брэнд/ангиллын мөр + "та … хайсан уу". */
export async function suggestPublishedCatalog(query: string, limit = 6) {
  const { products, outcome } = await searchCatalog(query, { limit: 200 });
  return {
    products: products.slice(0, limit),
    resultCount: products.length,
    mode: outcome.mode,
    normalised: outcome.normalised,
    brandMatches: outcome.brandMatches,
    categoryMatches: outcome.categoryMatches,
    didYouMean: outcome.didYouMean,
  };
}

/**
 * Boot-д индексийг урьдчилан барина — эхний хайлт каталогийн query + build-ийн
 * зардлыг төлөхгүй. Production-д хэдэн секунд хойшлуулна: HeatWave-ийн boot
 * дээрх холболтын багц (моделууд, scheduler) дуусаг.
 */
export function warmCatalogSearchIndex(delayMs = 0): void {
  const timer = setTimeout(() => {
    getCatalogIndexCached().catch(error => console.warn("[search] index warm-up failed:", error instanceof Error ? error.message : error));
  }, delayMs);
  timer.unref();
}
