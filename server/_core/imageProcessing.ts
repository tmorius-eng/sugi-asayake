import sharp from "sharp";
import { GRID_VARIANT_WIDTH } from "../../shared/image-variants";

/**
 * Every image the app stores (product photos, site media, avatars) was
 * previously saved byte-for-byte exactly as uploaded — a phone photo could
 * land in the bucket at 4000x3000px and several MB, shipped to every
 * visitor's browser unchanged (ROADMAP.md TIER 2: "Зурган боловсруулалт
 * байхгүй"). This resizes to a sane upper bound and re-compresses at a
 * fixed quality, in the SAME format the caller already validated via
 * assertImageSignature — callers don't need to change their extension/
 * contentType logic, only swap the raw buffer for this function's output.
 *
 * `withoutEnlargement: true` means a small source image is never upscaled,
 * only ever shrunk; `.rotate()` (no args) auto-applies the image's EXIF
 * orientation and then strips it, so a portrait phone photo doesn't render
 * sideways once EXIF metadata is otherwise dropped by re-encoding.
 */
export async function processUploadedImage(
  buffer: Buffer,
  contentType: "image/jpeg" | "image/png" | "image/webp",
  maxDimension: number,
): Promise<Buffer> {
  const pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize({
    width: maxDimension,
    height: maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  });
  if (contentType === "image/jpeg") return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (contentType === "image/webp") return pipeline.webp({ quality: 82 }).toBuffer();
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Frontend performance audit (2026-09-02): processUploadedImage above keeps
 * the uploaded format, so a phone JPEG stayed a JPEG and one fixed size was
 * served everywhere — a 1600px photo shipped to a ~300px grid card. This
 * emits WebP at two sizes, so components can offer a real srcset.
 *
 * `.webp` on the stored URL is what tells the rest of the app a derivative
 * exists — see shared/image-variants.ts for the naming convention and why
 * the extension (rather than a schema column) carries that signal.
 *
 * ALWAYS returns a grid buffer, even when the source is already at or below
 * the grid width (it reuses the full-size buffer in that case rather than
 * re-encoding identical pixels). A `.webp` URL must therefore ALWAYS have its
 * `-600w.webp` sibling — shared/image-variants.ts derives the grid URL from
 * the extension alone, so a missing grid object is a broken image.
 *
 * ── Формат нь агуулгаас хамаарна (2026-09-21, Tom-ийн зургийн framework) ──
 *
 *   photo     (тунгалаг давхаргагүй, хөдөлгөөнгүй) → WebP q82 + AVIF q60,
 *             хоёр хэмжээгээр. AVIF нь сайтын өөрийн зураг дээр WebP-ээс
 *             ~30% жижиг (hero 600w: 76 -> 53 KB); q50 нь жижиг текстийг
 *             бүдгэрүүлдэг байсныг 2x томруулж нүдээр харсан тул q60.
 *   graphic   (alpha-тай: лого, тайрсан бараа, текст/шугамтай зураг) →
 *             lossless эсвэл q90 WebP-ийн аль жижиг нь. Lossy AVIF нь
 *             үсгийн ирмэгийг будлиулдаг тул AVIF ҮҮСГЭХГҮЙ.
 *   animated  (GIF/хөдөлгөөнт WebP) → animated WebP. AVIF хувилбар байвал
 *             <picture> түүнийг сонгож хөдөлгөөнийг зогсооно — тиймээс ҮҮСГЭХГҮЙ.
 *
 * AVIF хувилбар нь ЗААВАЛ БИШ (graphic/animated-д байхгүй, хуучин upload-д
 * backfill хүртэл байхгүй) — ResponsivePicture нь <source type="image/avif">
 * ачаалагдахгүй бол WebP руу өөрөө буцдаг.
 *
 * SVG-г ЗОРИУД хүлээн авахгүй: SVG дотор script байж болох бөгөөд /cdn/-ээр
 * манай origin-оос үйлчилбэл XSS-ийн хаалга болно. Лого вектор эхтэй бол
 * client/public-д шалгасан файл болгон commit хийнэ (upload биш).
 */
export type ImageKind = "photo" | "graphic" | "animated";

export type ImageVariants = {
  full: Buffer;
  grid: Buffer;
  /** Present for photos only (see above). */
  fullAvif?: Buffer;
  gridAvif?: Buffer;
  kind: ImageKind;
};

/** AVIF quality chosen by eye on the site's own images (see comment above). */
export const AVIF_QUALITY = 60;

/**
 * sharp-ийн анхдагч хязгаар 268 мегапиксел — жижиг файлд шахсан "decompression bomb" зураг
 * санах ойг үрэх боломжтой. 50 МП нь утасны 48/50 МП бүтэн зургийг багтаана (40 МП нь
 * iPhone-ийн 48 МП зургийг "гэмтсэн" гэж татгалзаж байсан — 2026-10-01 шалгалт).
 */
export const MAX_INPUT_PIXELS = 50e6;

/** sharp-ийн "Input image exceeds pixel limit" алдааг таних — хэрэглэгчид тодорхой мессеж өгөхөд. */
export function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

export const PIXEL_LIMIT_MESSAGE = `Зураг хэт том байна (${MAX_INPUT_PIXELS / 1e6} мегапикселээс их). Камерын нягтралыг багасгах эсвэл зургаа жижгэрүүлээд дахин оруулна уу.`;

export type ImageVariantOptions = {
  /**
   * Хөдөлгөөнт (GIF/WebP) зургийг ЗӨВХӨН эхний кадраар хөрвүүлнэ. Сэтгэгдлийн зураг:
   * imageSafety.classifyImageSafety нь зөвхөн эхний кадрыг шалгадаг тул хадгалах зураг нь
   * яг шалгасан кадр байх ёстой (эс бөгөөс 2-р кадраас цааш шалгагдаагүй агуулга орно).
   */
  flattenAnimation?: boolean;
};

export async function processUploadedImageVariants(
  buffer: Buffer,
  maxDimension: number,
  options: ImageVariantOptions = {},
): Promise<ImageVariants> {
  const flatten = options.flattenAnimation === true;
  const inputOptions = { limitInputPixels: MAX_INPUT_PIXELS };
  const animatedInputOptions = { animated: true, limitInputPixels: MAX_INPUT_PIXELS };
  const probe = await sharp(buffer, flatten ? inputOptions : animatedInputOptions).metadata();
  const animated = !flatten && (probe.pages ?? 1) > 1;
  // Олон PNG зураг alpha СУВАГТАЙ боловч бүрэн тунгалаг бус (утасны
  // screenshot, экспортолсон зураг). Сувагтай эсэхийг биш, үнэхээр
  // ТУНГАЛАГ пиксел байгаа эсэхийг шалгана — эс бөгөөс энгийн зураг
  // "graphic" болж AVIF-гүй үлдэнэ.
  const transparent = !animated && probe.hasAlpha ? !(await sharp(buffer, inputOptions).stats()).isOpaque : false;
  const kind: ImageKind = animated ? "animated" : transparent ? "graphic" : "photo";

  // `animated: true` keeps every frame; `.rotate()` is skipped for animations
  // (EXIF orientation is a still-photo concept and rotate() flattens frames).
  const base = animated ? sharp(buffer, animatedInputOptions) : sharp(buffer, inputOptions).rotate();
  const { width, height } = animated ? { width: probe.width, height: probe.pageHeight ?? probe.height } : await base.metadata();
  const longestEdge = Math.max(width ?? 0, height ?? 0);
  const fits = (limit: number) => ({ width: limit, height: limit, fit: "inside" as const, withoutEnlargement: true });

  const encodeWebp = async (limit: number, quality: number) => {
    const sized = base.clone().resize(fits(limit));
    if (kind !== "graphic") return sized.webp({ quality }).toBuffer();
    // Graphics: whichever is smaller of exact (lossless) and near-exact.
    const [lossless, high] = await Promise.all([
      sized.clone().webp({ lossless: true, effort: 5 }).toBuffer(),
      sized.clone().webp({ quality: 90, alphaQuality: 100 }).toBuffer(),
    ]);
    return lossless.length <= high.length ? lossless : high;
  };
  const encodeAvif = (limit: number) => base.clone().resize(fits(limit)).avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();

  const full = await encodeWebp(maxDimension, 82);
  const small = longestEdge && longestEdge <= GRID_VARIANT_WIDTH;
  const grid = small ? full : await encodeWebp(GRID_VARIANT_WIDTH, 80);

  if (kind !== "photo") return { full, grid, kind };

  const fullAvif = await encodeAvif(maxDimension);
  const gridAvif = small ? fullAvif : await encodeAvif(GRID_VARIANT_WIDTH);
  return { full, grid, fullAvif, gridAvif, kind };
}

/** Upper bound (longest edge, px) per upload surface — see processUploadedImage. */
export const IMAGE_MAX_DIMENSION = {
  /** Product gallery photos — viewed largest (zoomed detail shots). */
  product: 1600,
  /** Home hero/category/store banners — full browser width. */
  siteMedia: 1920,
  /** Profile avatar — always rendered small and circular. */
  avatar: 512,
  /** Customer review photo (2026-09-21) — a thumbnail in the thread, opened in the lightbox. */
  review: 1280,
} as const;
