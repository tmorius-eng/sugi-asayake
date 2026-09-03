/**
 * Frontend performance audit (2026-09-02): every stored image was served at
 * one fixed size, in whatever format was uploaded -- a 1600px product photo
 * shipped to a ~300px-wide grid card, as JPEG/PNG. On Mongolia's median
 * mobile connection (17 Mbps, 92ms latency -- well under the 33.9 Mbps
 * global median) a 24-card /shop page is by far the heaviest thing the site
 * sends, so this is where responsive images pay off most.
 *
 * Naming convention (single source of truth for BOTH the upload pipeline in
 * server/_core/imageProcessing.ts + server/storage.ts AND the components
 * that render srcset):
 *
 *   full : catalog/products/12/name_a1b2c3d4.webp
 *   grid : catalog/products/12/name_a1b2c3d4-600w.webp
 *
 * The `.webp` extension IS the signal that a grid derivative exists. Images
 * uploaded before this shipped are `.jpg`/`.png` and have no sibling, so
 * gridVariantUrl() returns null for them and callers fall back to a plain
 * single-source <img> -- exactly today's behavior, with no risk of a 404'd
 * srcset candidate (a browser that picks a missing candidate shows a broken
 * image; there is no graceful degradation once a candidate is listed). That
 * makes the migration safely incremental: a product moves to responsive
 * images the moment its photo is re-uploaded or backfilled, never before.
 */

/** Longest edge (px) of the small derivative -- see IMAGE_MAX_DIMENSION for the full size. */
export const GRID_VARIANT_WIDTH = 600;

const GRID_VARIANT_SUFFIX = `-${GRID_VARIANT_WIDTH}w`;
const DERIVATIVE_EXTENSION = ".webp";

/** Storage key/URL of the small derivative for a full-size one. Server-side counterpart of gridVariantUrl. */
export function gridVariantKey(fullKey: string): string {
  return `${fullKey.slice(0, -DERIVATIVE_EXTENSION.length)}${GRID_VARIANT_SUFFIX}${DERIVATIVE_EXTENSION}`;
}

/**
 * The small derivative's URL for a stored image, or null when this image
 * predates the derivative pipeline (any non-.webp URL) and therefore has no
 * sibling to point at.
 */
export function gridVariantUrl(url: string | null | undefined): string | null {
  if (!url || !url.endsWith(DERIVATIVE_EXTENSION)) return null;
  if (url.endsWith(`${GRID_VARIANT_SUFFIX}${DERIVATIVE_EXTENSION}`)) return url;
  return gridVariantKey(url);
}

/**
 * `srcset` for an image that may or may not have a derivative -- null when
 * it doesn't, so callers can spread it into JSX and let the attribute be
 * omitted entirely rather than emitting a single-candidate srcset.
 */
export function imageSrcSet(url: string | null | undefined, fullWidth: number): string | null {
  const grid = gridVariantUrl(url);
  if (!grid || !url || grid === url) return null;
  return `${grid} ${GRID_VARIANT_WIDTH}w, ${url} ${fullWidth}w`;
}
