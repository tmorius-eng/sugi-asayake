import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { classifyImageSafety, PORN_THRESHOLD, SEXY_THRESHOLD } from "./_core/imageSafety";

/**
 * Proves the model actually loads from the npm package and scores an image
 * on the pure-JS backend -- classifyImageSafety refuses uploads when the
 * model is missing, so a broken install would block every avatar upload.
 * No explicit test images are shipped, for obvious reasons; a neutral
 * synthetic photo must pass and the score vector must be well-formed.
 */
describe("classifyImageSafety", () => {
  it("loads the bundled model and passes a neutral image", { timeout: 60_000 }, async () => {
    const neutral = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 120, g: 160, b: 90 } } })
      .composite([{ input: await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 230, g: 230, b: 230 } } }).png().toBuffer(), left: 120, top: 80 }])
      .jpeg()
      .toBuffer();
    const verdict = await classifyImageSafety(neutral);
    const total = Object.values(verdict.scores).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
    expect(verdict.allowed).toBe(true);
  });

  it("thresholds are sane", () => {
    expect(PORN_THRESHOLD).toBeGreaterThan(0.3);
    expect(PORN_THRESHOLD).toBeLessThan(SEXY_THRESHOLD);
  });
});
