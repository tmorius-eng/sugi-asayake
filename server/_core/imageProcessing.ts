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
  const pipeline = sharp(buffer).rotate().resize({
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
 * emits WebP (25-35% smaller than JPEG at the same quality, ~95% browser
 * support as of 2026) at two sizes, so components can offer a real srcset.
 *
 * `.webp` on the stored URL is what tells the rest of the app a derivative
 * exists — see shared/image-variants.ts for the naming convention and why
 * the extension (rather than a schema column) carries that signal.
 *
 * ALWAYS returns a grid buffer, even when the source is already at or below
 * the grid width (it reuses the full-size buffer in that case rather than
 * re-encoding identical pixels). An earlier revision returned null there to
 * save a little storage -- that broke the invariant the whole design rests
 * on: shared/image-variants.ts derives the grid URL from the `.webp`
 * extension alone, so "sometimes there is no grid object" means a srcset
 * candidate that 404s, which renders as a broken image with no fallback.
 * A `.webp` URL must therefore ALWAYS have its `-600w.webp` sibling.
 */
export async function processUploadedImageVariants(
  buffer: Buffer,
  maxDimension: number,
): Promise<{ full: Buffer; grid: Buffer }> {
  const base = sharp(buffer).rotate();
  const { width, height } = await base.metadata();
  const longestEdge = Math.max(width ?? 0, height ?? 0);

  const full = await base
    .clone()
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (longestEdge && longestEdge <= GRID_VARIANT_WIDTH) return { full, grid: full };

  const grid = await base
    .clone()
    .resize({ width: GRID_VARIANT_WIDTH, height: GRID_VARIANT_WIDTH, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return { full, grid };
}

/** Upper bound (longest edge, px) per upload surface — see processUploadedImage. */
export const IMAGE_MAX_DIMENSION = {
  /** Product gallery photos — viewed largest (zoomed detail shots). */
  product: 1600,
  /** Home hero/category/store banners — full browser width. */
  siteMedia: 1920,
  /** Profile avatar — always rendered small and circular. */
  avatar: 512,
} as const;
