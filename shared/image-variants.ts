/**
 * Frontend гүйцэтгэлийн аудит (2026-09-02): хадгалагдсан зураг бүр нэг тогтмол
 * хэмжээгээр, upload хийсэн форматаараа serve хийгдэж байв — 1600px барааны зураг
 * ~300px grid картад JPEG/PNG-ээр. Монголын дундаж мобайл холболтод (17 Mbps, 92мс
 * latency — дэлхийн дундаж 33.9 Mbps-ээс хол доогуур) 24 карттай /shop хуудас сайтын
 * илгээдэг хамгийн хүнд зүйл тул responsive зураг энд хамгийн их үр дүнтэй.
 *
 * Нэрлэлтийн конвенц (upload pipeline server/_core/imageProcessing.ts + server/
 * storage.ts БА srcset зурдаг компонентуудын нэг эх сурвалж):
 *
 *   full : catalog/products/12/name_a1b2c3d4.webp
 *   grid : catalog/products/12/name_a1b2c3d4-600w.webp
 *
 * `.webp` өргөтгөл grid derivative байгаагийн ДОХИО. Үүнээс өмнө upload хийгдсэн
 * зураг `.jpg`/`.png` бөгөөд хамт зураггүй тул gridVariantUrl() null буцааж дуудагч
 * энгийн нэг эх сурвалжтай <img> рүү буцна — яг өнөөдрийн зан төлөв, 404 өгөх srcset
 * candidate-ийн эрсдэлгүй (дутуу candidate сонгосон хөтөч эвдэрсэн зураг харуулна;
 * candidate жагсаагдсаны дараа зөөлөн буулт байхгүй). Энэ нь migration-ийг аюулгүй
 * алхам алхмаар болгоно: бараа зургаа дахин upload эсвэл backfill хийгдмэгц л
 * responsive зурагт шилжинэ, өмнө нь хэзээ ч биш.
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

/**
 * Нүүрний hero хавтангийн `sizes` (2026-09-21). CSS: `.hero-rail-slide` нь
 * ≤760px-д min(450px, 82vw), бусад үед min(450px, 74vw).
 *
 * ХОЁР газар хэрэглэгдэнэ, заавал ИЖИЛ байх ёстой: `<img>` (HeroImageSlideshow)
 * ба серверийн `<link rel="preload" imagesrcset imagesizes>` (indexHtml.ts).
 * Зөрвөл хөтөч preload-оор нэг файл, `<img>`-ээр өөр файл татаж, hero-г хоёр
 * удаа татна — хурдасгах гэсэн засвар удаашруулна.
 */
export const HERO_IMAGE_SIZES = "(max-width: 760px) 82vw, 450px";
/** Hero-ийн эх файлын өргөний дээд хязгаар (admin upload-ууд 1920px хүртэл). */
export const HERO_FULL_WIDTH = 1920;

/**
 * AVIF хувилбарын нэр (2026-09-21): WebP-тэй ижил, зөвхөн өргөтгөл нь `.avif`.
 * `x.webp` -> `x.avif`, `x-600w.webp` -> `x-600w.avif`.
 *
 * ⚠️ WebP-ийн -600w-ээс ЯЛГААТАЙ нь AVIF нь ЗААВАЛ БИШ: зөвхөн "photo" төрлийн
 * upload-д үүсдэг (лого/тунгалаг/хөдөлгөөнт зурагт байхгүй), хуучин зурагт
 * backfill хийгдтэл байхгүй. Тиймээс энэ URL-ийг ЗӨВХӨН ResponsivePicture-ийн
 * <source> дотор ашиглана — тэр нь ачаалагдахгүй бол WebP руу буцдаг.
 */
export function avifVariantKey(webpKey: string): string {
  return webpKey.endsWith(DERIVATIVE_EXTENSION) ? `${webpKey.slice(0, -DERIVATIVE_EXTENSION.length)}.avif` : webpKey;
}

export function avifSrcSet(url: string | null | undefined, fullWidth: number): string | null {
  const grid = gridVariantUrl(url);
  if (!grid || !url || grid === url) return null;
  return `${avifVariantKey(grid)} ${GRID_VARIANT_WIDTH}w, ${avifVariantKey(url)} ${fullWidth}w`;
}

/** Барааны хуудасны гол зураг (ProductDetail): ≥1024px-д 55vw, түүнээс доош бүтэн өргөн.
 *  `<picture>` ба серверийн preload (routeMeta.ts) хоёр ИЖИЛ утгыг ашиглана. */
export const PRODUCT_MAIN_IMAGE_SIZES = "(min-width: 1024px) 55vw, 100vw";
/** Барааны зургийн хадгалах дээд өргөн (IMAGE_MAX_DIMENSION.product). */
export const PRODUCT_FULL_WIDTH = 1600;
