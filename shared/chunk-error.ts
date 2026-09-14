/**
 * Хуучирсан build илрүүлэлт (2026-09-13).
 *
 * Deploy бүр code-split chunk-уудын нэрийг сольдог (ProductDetail-BJW-G6rc.js →
 * ProductDetail-<шинэ hash>.js), хуучин файлууд алга болно. Deploy-оос ӨМНӨ нээгдсэн
 * хөтчийн tab хуучин chunk нэрүүд рүү заасан хуучин index.js-ээ барьсаар; аль нэг
 * хэрэгтэй болох эхний navigation — дэлгүүрийн лангууны лаптоп дээр баркод сканнер
 * барааны хуудас нээх — module-load алдаагаар унаж, React-ийн lazy() throw хийж,
 * error boundary "ProductDetail-….js" дурдсан stack харуулна. Reload засдаг, учир
 * нь шинэ index.js татагдана. Tom яг үүнийг 6 deploy-той өдрийн дараа хэлсэн
 * ("products tsx gej aldaa zaagaad reload hiisen chine zugeer").
 *
 * Хөтчүүд алдааг өөр өөрөөр хэлдэг; энэ нь Chrome, Firefox, Safari, Vite-ийн өөрийн
 * preload helper-ийн мессежүүдийн нэгдэл.
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
