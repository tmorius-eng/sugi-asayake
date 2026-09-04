import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processUploadedImage, processUploadedImageVariants } from "./imageProcessing";
import { GRID_VARIANT_WIDTH } from "../../shared/image-variants";

// Builds a synthetic oversized JPEG in-memory (a gradient, not a solid
// color, so the encoder can't trivially compress it to nothing — a real
// stress test for the resize+recompress pipeline, not a fixture file).
async function makeOversizedJpeg(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = (i * 7) % 256;
    pixels[i * 3 + 1] = (i * 13) % 256;
    pixels[i * 3 + 2] = (i * 29) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

describe("processUploadedImage", () => {
  it("shrinks an oversized JPEG down to the max dimension and reduces file size", async () => {
    const original = await makeOversizedJpeg(3000, 2000);
    const processed = await processUploadedImage(original, "image/jpeg", 1600);

    const meta = await sharp(processed).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe("jpeg");
    // The whole point: a phone-camera-sized photo should end up meaningfully
    // smaller on disk, not just resized-but-still-huge.
    expect(processed.length).toBeLessThan(original.length);
  });

  it("never upscales an image already smaller than the cap", async () => {
    const small = await makeOversizedJpeg(200, 150);
    const processed = await processUploadedImage(small, "image/jpeg", 1600);
    const meta = await sharp(processed).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("preserves PNG format for images that need transparency", async () => {
    const png = await sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const processed = await processUploadedImage(png, "image/png", 800);
    const meta = await sharp(processed).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(meta.hasAlpha).toBe(true);
  });

  it("preserves WebP format", async () => {
    const webp = await makeOversizedJpeg(1000, 1000).then(jpeg => sharp(jpeg).webp().toBuffer());
    const processed = await processUploadedImage(webp, "image/webp", 500);
    const meta = await sharp(processed).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(500);
  });
});

// Frontend performance audit (2026-09-02): both emitted sizes for the
// srcset pipeline (shared/image-variants.ts).
describe("processUploadedImageVariants", () => {
  it("emits a full-size WebP capped at maxDimension and a grid WebP capped at GRID_VARIANT_WIDTH", async () => {
    const original = await makeOversizedJpeg(3000, 2000);
    const { full, grid } = await processUploadedImageVariants(original, 1600);

    const fullMeta = await sharp(full).metadata();
    expect(fullMeta.format).toBe("webp");
    expect(fullMeta.width).toBeLessThanOrEqual(1600);

    const gridMeta = await sharp(grid).metadata();
    expect(gridMeta.format).toBe("webp");
    expect(gridMeta.width).toBeLessThanOrEqual(GRID_VARIANT_WIDTH);
    expect(grid.length).toBeLessThan(full.length);
  });

  it("regression: always returns a real grid buffer, even for a source already at or below GRID_VARIANT_WIDTH", async () => {
    // A real gap found post-apply (2026-09-02): an earlier revision
    // returned `grid: null` here on the theory that a same-size second copy
    // buys nothing -- but shared/image-variants.ts's gridVariantUrl()
    // derives the grid URL from the `.webp` extension ALONE, with no way to
    // know a given image opted out. That produced a srcset candidate with
    // no backing object (a live 404 confirmed on 224 of 529 already-stored
    // images before this was caught and repaired). The contract this test
    // guards: `.webp` implies a working grid sibling, no exceptions.
    const small = await makeOversizedJpeg(400, 300);
    const { grid } = await processUploadedImageVariants(small, 1600);
    expect(grid).toBeTruthy();
    expect(grid.length).toBeGreaterThan(0);
    const gridMeta = await sharp(grid).metadata();
    expect(gridMeta.width).toBe(400);
  });
});
