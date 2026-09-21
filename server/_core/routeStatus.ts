import { getProductBySlug, getPublishedPostBySlug, getPublishedRoutineBySlug } from "../db";
import { getOrSetCached } from "./ttlCache";

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

/** 200 when the path is a page that exists, 404 otherwise. Never throws: a lookup failure answers 200 (never hide a real page because the DB blinked). */
export async function resolveRouteStatus(pathname: string): Promise<200 | 404> {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (STATIC_ROUTES.has(path)) return 200;
  if (path === "/404") return 404;
  const product = path.match(productPath);
  const routine = !product && path.match(routinePath);
  const post = !product && !routine && path.match(postPath);
  if (!product && !routine && !post) return 404;
  try {
    return await getOrSetCached(`routeStatus:${path}`, CACHE_TTL_MS, async () => {
      if (product) return (await getProductBySlug(product[1])) ? 200 : 404;
      if (routine) return (await getPublishedRoutineBySlug(routine[1])) ? 200 : 404;
      return (await getPublishedPostBySlug((post as RegExpMatchArray)[1])) ? 200 : 404;
    });
  } catch (error) {
    console.error(`[route-status] lookup failed for ${path}; answering 200`, error);
    return 200;
  }
}
