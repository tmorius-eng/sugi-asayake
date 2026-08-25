import sharp from "sharp";

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

/** Upper bound (longest edge, px) per upload surface — see processUploadedImage. */
export const IMAGE_MAX_DIMENSION = {
  /** Product gallery photos — viewed largest (zoomed detail shots). */
  product: 1600,
  /** Home hero/category/store banners — full browser width. */
  siteMedia: 1920,
  /** Profile avatar — always rendered small and circular. */
  avatar: 512,
} as const;
