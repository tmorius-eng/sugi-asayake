import { getProductBySlug, getPublishedPostBySlug, getPublishedRoutineBySlug } from "../db";


/**
 * HTTP status for a storefront HTML request (2026-09-21).
 *
 * The SPA fallback used to answer EVERY path with 200 + index.html, so a typo
 * (`/shopp`), a deleted post or a removed product was a "soft 404": search
 * engines index it as a real page and SEO audits flag it. The page the shopper
 * sees does not change (React still renders the brand 404 / "product not
 * found" screen from the same HTML); only the status line tells crawlers the
 * truth.
 *
 * ⚠️ STATIC_ROUTES must match client/src/App.tsx's <Route path> list —
 * server/route-status.test.ts reads App.tsx and fails if they drift apart.
 * A new page needs its path here too, or it would be served with 404.
 */
export const STATIC_ROUTES: ReadonlySet<string> = new Set([
  "/", "/shop", "/orders", "/profile", "/checkout", "/admin", "/login", "/forgot-password", "/face-approve",
  "/track-order", "/privacy", "/terms", "/returns", "/about", "/careers", "/help", "/journal", "/brands",
  "/__admin-preview",
]);

const SLUG = "[A-Za-z0-9._~-]+";
const productPath = new RegExp(`^/product/(${SLUG})$`);
const routinePath = new RegExp(`^/routine/(${SLUG})$`);
const postPath = new RegExp(`^/(${SLUG})$`);
const CACHE_TTL_MS = 60_000;
/**
 * Олдсон замууд (2026-09-23). Зөвхөн БОДИТ хуудсыг санана — 404-ийг
 * кэшлэхгүй тул хэрэглэгчийн оруулсан дурын зам санах ойд хуримтлагдахгүй.
 * Хэмжээгээр хязгаарлагдсан.
 */
const MAX_REMEMBERED_HITS = 2_000;
const hitCache = new Map<string, number>();

function getCachedIfFresh(path: string): 200 | null {
  const at = hitCache.get(path);
  if (at === undefined) return null;
  if (Date.now() - at > CACHE_TTL_MS) { hitCache.delete(path); return null; }
  return 200;
}

function rememberHit(path: string): void {
  if (hitCache.size >= MAX_REMEMBERED_HITS) {
    const oldest = hitCache.keys().next().value;
    if (oldest !== undefined) hitCache.delete(oldest);
  }
  hitCache.set(path, Date.now());
}

/** 200 when the path is a page that exists, 404 otherwise. Never throws: a lookup failure answers 200 (never hide a real page because the DB blinked). */
export async function resolveRouteStatus(pathname: string): Promise<200 | 404> {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (STATIC_ROUTES.has(path)) return 200;
  if (path === "/404") return 404;
  const product = path.match(productPath);
  const routine = !product && path.match(routinePath);
  const post = !product && !routine && path.match(postPath);
  if (!product && !routine && !post) return 404;
  // 2026-09-23: 404-ийг КЭШЛЭХГҮЙ. Кэшийн түлхүүр хэрэглэгчийн замаас
  // бүтдэг тул бот `/a1`, `/a2`, … гэж шалгахад entry тус бүр хуримтлагдаж
  // байв (ttlCache-ийн MAX_ENTRIES-ийн тайлбарыг үз). Олдсон хуудсыг л
  // кэшлэх нь давтагдах бодит траффикийн ачааллыг хэвээр хэмнэнэ.
  try {
    const cached = getCachedIfFresh(path);
    if (cached) return cached;
    const status: 200 | 404 = product
      ? ((await getProductBySlug(product[1])) ? 200 : 404)
      : routine
        ? ((await getPublishedRoutineBySlug(routine[1])) ? 200 : 404)
        : ((await getPublishedPostBySlug((post as RegExpMatchArray)[1])) ? 200 : 404);
    if (status === 200) rememberHit(path);
    return status;
  } catch (error) {
    console.error(`[route-status] lookup failed for ${path}; answering 200`, error);
    return 200;
  }
}
