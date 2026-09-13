/**
 * Stale-build detection (2026-09-13).
 *
 * Every deploy renames the code-split chunks (ProductDetail-BJW-G6rc.js →
 * ProductDetail-<new hash>.js) and the old files are gone. A browser tab that
 * was open BEFORE the deploy still holds the old index.js, which points at
 * the old chunk names; the first navigation that needs one -- on the shop's
 * counter laptop that is the barcode gun opening a product page -- fails
 * with a module-load error, React's lazy() throws, and the error boundary
 * shows a stack trace mentioning "ProductDetail-….js". Reloading fixes it
 * because the reload fetches the new index.js. Tom hit exactly this after
 * a day of six deploys ("products tsx gej aldaa zaagaad reload hiisen chine
 * zugeer").
 *
 * Browsers word the failure differently; this is the union of the messages
 * Chrome, Firefox, Safari and Vite's own preload helper produce.
 */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's CSS preload helper
  /loading (css )?chunk [\w-]+ failed/i, // webpack-style, kept for safety
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "";
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/** sessionStorage key that records "this tab already reloaded once for a
 *  stale chunk", so a genuinely broken deploy loops at most once instead of
 *  forever. */
export const CHUNK_RELOAD_FLAG = "sugi:chunk-reloaded";
